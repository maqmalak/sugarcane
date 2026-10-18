"""Cane accounts (Phase 6): paying growers by bank scroll and depositing road cess.

Payment scroll  The accountant scans CPR barcodes (or adds the unpaid CPRs of a day / circle) into one scroll: many CPRs,
                many growers. On submit, one Payment Entry per grower — Dr Grower Payable (party Grower) · Cr the bank —
                allocated against each CPR's journal, so the grower's ledger shows every CPR settled. The CPRs become Paid.
                The bank file (CSV: name, CNIC, bank, IBAN, amount, reference) goes to the bank.
Road cess       All CPRs of a period whose cess is not yet deposited; on submit, Journal Entry Dr Road Cess Payable – Govt ·
                Cr the bank, with the challan number; the CPRs are marked deposited.
"""

import csv
import io
from collections import OrderedDict

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

ACC_ROLES = {"System Manager", "Cane Admin", "Cane Accountant"}


def _need():
	if not ACC_ROLES & set(frappe.get_roles()):
		frappe.throw(_("Only the cane accountant does this"), frappe.PermissionError)


def _settings():
	return frappe.get_cached_doc("Sugar Settings")


def _bank(account):
	acc = account or _settings().cane_bank_account
	if not acc or frappe.db.get_value("Account", acc, "account_type") not in ("Bank", "Cash"):
		frappe.throw(_("Choose a bank (or cash) ledger to pay from"))
	return acc


# ---------------------------------------------------------------- payment scroll
def unpaid_cprs(to_date=None, circle=None, source=None, grower=None, older_than_days=0, limit=500) -> list:
	"""Unpaid submitted CPRs that are not on another scroll."""
	cond, vals = ["c.docstatus = 1", "c.payment_status = 'Unpaid'", "ifnull(c.payment_scroll, '') = ''", "c.payable_cpr > 0"], {}
	if to_date:
		cond.append("c.posting_date <= %(to)s")
		vals["to"] = getdate(to_date)
	if cint(older_than_days):
		cond.append("datediff(%(today)s, c.posting_date) >= %(age)s")
		vals.update(today=getdate(nowdate()), age=cint(older_than_days))
	for f, v in (("circle", circle), ("source", source), ("grower", grower)):
		if v:
			cond.append(f"c.{f} = %({f})s")
			vals[f] = v
	cond.append("""not exists (select 1 from `tabCane Payment Scroll CPR` i join `tabCane Payment Scroll` s on s.name = i.parent
		where i.cpr = c.name and s.docstatus = 0)""")
	return frappe.db.sql(f"""select c.name, c.posting_date, c.grower, c.grower_name, c.circle, c.payable_cpr, c.journal_entry, g.iban, g.bank_name
		from `tabCane Purchase Receipt` c left join `tabGrower` g on g.name = c.grower where {' and '.join(cond)}
		order by c.posting_date, c.name limit {cint(limit) or 500}""", vals, as_dict=True)


