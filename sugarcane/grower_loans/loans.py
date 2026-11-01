"""Grower loans (Phase 6).

Loan        applied (Draft) → approved (submitted, Cane Manager) → disbursed: Journal Entry Dr Grower Loan Receivable
            (party Grower) · Cr the bank. Limits: the loan type's largest loan and largest loan per surveyed acre.
Recovery    at every CPR (Sugar Settings → recover loans): from each open loan, oldest first, up to the type's % of the CPR's
            net amount after TPT — the CPR formula caps the total so the grower is never paid a negative amount. The CPR's
            own Journal Entry carries the line Cr Grower Loan Receivable; a Grower Loan Entry (Recovery) records the share of
            each loan. Cancelling the CPR removes them.
Markup      monthly: outstanding × markup % ÷ 365 × days in the month (from the disbursement in its first month); one
            Journal Entry for the month: Dr Grower Loan Receivable (party each grower) · Cr Loan Markup Income.
Cash        a repayment at the counter: Dr bank / cash · Cr Grower Loan Receivable. Write-off: Dr bad debts · Cr receivable.
Outstanding loan + markup − recoveries − repayments − write-offs.
"""

import calendar
from datetime import date

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_last_day, getdate, nowdate

MANAGERS = {"System Manager", "Cane Manager", "Cane Admin"}
ACCOUNTANTS = {"System Manager", "Cane Admin", "Cane Accountant"}


def _need(roles, what):
	if not roles & set(frappe.get_roles()):
		frappe.throw(_("You are not allowed to {0}").format(what), frappe.PermissionError)


def _s():
	return frappe.get_cached_doc("Sugar Settings")


def surveyed_acres(grower, season) -> float:
	return flt(frappe.db.sql("""select ifnull(sum(crop_land_acres), 0) from `tabCane Survey` where docstatus = 1 and grower = %s and season = %s""",
		(grower, season))[0][0])


def eligibility(grower: str, loan_type: str, season: str, exclude: str | None = None, guarantor: str | None = None) -> dict:
	"""What a grower may borrow of a loan type this season, and the checks behind it (also printed on the application)."""
	t = frappe.get_cached_doc("Grower Loan Type", loan_type)
	acres = surveyed_acres(grower, season)
	exp_md = flt(frappe.db.sql("""select ifnull(sum(expected_production_maund), 0) from `tabCane Survey` where docstatus = 1 and grower = %s
		and season = %s""", (grower, season))[0][0])
	rate = flt(frappe.db.get_value("Crushing Season", season, "govt_rate"))
	exp_value = flt(exp_md * rate, 2)
	taken = flt(frappe.db.sql("""select ifnull(sum(amount), 0) from `tabGrower Loan` where grower = %s and season = %s and loan_type = %s
		and docstatus = 1 and status not in ('Cancelled', 'Written Off') and name != %s""", (grower, season, loan_type, exclude or ""))[0][0])
	open_out = flt(frappe.db.sql("""select ifnull(sum(outstanding), 0) from `tabGrower Loan` where grower = %s and docstatus = 1
		and status = 'Disbursed' and name != %s""", (grower, exclude or ""))[0][0])
	written = frappe.db.count("Grower Loan", {"grower": grower, "status": "Written Off"})
	limits = []
	if flt(t.max_amount):
		limits.append((_("Largest {0} loan").format(loan_type), flt(t.max_amount)))
	if flt(t.max_per_acre):
		limits.append((_("{0} per surveyed acre × {1} acres").format(frappe.format_value(t.max_per_acre, "Currency"), f"{acres:g}"),
			flt(t.max_per_acre) * acres))
	if exp_value and flt(t.recovery_pct):
		limits.append((_("{0}% of the expected cane ({1} md × {2})").format(t.recovery_pct, f"{exp_md:,.0f}", rate), exp_value * flt(t.recovery_pct) / 100))
	cap = min((v for _l, v in limits), default=0)
	eligible = max(flt(cap - taken - open_out, 2), 0)
	min_acres = flt(t.get("min_surveyed_acres"))
	checks = [
		(_("Grower is active"), not frappe.db.get_value("Grower", grower, "disabled"), ""),
		(_("Cane surveyed this season"), acres > 0, _("{0} acres, {1} md expected").format(f"{acres:g}", f"{exp_md:,.0f}")),
		*([(_("At least {0} acres surveyed").format(f"{min_acres:g}"), acres >= min_acres, _("{0} acres").format(f"{acres:g}"))] if min_acres else []),
		(_("No loan written off before"), not written, _("{0} written off").format(written) if written else ""),
		(_("Open loans can be recovered from the expected cane"), open_out <= exp_value, frappe.format_value(open_out, "Currency")),
	]
	g = None
	if guarantor:
		g_out = flt(frappe.db.sql("""select ifnull(sum(outstanding), 0) from `tabGrower Loan` where grower = %s and docstatus = 1 and status = 'Disbursed'""",
			guarantor)[0][0])
		g_count = frappe.db.count("Grower Loan", {"guarantor": guarantor, "docstatus": 1, "status": ["in", ["Approved", "Disbursed"]], "name": ["!=", exclude or ""]})
		g_acres = surveyed_acres(guarantor, season)
		g = {"outstanding": g_out, "guaranteeing": g_count, "acres": g_acres}
		checks.append((_("Guarantor grows cane this season"), g_acres > 0, _("{0} acres").format(f"{g_acres:g}")))
		checks.append((_("Guarantor guarantees at most 2 other loans"), g_count <= 2, str(g_count)))
	return {"acres": acres, "expected_maund": exp_md, "expected_value": exp_value, "rate": rate, "limits": limits, "cap": flt(cap, 2),
		"taken": taken, "open_outstanding": open_out, "eligible": eligible, "checks": checks, "guarantor": g}


