"""Cane accounts and grower loans (Phase 6).

Dashboard  GET dashboard?as_on=
Scroll     GET unpaid?to_date=&circle=&older_than_days= · GET scroll?name= · POST save_scroll {name?, posting_date, bank_account,
           mode_of_payment, reference_no, cprs} · POST add_to_scroll {name, q} (scan) · POST pay_scroll {name} · POST bank_file {name}
Cess       GET cess?from_date=&to_date= · POST deposit_cess {from_date, to_date, deposit_date, challan_no, bank_account}
Loans      GET loans?status=&grower= · POST save_loan {...} · POST approve_loan · POST disburse · POST repay · POST markup {month}
Statement  GET statement?grower=&from_date=&to_date=
"""

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import add_days, cint, date_diff, flt, getdate, nowdate

from sugarcane.cane_accounting import accounting as acc
from sugarcane.grower_loans import loans as ln

VIEW = {"System Manager", "Cane Admin", "Cane Accountant", "Cane Manager", "MIS Viewer"}
BUCKETS = ((0, 7, "0–7"), (8, 15, "8–15"), (16, 30, "16–30"), (31, 60, "31–60"), (61, 100000, "60+"))


def _view():
	if not VIEW & set(frappe.get_roles()):
		frappe.throw(_("You are not allowed to see cane accounts"), frappe.PermissionError)


def as_on_default(as_on=None):
	"""Ageing date: the given date, else the later of today and the last CPR day (so a season being keyed in still ages)."""
	if as_on:
		return getdate(as_on)
	last = frappe.db.sql("select max(posting_date) from `tabCane Purchase Receipt` where docstatus = 1")[0][0]
	return max(getdate(nowdate()), getdate(last)) if last else getdate(nowdate())


def bucket(days):
	return next(label for lo, hi, label in BUCKETS if lo <= days <= hi) if days >= 0 else "0–7"


@frappe.whitelist(methods=["GET"])
def dashboard(as_on: str | None = None) -> dict:
	_view()
	d = as_on_default(as_on)
	s = frappe.get_cached_doc("Sugar Settings")
	unpaid = frappe.db.sql("""select c.name, c.posting_date, c.grower, c.circle, c.payable_cpr from `tabCane Purchase Receipt` c
		where c.docstatus = 1 and c.payment_status = 'Unpaid' and c.posting_date <= %s""", d, as_dict=True)
	ages = defaultdict(lambda: {"cprs": 0, "amount": 0.0})
	circles = defaultdict(float)
	for r in unpaid:
		b = ages[bucket(date_diff(d, r.posting_date))]
		b["cprs"] += 1
		b["amount"] += flt(r.payable_cpr)
		circles[r.circle or "—"] += flt(r.payable_cpr)
	overdue = sum(flt(r.payable_cpr) for r in unpaid if date_diff(d, r.posting_date) > cint(s.payable_days or 15))
	cess = frappe.db.sql("""select date_format(posting_date, '%%Y-%%m') month, sum(road_cess_grower) grower, sum(road_cess_mill) mill,
		sum(road_cess_total) total, sum(case when cess_deposited = 1 then road_cess_total else 0 end) deposited
		from `tabCane Purchase Receipt` where docstatus = 1 group by month order by month""", as_dict=True)
	loans = frappe.db.sql("""select status, count(*) n, sum(amount) amount, sum(outstanding) outstanding, sum(markup_accrued) markup,
		sum(recovered) recovered from `tabGrower Loan` where docstatus = 1 group by status""", as_dict=True)
	paid = frappe.db.sql("""select posting_date day, sum(total_amount) amount, sum(cpr_count) cprs, count(*) scrolls from `tabCane Payment Scroll`
		where docstatus = 1 group by posting_date order by posting_date desc limit 30""", as_dict=True)
	scrolls = frappe.get_all("Cane Payment Scroll", filters={"docstatus": ["<", 2]}, fields=["name", "posting_date", "status", "cpr_count",
		"grower_count", "total_amount", "without_iban"], order_by="creation desc", limit=10)
	from sugarcane.api.v1.procurement import day_checks

	return {"as_on": str(d), "payable_days": cint(s.payable_days or 15),
		"unpaid": {"cprs": len(unpaid), "amount": round(sum(flt(r.payable_cpr) for r in unpaid), 2), "overdue": round(overdue, 2),
			"growers": len({r.grower for r in unpaid})},
		"aging": [{"bucket": label, **ages.get(label, {"cprs": 0, "amount": 0.0})} for *_r, label in BUCKETS],
		"by_circle": sorted(({"circle": k, "amount": round(v, 2)} for k, v in circles.items()), key=lambda x: -x["amount"]),
		"cess": cess, "loans": loans, "paid": [{**p, "day": str(p.day)} for p in reversed(paid)], "scrolls": scrolls,
		"checks": day_checks()["checks"]}