def validate_scroll(doc):
	doc.company = doc.company or _settings().company
	doc.bank_account = doc.bank_account or _settings().cane_bank_account
	seen, rows = set(), []
	for it in doc.items:
		if not it.cpr or it.cpr in seen:
			continue
		seen.add(it.cpr)
		c = frappe.db.get_value("Cane Purchase Receipt", it.cpr, ["docstatus", "payment_status", "payment_scroll", "posting_date", "grower",
			"grower_name", "payable_cpr", "journal_entry"], as_dict=True)
		if not c or c.docstatus != 1:
			frappe.throw(_("CPR {0} is not submitted").format(it.cpr))
		if doc.docstatus == 0 and (c.payment_status == "Paid" or (c.payment_scroll and c.payment_scroll != doc.name)):
			frappe.throw(_("CPR {0} is already paid ({1})").format(it.cpr, c.payment_scroll or _("Paid")))
		other = frappe.db.sql("""select s.name from `tabCane Payment Scroll CPR` i join `tabCane Payment Scroll` s on s.name = i.parent
			where i.cpr = %s and s.docstatus = 0 and s.name != %s limit 1""", (it.cpr, doc.name or ""))
		if other and doc.docstatus == 0:
			frappe.throw(_("CPR {0} is already on scroll {1}").format(it.cpr, other[0][0]))
		it.update({"posting_date": c.posting_date, "grower": c.grower, "grower_name": c.grower_name, "amount": c.payable_cpr,
			"journal_entry": c.journal_entry, "iban": frappe.db.get_value("Grower", c.grower, "iban")})
		rows.append(it)
	doc.set("items", rows)
	by = OrderedDict()
	for it in rows:
		g = by.setdefault(it.grower, {"cprs": 0, "amount": 0.0})
		g["cprs"] += 1
		g["amount"] = flt(g["amount"] + flt(it.amount), 2)
	if doc.docstatus == 0:
		doc.set("payments", [])
		for grower, g in by.items():
			gr = frappe.db.get_value("Grower", grower, ["grower_name", "cnic", "bank_name", "account_title", "iban"], as_dict=True) or {}
			doc.append("payments", {"grower": grower, "grower_name": gr.get("grower_name"), "cnic": gr.get("cnic"), "bank_name": gr.get("bank_name"),
				"account_title": gr.get("account_title") or gr.get("grower_name"), "iban": gr.get("iban"), "cprs": g["cprs"], "amount": g["amount"]})
	doc.cpr_count, doc.grower_count = len(rows), len(by)
	doc.total_amount = flt(sum(flt(r.amount) for r in rows), 2)
	doc.without_iban = sum(1 for p in doc.payments if not p.iban)
	if doc.docstatus == 0:
		doc.status = "Draft"


def check_scroll(doc):
	"""Before submit, while nothing is written yet."""
	_need()
	if not doc.items:
		frappe.throw(_("Add the CPRs to pay"))
	if doc.mode_of_payment != "Cheque" and doc.without_iban:
		names = ", ".join(p.grower_name or p.grower for p in doc.payments if not p.iban)
		frappe.throw(_("{0} grower(s) have no IBAN: {1}. Add their bank details or pay this scroll by cheque.").format(doc.without_iban, names),
			title=_("Bank details missing"))
	_bank(doc.bank_account)


def submit_scroll(doc):
	s = _settings()
	bank = _bank(doc.bank_account)
	cprs = {}
	for it in doc.items:
		cprs.setdefault(it.grower, []).append(it)
	for row in doc.payments:
		pe = frappe.get_doc({
			"doctype": "Payment Entry", "payment_type": "Pay", "company": doc.company, "posting_date": doc.posting_date,
			"party_type": "Grower", "party": row.grower, "paid_from": bank, "paid_to": s.grower_payable_account,
			"paid_amount": flt(row.amount), "received_amount": flt(row.amount), "reference_no": doc.reference_no or doc.name,
			"reference_date": doc.posting_date, "cost_center": s.cost_center,
			"remarks": _("Cane payment scroll {0}: {1} CPR(s) for {2}").format(doc.name, row.cprs, row.grower_name),
			"references": [{"reference_doctype": "Journal Entry", "reference_name": it.journal_entry, "allocated_amount": flt(it.amount)}
				for it in cprs[row.grower]],
		})
		pe.flags.ignore_permissions = True
		pe.setup_party_account_field()
		pe.set_missing_values()
		pe.insert()
		pe.submit()
		row.db_set("payment_entry", pe.name)
	for it in doc.items:
		frappe.db.set_value("Cane Purchase Receipt", it.cpr, {"payment_status": "Paid", "payment_scroll": doc.name, "paid_on": doc.posting_date},
			update_modified=False)
	doc.db_set("status", "Paid")


def cancel_scroll(doc):
	_need()
	for row in doc.payments:
		if row.payment_entry and frappe.db.get_value("Payment Entry", row.payment_entry, "docstatus") == 1:
			pe = frappe.get_doc("Payment Entry", row.payment_entry)
			pe.flags.ignore_permissions = True
			pe.cancel()
	for it in doc.items:
		frappe.db.set_value("Cane Purchase Receipt", it.cpr, {"payment_status": "Unpaid", "payment_scroll": None, "paid_on": None}, update_modified=False)
	doc.db_set("status", "Cancelled")