def validate_loan(doc):
	g = frappe.db.get_value("Grower", doc.grower, ["grower_name", "circle", "disabled"], as_dict=True)
	if not g or g.disabled:
		frappe.throw(_("Grower {0} is not active").format(doc.grower))
	doc.grower_name, doc.circle = g.grower_name, g.circle
	doc.company = doc.company or _s().company
	doc.season = doc.season or _s().active_season
	doc.application_date = doc.application_date or nowdate()
	if doc.guarantor:
		if doc.guarantor == doc.grower:
			frappe.throw(_("A grower can't guarantee their own loan"))
		doc.guarantor_name = frappe.db.get_value("Grower", doc.guarantor, "grower_name")
	t = frappe.get_cached_doc("Grower Loan Type", doc.loan_type)
	if not t.is_active:
		frappe.throw(_("Loan type {0} is not active").format(doc.loan_type))
	doc.markup_pct, doc.recovery_pct = t.markup_pct, t.recovery_pct
	if flt(doc.amount) <= 0:
		frappe.throw(_("Enter the loan amount"))
	if flt(t.max_amount) and flt(doc.amount) > flt(t.max_amount):
		frappe.throw(_("{0} loans are at most {1}").format(doc.loan_type, frappe.format_value(t.max_amount, "Currency")))
	doc.surveyed_acres = surveyed_acres(doc.grower, doc.season)
	if doc.docstatus == 0 and not flt(doc.requested_amount):
		doc.requested_amount = doc.amount
	if flt(doc.amount) > flt(doc.requested_amount):
		frappe.throw(_("The approved amount can't be more than the amount applied for"))
	el = eligibility(doc.grower, doc.loan_type, doc.season, doc.name, doc.guarantor)
	doc.eligible_amount, doc.expected_cane_maund, doc.expected_cane_value = el["eligible"], el["expected_maund"], el["expected_value"]
	if flt(t.max_per_acre):
		limit = flt(t.max_per_acre) * doc.surveyed_acres
		taken = flt(frappe.db.sql("""select ifnull(sum(amount), 0) from `tabGrower Loan` where grower = %s and season = %s and loan_type = %s
			and docstatus = 1 and status not in ('Cancelled', 'Written Off') and name != %s""", (doc.grower, doc.season, doc.loan_type, doc.name or ""))[0][0])
		if taken + flt(doc.amount) > limit + 0.01:
			frappe.throw(_("{0} surveyed acres allow at most {1} of {2} loans ({3} already taken)").format(f"{doc.surveyed_acres:g}",
				frappe.format_value(limit, "Currency"), doc.loan_type, frappe.format_value(taken, "Currency")), title=_("Over the limit"))
	if doc.docstatus == 0 and doc.status != "Rejected":
		doc.status = "Draft"
		doc.outstanding = 0
	if doc.docstatus == 0 and not doc.verification_status:
		doc.verification_status = "Pending" if cint(t.get("requires_field_verification")) else "Not needed"