# ---------------------------------------------------------------- scroll
@frappe.whitelist(methods=["GET"])
def unpaid(to_date: str | None = None, circle: str | None = None, source: str | None = None, older_than_days: int = 0) -> list:
	_view()
	return acc.unpaid_cprs(to_date or None, circle or None, source or None, None, older_than_days)


def _scroll_out(name):
	doc = frappe.get_doc("Cane Payment Scroll", name)
	return doc.as_dict()


@frappe.whitelist(methods=["GET"])
def bank_balances() -> dict:
	"""Bank accounts with their balance, what draft scrolls will take and what is left; and what is unpaid to growers."""
	_view()
	rows = acc.bank_balances()
	unpaid = frappe.db.sql("""select count(*) n, ifnull(sum(payable_cpr), 0) payable, ifnull(sum(loan_deduction), 0) loans
		from `tabCane Purchase Receipt` where docstatus = 1 and payment_status = 'Unpaid'""", as_dict=True)[0]
	return {"banks": rows, "unpaid": unpaid, "total_available": sum(r["available"] for r in rows),
		"can_overdraft": bool({"System Manager", "Cane Admin"} & set(frappe.get_roles()))}


@frappe.whitelist(methods=["GET"])
def loan_adjustments(scroll: str | None = None, to_date: str | None = None) -> list:
	"""CPRs whose payment was reduced for loan recovery, with the loans recovered from each."""
	_view()
	if scroll:
		cprs = [r.cpr for r in frappe.get_all("Cane Payment Scroll CPR", filters={"parent": scroll}, fields=["cpr"])]
	else:
		cprs = [r.name for r in acc.unpaid_cprs(to_date or None)]
	if not cprs:
		return []
	rows = frappe.db.sql("""select name cpr, posting_date, grower, grower_name, payable_cpr, loan_deduction, payable_cpr + loan_deduction cpr_value
		from `tabCane Purchase Receipt` where name in %(c)s and ifnull(loan_deduction, 0) > 0 order by grower_name, posting_date""", {"c": cprs}, as_dict=True)
	for r in rows:
		r.loans = frappe.get_all("Grower Loan Entry", filters={"cpr": r.cpr, "entry_type": "Recovery"}, fields=["loan", "amount"])
		for l in r.loans:
			l.update(frappe.db.get_value("Grower Loan", l.loan, ["loan_type", "outstanding"], as_dict=True) or {})
	return rows


@frappe.whitelist(methods=["GET"])
def scroll(name: str) -> dict:
	_view()
	return _scroll_out(name)