def bank_file(name: str) -> tuple[str, str]:
	"""CSV for the bank: one line per grower."""
	doc = frappe.get_doc("Cane Payment Scroll", name)
	out = io.StringIO()
	w = csv.writer(out)
	w.writerow(["Sr", "Beneficiary", "CNIC", "Bank", "IBAN", "Amount", "Reference", "CPRs"])
	cprs = {}
	for it in doc.items:
		cprs.setdefault(it.grower, []).append(it.cpr)
	for i, p in enumerate(doc.payments, 1):
		w.writerow([i, p.account_title or p.grower_name, p.cnic or "", p.bank_name or "", p.iban or "", f"{flt(p.amount):.2f}",
			f"{doc.name}/{p.grower}", " ".join(cprs.get(p.grower, []))])
	w.writerow([])
	w.writerow(["", "TOTAL", "", "", "", f"{flt(doc.total_amount):.2f}", doc.name, f"{doc.cpr_count} CPRs"])
	return f"{doc.name} bank file.csv", out.getvalue()


# ---------------------------------------------------------------- road cess
def validate_deposit(doc):
	doc.company = doc.company or _settings().company
	doc.bank_account = doc.bank_account or _settings().cane_bank_account
	if getdate(doc.from_date) > getdate(doc.to_date):
		frappe.throw(_("The period ends before it starts"))
	if doc.docstatus == 0:
		rows = frappe.db.sql("""select c.name, c.posting_date, c.grower_name, c.road_cess_grower, c.road_cess_mill, c.road_cess_total
			from `tabCane Purchase Receipt` c where c.docstatus = 1 and c.cess_deposited = 0 and c.road_cess_total > 0
			and c.posting_date between %(f)s and %(t)s and not exists (select 1 from `tabRoad Cess Deposit CPR` i
			join `tabRoad Cess Deposit` d on d.name = i.parent where i.cpr = c.name and d.docstatus = 0 and d.name != %(n)s)
			order by c.posting_date, c.name""", {"f": getdate(doc.from_date), "t": getdate(doc.to_date), "n": doc.name or ""}, as_dict=True)
		doc.set("items", [{"cpr": r.name, "posting_date": r.posting_date, "grower_name": r.grower_name, "road_cess_grower": r.road_cess_grower,
			"road_cess_mill": r.road_cess_mill, "road_cess_total": r.road_cess_total} for r in rows])
	doc.cpr_count = len(doc.items)
	doc.total_grower = flt(sum(flt(r.road_cess_grower) for r in doc.items), 2)
	doc.total_mill = flt(sum(flt(r.road_cess_mill) for r in doc.items), 2)
	doc.total_amount = flt(sum(flt(r.road_cess_total) for r in doc.items), 2)


def check_deposit(doc):
	_need()
	if not doc.items:
		frappe.throw(_("No CPR in {0} – {1} has road cess left to deposit").format(doc.from_date, doc.to_date))
	_bank(doc.bank_account)


def submit_deposit(doc):
	s = _settings()
	bank = _bank(doc.bank_account)
	je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Bank Entry", "company": doc.company, "posting_date": doc.deposit_date,
		"cheque_no": doc.challan_no, "cheque_date": doc.deposit_date,
		"user_remark": _("Road cess deposited, challan {0}: CPRs {1} – {2} ({3})").format(doc.challan_no, doc.from_date, doc.to_date, doc.cpr_count),
		"accounts": [
			{"account": s.road_cess_payable_account, "debit_in_account_currency": flt(doc.total_amount), "cost_center": s.cost_center},
			{"account": bank, "credit_in_account_currency": flt(doc.total_amount), "cost_center": s.cost_center},
		]})
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	doc.db_set("journal_entry", je.name)
	for it in doc.items:
		frappe.db.set_value("Cane Purchase Receipt", it.cpr, {"cess_deposited": 1, "road_cess_deposit": doc.name}, update_modified=False)


def cancel_deposit(doc):
	_need()
	if doc.journal_entry and frappe.db.get_value("Journal Entry", doc.journal_entry, "docstatus") == 1:
		je = frappe.get_doc("Journal Entry", doc.journal_entry)
		je.flags.ignore_permissions = True
		je.flags.ignore_links = True
		je.cancel()
	for it in doc.items:
		frappe.db.set_value("Cane Purchase Receipt", it.cpr, {"cess_deposited": 0, "road_cess_deposit": None}, update_modified=False)