def check_approval(doc):
	"""Approval rules beyond the limits: eligible, field-verified when the type needs it, recommended, not above the recommendation."""
	if doc.status == "Rejected":
		frappe.throw(_("Loan {0} was rejected").format(doc.name))
	t = frappe.get_cached_doc("Grower Loan Type", doc.loan_type)
	el = eligibility(doc.grower, doc.loan_type, doc.season, doc.name, doc.guarantor)
	failed = [c[0] for c in el["checks"] if not c[1]]
	if failed:
		frappe.throw(_("Not eligible: {0}").format("; ".join(failed)), title=_("Eligibility"))
	if flt(doc.amount) > flt(el["eligible"]) + 0.01:
		frappe.throw(_("{0} is more than the eligible {1}").format(frappe.format_value(doc.amount, "Currency"),
			frappe.format_value(el["eligible"], "Currency")), title=_("Eligibility"))
	if cint(t.get("requires_field_verification")):
		if doc.verification_status != "Verified":
			frappe.throw(_("The field survey for this loan is not done yet"), title=_("Field verification"))
		if doc.recommendation == "Do not recommend":
			frappe.throw(_("The surveyor did not recommend this loan — reject it, or send it for a new survey"), title=_("Not recommended"))
		if flt(doc.recommended_amount) and flt(doc.amount) > flt(doc.recommended_amount) + 0.01:
			frappe.throw(_("Approve at most the recommended {0}").format(frappe.format_value(doc.recommended_amount, "Currency")),
				title=_("Over the recommendation"))


VERIFIERS = MANAGERS | {"Surveyor", "Circle Officer"}


def request_verification(name: str, surveyor: str):
	_need(MANAGERS | ACCOUNTANTS | {"Circle Officer"}, _("send loans for field verification"))
	doc = frappe.get_doc("Grower Loan", name)
	if doc.docstatus or doc.status == "Rejected":
		frappe.throw(_("Loan {0} is {1}").format(name, _(doc.status)))
	if not frappe.db.exists("User", surveyor):
		frappe.throw(_("Choose the surveyor"))
	doc.db_set({"verification_status": "Pending", "surveyor": surveyor, "verification_requested_on": frappe.utils.now_datetime(),
		"verified_on": None, "recommendation": None, "recommended_amount": 0})
	doc.add_comment("Info", _("Sent for field verification to {0}").format(surveyor))
	return doc


def verify(name: str, verified_acres, crop_condition, crop_stage, expected_maund_per_acre, recommendation, recommended_amount=None,
		remarks=None, latitude=None, longitude=None, photo_1=None, photo_2=None):
	"""The surveyor's field visit for a loan: what was seen, two photos, and the recommendation."""
	_need(VERIFIERS, _("verify loans in the field"))
	doc = frappe.get_doc("Grower Loan", name)
	if doc.docstatus or doc.status == "Rejected":
		frappe.throw(_("Loan {0} is {1}").format(name, _(doc.status)))
	if doc.surveyor and doc.surveyor != frappe.session.user and not (MANAGERS & set(frappe.get_roles())):
		frappe.throw(_("Loan {0} is assigned to {1}").format(name, doc.surveyor), frappe.PermissionError)
	if crop_condition not in ("Excellent", "Good", "Average", "Poor", "Failed"):
		frappe.throw(_("Choose the crop condition"))
	if recommendation not in ("Recommend", "Recommend a lower amount", "Do not recommend"):
		frappe.throw(_("Choose the recommendation"))
	if flt(verified_acres) <= 0:
		frappe.throw(_("Enter the acres seen in the field"))
	if not photo_1:
		frappe.throw(_("Take at least one photo of the field"))
	rec_amt = flt(recommended_amount) if recommendation == "Recommend a lower amount" else (flt(doc.amount) if recommendation == "Recommend" else 0)
	if recommendation == "Recommend a lower amount" and not (0 < rec_amt < flt(doc.amount)):
		frappe.throw(_("Enter the lower amount you recommend"))
	if recommendation == "Do not recommend" and not (remarks or "").strip():
		frappe.throw(_("Say why the loan is not recommended"))
	doc.db_set({"verification_status": "Verified", "surveyor": doc.surveyor or frappe.session.user, "verified_on": frappe.utils.now_datetime(),
		"verified_acres": flt(verified_acres), "crop_condition": crop_condition, "crop_stage": crop_stage or None,
		"expected_maund_per_acre": flt(expected_maund_per_acre), "recommendation": recommendation, "recommended_amount": rec_amt,
		"verification_remarks": (remarks or "").strip() or None, "verification_latitude": flt(latitude),
		"verification_longitude": flt(longitude), "verification_photo_1": photo_1, "verification_photo_2": photo_2 or None})
	return frappe.get_doc("Grower Loan", name)