@frappe.whitelist(methods=["POST"])
def save_scroll(name: str | None = None, posting_date=None, bank_account=None, mode_of_payment=None, reference_no=None, cprs=None,
		remarks=None) -> dict:
	acc._need()
	# only a call that sends the CPR list replaces it — changing the date, bank, mode or reference keeps the CPRs
	cprs = frappe.parse_json(cprs) if isinstance(cprs, str) and cprs.strip() else (cprs if isinstance(cprs, list) else None)
	doc = frappe.get_doc("Cane Payment Scroll", name) if name else frappe.new_doc("Cane Payment Scroll")
	if doc.docstatus:
		frappe.throw(_("Scroll {0} is already paid").format(doc.name))
	doc.update({"posting_date": posting_date or doc.posting_date or nowdate(), "bank_account": bank_account or doc.bank_account,
		"mode_of_payment": mode_of_payment or doc.mode_of_payment or "Bank Transfer", "reference_no": reference_no or doc.reference_no,
		"remarks": remarks if remarks is not None else doc.remarks})
	if cprs is not None:
		doc.set("items", [{"cpr": c} for c in cprs])
	doc.flags.ignore_permissions = True
	doc.save()
	return _scroll_out(doc.name)


@frappe.whitelist(methods=["POST"])
def add_to_scroll(name: str, q: str) -> dict:
	"""Scan a CPR barcode (or type a grower ID / CNIC: all their unpaid CPRs) into a draft scroll."""
	acc._need()
	doc = frappe.get_doc("Cane Payment Scroll", name)
	q = (q or "").strip()
	cprs = [q] if frappe.db.exists("Cane Purchase Receipt", q) else [r.name for r in acc.unpaid_cprs(grower=frappe.db.get_value(
		"Grower", {"cnic": q}, "name") or (q if frappe.db.exists("Grower", q) else "--none--"))]
	if not cprs:
		frappe.throw(_("No unpaid CPR for {0}").format(q))
	have = {i.cpr for i in doc.items}
	for c in cprs:
		if c not in have:
			doc.append("items", {"cpr": c})
	doc.flags.ignore_permissions = True
	doc.save()
	return _scroll_out(doc.name)


@frappe.whitelist(methods=["POST"])
def pay_scroll(name: str, overdraft: int = 0) -> dict:
	doc = frappe.get_doc("Cane Payment Scroll", name)
	doc.flags.ignore_permissions = True
	if cint(overdraft):
		if not ({"System Manager", "Cane Admin"} & set(frappe.get_roles())):
			frappe.throw(_("Only a Cane Admin can pay over the bank balance"), frappe.PermissionError)
		doc.flags.allow_overdraft = True
	doc.submit()
	return _scroll_out(name)


@frappe.whitelist()
def bank_file(name: str):
	_view()
	fname, content = acc.bank_file(name)
	frappe.local.response.filename = fname
	frappe.local.response.filecontent = content.encode("utf-8")
	frappe.local.response.type = "download"


# ---------------------------------------------------------------- cess
@frappe.whitelist(methods=["GET"])
def cess(from_date: str | None = None, to_date: str | None = None) -> dict:
	_view()
	pending = frappe.db.sql("""select date_format(posting_date, '%%Y-%%m') month, min(posting_date) first, max(posting_date) last, count(*) cprs,
		sum(road_cess_grower) grower, sum(road_cess_mill) mill, sum(road_cess_total) total from `tabCane Purchase Receipt`
		where docstatus = 1 and cess_deposited = 0 and road_cess_total > 0 group by month order by month""", as_dict=True)
	deposits = frappe.get_all("Road Cess Deposit", filters={"docstatus": ["<", 2]}, fields=["name", "from_date", "to_date", "deposit_date",
		"challan_no", "cpr_count", "total_amount", "docstatus", "journal_entry"], order_by="deposit_date desc", limit=50)
	return {"pending": [{**r, "first": str(r.first), "last": str(r.last)} for r in pending], "deposits": deposits,
		"bank_account": frappe.db.get_single_value("Sugar Settings", "cane_bank_account")}


@frappe.whitelist(methods=["POST"])
def deposit_cess(from_date, to_date, deposit_date, challan_no, bank_account=None) -> dict:
	acc._need()
	doc = frappe.get_doc({"doctype": "Road Cess Deposit", "from_date": from_date, "to_date": to_date, "deposit_date": deposit_date,
		"challan_no": challan_no, "bank_account": bank_account or None})
	doc.flags.ignore_permissions = True
	doc.insert()
	doc.submit()
	return doc.as_dict()


