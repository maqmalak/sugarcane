# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import date_diff

from sugarcane.cane_procurement.report_utils import col, cprs


def execute(filters=None):
	data = cprs(filters, ["name", "posting_date", "grower", "grower_name", "circle", "payable_maund", "net_amount", "tpt_amount", "loan_deduction",
		"payable_cpr", "payment_status", "payment_scroll", "paid_on", "cess_deposited", "road_cess_deposit"])
	for r in data:
		r.days_to_pay = date_diff(r.paid_on, r.posting_date) if r.paid_on else None
	columns = [col("name", "CPR", "Link", "Cane Purchase Receipt", 120), col("posting_date", "Day", "Date", width=95), col("grower", "Grower ID", "Link", "Grower", 105),
		col("grower_name", "Grower", width=150), col("circle", "Circle", "Link", "Cane Circle", 105), col("payable_maund", "Maund", "Float", width=80),
		col("net_amount", "Net", "Currency", width=110), col("tpt_amount", "TPT", "Currency", width=90), col("loan_deduction", "Loan", "Currency", width=90),
		col("payable_cpr", "Payable", "Currency", width=115), col("payment_status", "Payment", width=75), col("payment_scroll", "Scroll", "Link", "Cane Payment Scroll", 115),
		col("paid_on", "Paid On", "Date", width=95), col("days_to_pay", "Days to Pay", "Int", width=85), col("cess_deposited", "Cess Deposited", "Check", width=100)]
	if data:
		data.append({"name": "Total", **{k: sum(r.get(k) or 0 for r in data) for k in ("payable_maund", "net_amount", "tpt_amount", "loan_deduction", "payable_cpr")}})
	return columns, data