def reject(name: str, reason: str):
	_need(MANAGERS, _("reject loans"))
	if not (reason or "").strip():
		frappe.throw(_("Give the reason"))
	doc = frappe.get_doc("Grower Loan", name)
	if doc.docstatus:
		frappe.throw(_("Loan {0} is already {1}").format(name, _(doc.status)))
	doc.db_set({"status": "Rejected", "reject_reason": reason.strip()})
	doc.add_comment("Info", _("Rejected: {0}").format(frappe.utils.escape_html(reason)))
	return doc


def grower_history(grower: str) -> dict:
	"""A grower's record for a loan decision: every previous loan and how it was repaid, and the cane supplied each season."""
	loans_ = frappe.get_all("Grower Loan", filters={"grower": grower, "docstatus": 1}, fields=["name", "season", "loan_type", "amount",
		"markup_accrued", "recovered", "outstanding", "status", "disbursed_on"], order_by="application_date asc")
	for l in loans_:
		due = flt(l.amount) + flt(l.markup_accrued)
		l.recovered_pct = round(flt(l.recovered) / due * 100, 1) if due else 0
		last = frappe.db.sql("""select max(posting_date) from `tabGrower Loan Entry` where loan = %s
			and entry_type in ('Recovery', 'Cash Repayment')""", l.name)[0][0]
		l.last_recovery = str(last) if last else None
	cane = frappe.db.sql("""select season, count(*) cprs, ifnull(sum(payable_maund), 0) maund, ifnull(sum(payable_cpr), 0) paid_value,
		ifnull(sum(loan_deduction), 0) loan_recovered from `tabCane Purchase Receipt` where grower = %s and docstatus = 1 group by season
		order by season""", grower, as_dict=True)
	rejected = frappe.db.count("Grower Loan", {"grower": grower, "status": "Rejected"})
	return {"loans": loans_, "cane": cane, "rejected": rejected,
		"totals": {"loans": len(loans_), "borrowed": sum(flt(l.amount) for l in loans_), "recovered": sum(flt(l.recovered) for l in loans_),
			"outstanding": sum(flt(l.outstanding) for l in loans_), "written_off": sum(1 for l in loans_ if l.status == "Written Off")}}


def _journal(day, rows, remark, voucher_type="Journal Entry", ref=None):
	s = _s()
	je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": voucher_type, "company": s.company, "posting_date": day, "user_remark": remark,
		**({"cheque_no": ref, "cheque_date": day} if ref else {}), "accounts": [{**r, "cost_center": s.cost_center} for r in rows]})
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	return je.name


def _entry(loan, entry_type, amount, day, **kw):
	frappe.get_doc({"doctype": "Grower Loan Entry", "loan": loan.name, "grower": loan.grower, "entry_type": entry_type, "amount": flt(amount, 2),
		"posting_date": day, "is_demo": cint(loan.get("is_demo")), **kw}).insert(ignore_permissions=True)