# ---------------------------------------------------------------- loans
LOAN_FIELDS = ["name", "grower", "grower_name", "circle", "loan_type", "season", "status", "docstatus", "application_date", "amount",
	"requested_amount", "eligible_amount", "expected_cane_maund", "approved_by", "approved_on", "guarantor", "markup_pct",
	"recovery_pct", "disbursed_on", "markup_accrued", "recovered", "outstanding", "guarantor_name", "surveyed_acres",
	"verification_status", "surveyor", "verification_requested_on", "verified_on", "verified_acres", "crop_condition", "crop_stage",
	"expected_maund_per_acre", "recommendation", "recommended_amount", "verification_latitude", "verification_longitude",
	"verification_photo_1", "verification_photo_2", "verification_remarks", "reject_reason", "expected_cane_value"]


@frappe.whitelist(methods=["GET"])
def loans(status: str | None = None, grower: str | None = None) -> dict:
	_view()
	f = {"docstatus": ["<", 2]}
	if status:
		f["status"] = status
	if grower:
		f["grower"] = grower
	rows = frappe.get_all("Grower Loan", filters=f, fields=LOAN_FIELDS, order_by="creation desc", limit=500)
	return {"rows": rows, "types": frappe.get_all("Grower Loan Type", filters={"is_active": 1}, fields=["name", "purpose", "markup_pct",
		"recovery_pct", "max_amount", "max_per_acre"]), "can_approve": bool(ln.MANAGERS & set(frappe.get_roles())),
		"can_disburse": bool(ln.ACCOUNTANTS & set(frappe.get_roles()))}


@frappe.whitelist(methods=["GET"])
def loan(name: str) -> dict:
	if not (ln.VERIFIERS & set(frappe.get_roles())):
		_view()
	d = frappe.db.get_value("Grower Loan", name, LOAN_FIELDS + ["disbursement_journal", "remarks"], as_dict=True)
	d.entries = frappe.get_all("Grower Loan Entry", filters={"loan": name}, fields=["entry_type", "posting_date", "amount", "cpr", "journal_entry",
		"period", "remarks"], order_by="posting_date asc, creation asc")
	return d


@frappe.whitelist(methods=["POST"])
def save_loan(grower, loan_type, amount, guarantor=None, remarks=None, application_date=None, name=None, approved_amount=None) -> dict:
	if not (ln.MANAGERS | ln.ACCOUNTANTS | {"Circle Officer"}) & set(frappe.get_roles()):
		frappe.throw(_("Not allowed"), frappe.PermissionError)
	if name:  # the Cane Manager sets the amount to approve (not more than applied for) before approving
		doc = frappe.get_doc("Grower Loan", name)
		if doc.docstatus:
			frappe.throw(_("Loan {0} is already approved").format(name))
		doc.amount = flt(approved_amount or doc.amount)
		doc.save(ignore_permissions=True)
		return loan(doc.name)
	doc = frappe.get_doc({"doctype": "Grower Loan", "grower": grower, "loan_type": loan_type, "amount": flt(amount), "requested_amount": flt(amount),
		"guarantor": guarantor or None, "remarks": remarks, "application_date": application_date or nowdate()})
	doc.insert(ignore_permissions=True)
	return loan(doc.name)


@frappe.whitelist(methods=["POST"])
def approve_loan(name: str) -> dict:
	doc = frappe.get_doc("Grower Loan", name)
	doc.flags.ignore_permissions = True
	doc.submit()
	return loan(name)


@frappe.whitelist(methods=["POST"])
def disburse(name: str, bank_account=None, on=None) -> dict:
	ln.disburse(name, bank_account or None, on or None)
	return loan(name)


@frappe.whitelist(methods=["POST"])
def repay(name: str, amount, account=None, on=None, remarks=None) -> dict:
	ln.repay(name, amount, account or None, on or None, remarks)
	return loan(name)


@frappe.whitelist(methods=["POST"])
def markup(month: str | None = None) -> dict:
	ln._need(ln.ACCOUNTANTS, _("accrue markup"))
	return ln.accrue_markup(month or None)


