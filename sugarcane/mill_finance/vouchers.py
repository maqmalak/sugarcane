# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Pakistani voucher discipline on top of ERPNext Journal Entries:

- every journal is a **JV / BPV / BRV / CPV / CRV** — bank or cash payment / receipt, read from its accounts — numbered in
  its own series (BPV-26-00012);
- **batch posting**: submit many draft vouchers at once (each one checked on its own);
- **multi-voucher printing**: one PDF, a voucher per page, on the letterhead, with amount in words and Prepared /
  Checked / Approved / Received signatures.
Copying a voucher is ERPNext's Duplicate; reversing one is its *Reverse Journal Entry*.
"""
import frappe
from frappe import _
from frappe.utils import flt

SERIES = {"JV": "JV-.YY.-.#####", "BPV": "BPV-.YY.-.#####", "BRV": "BRV-.YY.-.#####", "CPV": "CPV-.YY.-.#####", "CRV": "CRV-.YY.-.#####"}
POSTERS = {"System Manager", "Accounts Manager", "Cane Admin"}


def code_for(doc) -> str:
	if doc.get("is_opening") == "Yes" or doc.get("voucher_type") in ("Opening Entry", "Depreciation Entry", "Exchange Rate Revaluation"):
		return "JV"
	types = {a.account: frappe.get_cached_value("Account", a.account, "account_type") for a in doc.accounts if a.account}
	for kind, pay, rec in (("Bank", "BPV", "BRV"), ("Cash", "CPV", "CRV")):
		rows = [a for a in doc.accounts if types.get(a.account) == kind]
		if rows:
			net = sum(flt(a.debit_in_account_currency or a.debit) - flt(a.credit_in_account_currency or a.credit) for a in rows)
			return rec if net > 0 else pay
	return "JV"


def before_insert(doc, method=None):
	doc.voucher_code = code_for(doc)
	if not doc.get("naming_series") or doc.naming_series in ("ACC-JV-.YYYY.-", SERIES["JV"]) or doc.naming_series in SERIES.values():
		doc.naming_series = SERIES[doc.voucher_code]


def validate(doc, method=None):
	doc.voucher_code = code_for(doc)


@frappe.whitelist(methods=["POST"])
def post(names) -> dict:
	"""Submit draft Journal Entries / Payment Entries; returns what was posted and why the others weren't."""
	if not POSTERS & set(frappe.get_roles()):
		frappe.throw(_("Only an Accounts Manager posts vouchers"), frappe.PermissionError)
	posted, failed = [], []
	for ref in frappe.parse_json(names) if isinstance(names, str) else names:
		dt, name = (ref.split("::", 1) if "::" in ref else ("Journal Entry", ref))
		frappe.db.savepoint("sc_post")
		try:
			doc = frappe.get_doc(dt, name)
			if doc.docstatus != 0:
				raise frappe.ValidationError(_("not a draft"))
			doc.submit()
			posted.append(name)
		except Exception as e:
			frappe.db.rollback(save_point="sc_post")
			frappe.clear_last_message()
			failed.append({"name": name, "error": str(e)[:300]})
	return {"posted": posted, "failed": failed}


def _rows(doc):
	if doc.doctype == "Journal Entry":
		return [{"account": a.account, "party": a.party, "cost_center": a.cost_center, "remark": a.user_remark,
			"debit": flt(a.debit), "credit": flt(a.credit)} for a in doc.accounts]
	# Payment Entry: the two sides
	amt = flt(doc.paid_amount if doc.payment_type == "Pay" else doc.received_amount)
	dr, cr = (doc.paid_to, doc.paid_from)
	rows = [{"account": dr, "party": doc.party if doc.payment_type == "Pay" else None, "debit": amt, "credit": 0},
		{"account": cr, "party": doc.party if doc.payment_type == "Receive" else None, "debit": 0, "credit": amt}]
	for d in doc.get("deductions") or []:
		rows.append({"account": d.account, "cost_center": d.cost_center, "debit": flt(d.amount), "credit": 0})
	return rows


def voucher_pdf(refs) -> tuple[str, bytes]:
	from frappe.utils.pdf import get_pdf

	from sugarcane.cane_accounting.bank_docs import _ctx

	vouchers = []
	for ref in refs:
		dt, name = (ref.split("::", 1) if "::" in ref else ("Journal Entry", ref))
		doc = frappe.get_doc(dt, name)
		doc.check_permission("read")
		code = doc.get("voucher_code") or ("BPV" if doc.doctype == "Payment Entry" and doc.payment_type == "Pay" else "BRV" if doc.doctype == "Payment Entry" else "JV")
		rows = _rows(doc)
		vouchers.append({"doc": doc, "code": code, "title": TITLES.get(code, code), "rows": rows,
			"total": round(sum(r["debit"] for r in rows), 2),
			"narration": doc.get("user_remark") or doc.get("remarks") or "",
			"cheque": doc.get("cheque_no") or doc.get("reference_no"), "cheque_date": doc.get("cheque_date") or doc.get("reference_date")})
	name = f"Vouchers {refs[0].split('::')[-1]}{' +' + str(len(refs) - 1) if len(refs) > 1 else ''}.pdf"
	html = frappe.render_template("sugarcane/templates/finance/vouchers.html", _ctx(vouchers=vouchers))
	return name, get_pdf(html, {"page-size": "A4", "margin-top": "10mm", "margin-bottom": "12mm", "margin-left": "10mm", "margin-right": "10mm"})


TITLES = {"JV": "Journal Voucher", "BPV": "Bank Payment Voucher", "BRV": "Bank Receipt Voucher", "CPV": "Cash Payment Voucher",
	"CRV": "Cash Receipt Voucher"}