def disburse(name: str, bank_account=None, on=None):
	_need(ACCOUNTANTS, _("disburse loans"))
	loan = frappe.get_doc("Grower Loan", name)
	if loan.docstatus != 1 or loan.status != "Approved":
		frappe.throw(_("Loan {0} is {1}; only an approved loan is disbursed").format(name, _(loan.status)))
	s = _s()
	bank = bank_account or loan.bank_account or s.cane_bank_account
	day = getdate(on or nowdate())
	je = _journal(day, [
		{"account": s.grower_loan_account, "party_type": "Grower", "party": loan.grower, "debit_in_account_currency": flt(loan.amount)},
		{"account": bank, "credit_in_account_currency": flt(loan.amount)},
	], _("{0} loan {1} to {2}").format(loan.loan_type, loan.name, loan.grower_name), "Bank Entry", loan.name)
	loan.db_set({"status": "Disbursed", "disbursed_on": day, "disbursement_journal": je, "bank_account": bank})
	refresh(loan.name)
	loan = frappe.get_doc("Grower Loan", name)
	from sugarcane.sms import loan_disbursed

	loan_disbursed(loan)
	return loan


def refresh(name: str):
	loan = frappe.get_doc("Grower Loan", name)
	sums = dict(frappe.db.sql("select entry_type, sum(amount) from `tabGrower Loan Entry` where loan = %s group by entry_type", name))
	markup = flt(sums.get("Markup"))
	recovered = flt(sums.get("Recovery")) + flt(sums.get("Cash Repayment"))
	written = flt(sums.get("Write-off"))
	out = flt(flt(loan.amount) + markup - recovered - written, 2) if loan.status in ("Disbursed", "Recovered", "Written Off") else 0
	status = loan.status
	if loan.status in ("Disbursed", "Recovered"):
		status = "Recovered" if out <= 0.005 else "Disbursed"
	loan.db_set({"markup_accrued": markup, "recovered": recovered, "outstanding": max(out, 0), "status": status}, update_modified=False)


def open_loans(grower: str) -> list:
	return frappe.get_all("Grower Loan", filters={"grower": grower, "docstatus": 1, "status": "Disbursed", "outstanding": [">", 0]},
		fields=["name", "outstanding", "recovery_pct", "is_demo"], order_by="disbursed_on asc, name asc")


def deduction_for(grower: str, room) -> float:
	"""What the next CPR should take for loans, given the room left after TPT (net amount − TPT)."""
	if not cint(_s().get("recover_loans_at_cpr")) or flt(room) <= 0:
		return 0.0
	total = 0.0
	for ln in open_loans(grower):
		total += min(flt(ln.outstanding), flt(room) * flt(ln.recovery_pct or 100) / 100)
	return flt(min(total, flt(room)), 2)


def record_recovery(cpr):
	"""On CPR submit: split its loan deduction across the grower's open loans, oldest first."""
	left = flt(cpr.loan_deduction)
	if left <= 0:
		return
	for ln in open_loans(cpr.grower):
		take = flt(min(left, flt(ln.outstanding)), 2)
		if take <= 0:
			continue
		loan = frappe.get_doc("Grower Loan", ln.name)
		_entry(loan, "Recovery", take, cpr.posting_date, cpr=cpr.name, journal_entry=cpr.journal_entry,
			remarks=_("Recovered from CPR {0}").format(cpr.name))
		refresh(loan.name)
		left = flt(left - take, 2)
		if left <= 0:
			break


def undo_recovery(cpr):
	loans = frappe.get_all("Grower Loan Entry", filters={"cpr": cpr.name, "entry_type": "Recovery"}, pluck="loan")
	frappe.db.delete("Grower Loan Entry", {"cpr": cpr.name, "entry_type": "Recovery"})
	for name in set(loans):
		frappe.db.set_value("Grower Loan", name, "status", "Disbursed", update_modified=False)
		refresh(name)