# ---------------------------------------------------------------- statement
@frappe.whitelist(methods=["GET"])
def statement(grower: str, from_date: str | None = None, to_date: str | None = None) -> dict:
	"""Everything posted against a grower (payable and loan ledgers) with a running balance (credit = owed to the grower)."""
	_view()
	g = frappe.db.get_value("Grower", grower, ["name", "grower_name", "father_name", "cnic", "circle", "village_name", "iban", "bank_name"], as_dict=True)
	if not g:
		frappe.throw(_("Grower {0} not found").format(grower))
	s = frappe.get_cached_doc("Sugar Settings")
	start = getdate(from_date) if from_date else getdate("2000-01-01")
	end = getdate(to_date) if to_date else add_days(nowdate(), 3650)
	rows = frappe.db.sql("""select posting_date, voucher_type, voucher_no, account, debit, credit, remarks from `tabGL Entry`
		where party_type = 'Grower' and party = %s and is_cancelled = 0 and posting_date <= %s order by posting_date, creation""",
		(grower, end), as_dict=True)
	opening = sum(flt(r.credit) - flt(r.debit) for r in rows if getdate(r.posting_date) < start)
	out, bal = [], opening
	for r in rows:
		if getdate(r.posting_date) < start:
			continue
		bal += flt(r.credit) - flt(r.debit)
		kind = "Loan" if r.account == s.grower_loan_account else "Cane"
		out.append({**r, "posting_date": str(r.posting_date), "kind": kind, "balance": round(bal, 2)})
	payable = sum(flt(r.credit) - flt(r.debit) for r in rows if r.account == s.grower_payable_account)
	loan_bal = sum(flt(r.debit) - flt(r.credit) for r in rows if r.account == s.grower_loan_account)
	cprs = frappe.get_all("Cane Purchase Receipt", filters={"grower": grower, "docstatus": 1}, fields=["name", "posting_date", "payable_maund",
		"net_amount", "tpt_amount", "loan_deduction", "payable_cpr", "payment_status", "payment_scroll", "paid_on"], order_by="posting_date")
	return {"grower": g, "opening": round(opening, 2), "rows": out, "payable": round(payable, 2), "loan_outstanding": round(loan_bal, 2),
		"cprs": cprs, "loans": frappe.get_all("Grower Loan", filters={"grower": grower, "docstatus": 1}, fields=LOAN_FIELDS)}


# ---------------------------------------------------------------- bank documents (PDF) — each one is kept in the vault
def _download(fname, pdf, document_type=None, ref=(None, None), grower=None, bank=None, remarks=None):
	if document_type:
		from sugarcane.vault import store

		store(document_type, ref[0], ref[1], fname, pdf, grower, bank, remarks)
	frappe.local.response.filename = fname
	frappe.local.response.filecontent = pdf
	frappe.local.response.type = "download"


@frappe.whitelist(methods=["POST"])
def payment_schedule(name: str):
	from sugarcane.cane_accounting.bank_docs import payment_schedule as make

	_download(*make(name), "Bank Payment Schedule", ("Cane Payment Scroll", name))


@frappe.whitelist(methods=["POST"])
def instruction_letters(name: str, bank: str | None = None):
	from sugarcane.cane_accounting.bank_docs import instruction_letters as make

	_download(*make(name, bank or None), "Bank Instruction Letters", ("Cane Payment Scroll", name), bank=bank or None)


@frappe.whitelist(methods=["POST"])
def unpaid_scroll(to_date: str | None = None, circle: str | None = None, as_on: str | None = None):
	from sugarcane.cane_accounting.bank_docs import unpaid_scroll as make

	_download(*make(to_date or None, circle or None, as_on or None), "Unpaid CPR Scroll",
		remarks=", ".join(x for x in (f"up to {to_date}" if to_date else "", f"circle {circle}" if circle else "") if x) or None)


