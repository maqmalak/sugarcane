# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, add_months, cint, date_diff, flt, getdate, nowdate

from sugarcane.cane_procurement.report_utils import col


def _range(f, back=90):
	end = getdate(f.to_date or nowdate())
	return getdate(f.from_date or add_days(end, -back)), end


def execute(filters=None):
	"""Post-dated cheques — issued (payments) and received (receipts): the cheque date is later than the entry's own date and has not
	passed yet as of the entry being cleared — with the days until each can be presented (negative = due, present it)."""
	today = getdate(nowdate())
	rows = frappe.db.sql("""select name, payment_type, party_type, party, party_name, paid_amount, reference_no, reference_date, posting_date,
		docstatus, bank_account, mode_of_payment from `tabPayment Entry` where docstatus < 2 and reference_date > posting_date
		and clearance_date is null order by reference_date""", as_dict=True)
	for r in rows:
		r.direction = "Issued" if r.payment_type == "Pay" else "Received"
		r.days = date_diff(r.reference_date, today)
		r.state = "Posted" if r.docstatus == 1 else "Held (draft)"
	cols = [col("name", "Payment", "Link", "Payment Entry", 130), col("direction", "Cheque", width=85), col("party_name", "Party", width=180),
		col("reference_no", "Cheque No.", width=100), col("reference_date", "Cheque Date", "Date", width=100), col("days", "Days To Go", "Int", width=85),
		col("paid_amount", "Amount", "Currency", width=120), col("mode_of_payment", "Mode", width=100), col("state", "State", width=110)]
	summary = [{"label": "Issued", "value": round(sum(flt(r.paid_amount) for r in rows if r.direction == "Issued"), 2), "datatype": "Currency", "indicator": "red"},
		{"label": "Received", "value": round(sum(flt(r.paid_amount) for r in rows if r.direction == "Received"), 2), "datatype": "Currency", "indicator": "green"}]
	return cols, rows, None, None, summary