def repay(name: str, amount, account=None, on=None, remarks=None):
	_need(ACCOUNTANTS | {"Cane Cashier"}, _("take loan repayments"))
	loan = frappe.get_doc("Grower Loan", name)
	refresh(name)
	loan.reload()
	amount = flt(amount, 2)
	if amount <= 0 or amount > flt(loan.outstanding) + 0.005:
		frappe.throw(_("The repayment must be between 0 and the outstanding {0}").format(frappe.format_value(loan.outstanding, "Currency")))
	s = _s()
	day = getdate(on or nowdate())
	acc = account or s.cash_counter_account
	je = _journal(day, [
		{"account": acc, "debit_in_account_currency": amount},
		{"account": s.grower_loan_account, "party_type": "Grower", "party": loan.grower, "credit_in_account_currency": amount},
	], _("Repayment of loan {0} by {1}").format(loan.name, loan.grower_name),
		"Bank Entry" if frappe.db.get_value("Account", acc, "account_type") == "Bank" else "Cash Entry", loan.name)
	_entry(loan, "Cash Repayment", amount, day, journal_entry=je, remarks=remarks)
	refresh(name)
	return frappe.get_doc("Grower Loan", name)


def write_off(name: str, reason: str, account=None, on=None):
	_need({"System Manager", "Cane Admin"}, _("write off loans"))
	if not (reason or "").strip():
		frappe.throw(_("Give the reason"))
	loan = frappe.get_doc("Grower Loan", name)
	refresh(name)
	loan.reload()
	if flt(loan.outstanding) <= 0:
		frappe.throw(_("Nothing outstanding"))
	s = _s()
	acc = account or frappe.get_cached_value("Company", s.company, "write_off_account") or frappe.db.get_value("Account",
		{"company": s.company, "account_name": "Write Off"}, "name")
	day = getdate(on or nowdate())
	je = _journal(day, [
		{"account": acc, "debit_in_account_currency": flt(loan.outstanding)},
		{"account": s.grower_loan_account, "party_type": "Grower", "party": loan.grower, "credit_in_account_currency": flt(loan.outstanding)},
	], _("Loan {0} written off: {1}").format(loan.name, reason))
	_entry(loan, "Write-off", loan.outstanding, day, journal_entry=je, remarks=reason)
	loan.db_set("status", "Written Off")
	refresh(name)
	return frappe.get_doc("Grower Loan", name)


def accrue_markup(month: str | None = None) -> dict:
	"""Markup for one calendar month (YYYY-MM, default: last month) on every disbursed loan; one Journal Entry."""
	s = _s()
	if month:
		y, m = (int(x) for x in month.split("-"))
	else:
		prev = add_days(getdate(nowdate()).replace(day=1), -1)
		y, m = prev.year, prev.month
	period = f"{y:04d}-{m:02d}"
	first, last = date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])
	rows, made = [], []
	for ln in frappe.get_all("Grower Loan", filters={"docstatus": 1, "status": "Disbursed", "disbursed_on": ["<=", last], "markup_pct": [">", 0]},
			fields=["name", "grower", "disbursed_on", "markup_pct", "is_demo"]):
		if frappe.db.exists("Grower Loan Entry", {"loan": ln.name, "entry_type": "Markup", "period": period}):
			continue
		refresh(ln.name)
		out = flt(frappe.db.get_value("Grower Loan", ln.name, "outstanding"))
		start = max(getdate(ln.disbursed_on), first)
		days = (last - start).days + 1
		amount = flt(out * flt(ln.markup_pct) / 100 * days / 365, 2)
		if amount <= 0:
			continue
		rows.append({"account": s.grower_loan_account, "party_type": "Grower", "party": ln.grower, "debit_in_account_currency": amount})
		made.append((ln, amount, days))
	if not rows:
		return {"period": period, "loans": 0, "amount": 0}
	total = flt(sum(r["debit_in_account_currency"] for r in rows), 2)
	if not s.markup_income_account:
		frappe.throw(_("Set the loan markup income account in Sugar Settings"))
	je = _journal(last, rows + [{"account": s.markup_income_account, "credit_in_account_currency": total}],
		_("Grower loan markup for {0}: {1} loans").format(period, len(made)))
	for ln, amount, days in made:
		_entry(frappe._dict(name=ln.name, grower=ln.grower, is_demo=ln.is_demo), "Markup", amount, last, journal_entry=je, period=period,
			remarks=_("{0} days at {1}% a year").format(days, ln.markup_pct))
		refresh(ln.name)
	return {"period": period, "loans": len(made), "amount": total, "journal_entry": je}


def monthly_markup():
	"""Scheduler (1st of the month): last month's markup."""
	frappe.set_user("Administrator")
	accrue_markup()