@frappe.whitelist(methods=["POST"])
def stop_payment(name: str, grower: str, reason: str, instrument: str | None = None):
	from sugarcane.cane_accounting.bank_docs import stop_payment as make

	_download(*make(name, grower, reason, instrument or None), "Stop Payment Letter", ("Cane Payment Scroll", name), grower=grower, remarks=reason)


@frappe.whitelist(methods=["POST"])
def loan_application(name: str):
	from sugarcane.grower_loans.documents import loan_application as make

	_download(*make(name), "Loan Application", ("Grower Loan", name), grower=frappe.db.get_value("Grower Loan", name, "grower"))


@frappe.whitelist(methods=["GET"])
def loan_eligibility(grower: str, loan_type: str, guarantor: str | None = None, name: str | None = None) -> dict:
	"""Before applying (or while a loan is open): what the grower may borrow of a type, and the checks."""
	_view()
	season = frappe.db.get_single_value("Sugar Settings", "active_season")
	el = ln.eligibility(grower, loan_type, season, name or None, guarantor or None)
	el["checks"] = [{"label": a, "ok": bool(b), "detail": c} for a, b, c in el["checks"]]
	el["limits"] = [{"label": a, "amount": flt(b, 2)} for a, b in el["limits"]]
	el["history"] = frappe.get_all("Grower Loan", filters={"grower": grower, "docstatus": 1, "name": ["!=", name or ""]},
		fields=["name", "season", "loan_type", "amount", "recovered", "outstanding", "status"], order_by="application_date asc")
	return el


# ---------------------------------------------------------------- document vault
@frappe.whitelist(methods=["GET"])
def documents(q: str | None = None, document_type: str | None = None, limit: int = 100) -> dict:
	_view()
	f = {}
	if document_type:
		f["document_type"] = document_type
	or_f = {"reference_name": ["like", f"%{q}%"], "grower": ["like", f"%{q}%"], "bank": ["like", f"%{q}%"]} if q else None
	gen = frappe.get_all("Sugar Generated Document", filters=f, or_filters=or_f, fields=["name", "document_type", "reference_doctype", "reference_name",
		"version", "grower", "bank", "issued_on", "issued_by", "file", "remarks"], order_by="issued_on desc", limit=cint(limit))
	vf = {}
	if q:
		vor = {"title": ["like", f"%{q}%"], "grower_name": ["like", f"%{q}%"], "reference_no": ["like", f"%{q}%"], "grower": ["like", f"%{q}%"]}
	else:
		vor = None
	vault = frappe.get_all("Sugar Vault Document", filters=vf, or_filters=vor, fields=["name", "title", "document_type", "grower", "grower_name",
		"reference_doctype", "reference_name", "authority", "reference_no", "issue_date", "expiry_date", "status", "file"], order_by="expiry_date asc", limit=300)
	from collections import Counter

	return {"generated": gen, "vault": vault, "counts": Counter(v.status for v in vault),
		"types": frappe.get_meta("Sugar Generated Document").get_field("document_type").options.split("\n")}


# ---------------------------------------------------------------- contractor bills
BILL_FIELDS = ["name", "contractor", "bill_type", "from_date", "to_date", "bill_date", "status", "docstatus", "line_count", "total_maund", "gross_amount",
	"deductions", "net_amount", "idle_hours", "idle_amount", "journal_entry", "unloading_contract", "loading_point", "depot"]


@frappe.whitelist(methods=["GET"])
def contractor_bills() -> dict:
	_view()
	s = frappe.get_cached_doc("Sugar Settings")
	return {"rows": frappe.get_all("Contractor Bill", filters={"docstatus": ["<", 2]}, fields=BILL_FIELDS, order_by="creation desc", limit=200),
		"contractors": frappe.get_all("Supplier", filters={"supplier_group": s.contractor_supplier_group}, pluck="name", order_by="name"),
		"unloading_contractor": s.get("unloading_contractor"),
		"contracts": frappe.get_all("Unloading Contract", fields=["name", "contractor", "valid_from", "valid_to", "status", "rate_per_maund",
			"idle_rate_per_hour"], order_by="valid_from desc")}


