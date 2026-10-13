"""Ledger tab for any submitted voucher in the React app (same data as MicroMax's selling_insights.get_voucher_ledgers,
which is not installed on this site): the GL entries it posted, with party / against / cost centre, and its stock ledger."""

import frappe
from frappe.utils import flt


@frappe.whitelist()
def get_voucher_ledgers(voucher_type: str, voucher_no: str) -> dict:
	frappe.get_doc(voucher_type, voucher_no).check_permission("read")
	gl = frappe.db.sql("""select account, party_type, party, debit, credit, against_voucher_type, against_voucher, cost_center, posting_date, remarks
		from `tabGL Entry` where voucher_type = %s and voucher_no = %s and is_cancelled = 0 order by debit desc, credit desc""",
		(voucher_type, voucher_no), as_dict=True)
	sle = frappe.db.sql("""select item_code, warehouse, actual_qty, valuation_rate, stock_value_difference, qty_after_transaction, stock_uom
		from `tabStock Ledger Entry` where voucher_type = %s and voucher_no = %s and is_cancelled = 0 order by item_code""",
		(voucher_type, voucher_no), as_dict=True)
	return {"gl": gl, "sle": sle, "debit": sum(flt(g.debit) for g in gl), "credit": sum(flt(g.credit) for g in gl),
			"stock_value": sum(flt(s.stock_value_difference) for s in sle)}