@frappe.whitelist(methods=["POST"])
def make_bill(contractor, bill_type, from_date, to_date, loading_point=None, depot=None, bill_date=None, post_it=0) -> dict:
	acc._need()
	doc = frappe.get_doc({"doctype": "Contractor Bill", "contractor": contractor or None, "bill_type": bill_type, "from_date": from_date, "to_date": to_date,
		"loading_point": loading_point or None, "depot": depot or None, "bill_date": bill_date or to_date})
	doc.flags.ignore_permissions = True
	doc.insert()
	if cint(post_it):
		doc.submit()
	return frappe.get_doc("Contractor Bill", doc.name).as_dict()


@frappe.whitelist(methods=["POST"])
def post_bill(name: str) -> dict:
	doc = frappe.get_doc("Contractor Bill", name)
	doc.flags.ignore_permissions = True
	doc.submit()
	return frappe.get_doc("Contractor Bill", name).as_dict()


@frappe.whitelist(methods=["POST"])
def contractor_bill_pdf(name: str):
	from sugarcane.cane_accounting.contractor_bills import bill_pdf

	_download(*bill_pdf(name), "Contractor Bill", ("Contractor Bill", name))


@frappe.whitelist(methods=["POST"])
def unloading_contract_pdf(name: str):
	from sugarcane.cane_accounting.contractor_bills import contract_pdf

	_download(*contract_pdf(name), "Unloading Contract", ("Unloading Contract", name))


# ---------------------------------------------------------------- loan field verification (loan survey) and grower history
@frappe.whitelist(methods=["GET"])
def surveyors() -> list:
	_view()
	users = frappe.db.sql("""select distinct u.name, u.full_name from `tabUser` u join `tabHas Role` r on r.parent = u.name
		where r.role in ('Surveyor', 'Circle Officer') and u.enabled = 1 order by u.full_name""", as_dict=True)
	return users


@frappe.whitelist(methods=["POST"])
def request_verification(name: str, surveyor: str) -> dict:
	ln.request_verification(name, surveyor)
	return loan(name)


@frappe.whitelist(methods=["GET"])
def loan_verifications(mine: int = 1, status: str = "Pending") -> list:
	"""The field surveys to do (a surveyor's own, or all for managers)."""
	ln._need(ln.VERIFIERS | ln.ACCOUNTANTS, _("see loan verifications"))
	f = {"docstatus": 0, "status": "Draft"}
	if status:
		f["verification_status"] = status
	if cint(mine) and not (ln.MANAGERS & set(frappe.get_roles())):
		f["surveyor"] = frappe.session.user
	rows = frappe.get_all("Grower Loan", filters=f, fields=LOAN_FIELDS, order_by="verification_requested_on asc", limit=200)
	for r in rows:
		r.village_name = frappe.db.get_value("Grower", r.grower, "village_name")
	return rows


@frappe.whitelist(methods=["POST"])
def verify_loan(name: str, verified_acres, crop_condition, crop_stage=None, expected_maund_per_acre=0, recommendation=None,
		recommended_amount=None, remarks=None, latitude=None, longitude=None, photo_1=None, photo_2=None) -> dict:
	ln.verify(name, verified_acres, crop_condition, crop_stage, expected_maund_per_acre, recommendation, recommended_amount, remarks,
		latitude, longitude, photo_1, photo_2)
	return loan(name)


@frappe.whitelist(methods=["POST"])
def reject_loan(name: str, reason: str) -> dict:
	ln.reject(name, reason)
	return loan(name)


@frappe.whitelist(methods=["GET"])
def grower_history(grower: str) -> dict:
	if not (ln.VERIFIERS & set(frappe.get_roles())):
		_view()
	h = ln.grower_history(grower)
	h["grower"] = frappe.db.get_value("Grower", grower, ["name", "grower_name", "father_name", "cnic", "village_name", "circle", "mobile"],
		as_dict=True)
	return h
