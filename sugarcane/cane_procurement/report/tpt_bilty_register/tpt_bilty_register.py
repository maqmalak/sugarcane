# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe

from sugarcane.cane_procurement.report_utils import col, dates


def execute(filters=None):
	f = frappe._dict(filters or {})
	start, end = dates(f)
	q = {"docstatus": 1, "crushing_day": ["between", [start, end]]}
	if f.status:
		q["status"] = f.status
	data = frappe.get_list("TPT Bilty", filters=q, fields=["name", "crushing_day", "cpr", "status", "vehicle_no", "vehicle_type", "driver_name",
		"driver_cnic", "point_name", "source", "payable_maund", "tpt_rate", "amount", "paid_at", "paid_by", "received_by", "payment_journal_entry"],
		order_by="crushing_day asc, name asc", limit_page_length=0)
	columns = [col("name", "Bilty", "Link", "TPT Bilty", 120), col("crushing_day", "Day", "Date", width=95), col("cpr", "CPR", "Link", "Cane Purchase Receipt", 120),
		col("status", "Status", width=75), col("vehicle_no", "Vehicle", width=95), col("vehicle_type", "Type", width=110), col("driver_name", "Driver", width=140),
		col("driver_cnic", "CNIC", width=125), col("point_name", "Point", width=120), col("source", "Source", "Link", "Cane Source", 120),
		col("payable_maund", "Maund", "Float", width=85), col("tpt_rate", "Rate / md", "Currency", width=85), col("amount", "Amount", "Currency", width=105),
		col("paid_at", "Paid At", "Datetime", width=140), col("paid_by", "Cashier", "Link", "User", 150), col("received_by", "Received By", width=140),
		col("payment_journal_entry", "Journal", "Link", "Journal Entry", 130)]
	if data:
		paid = sum(r.amount for r in data if r.status == "Paid")
		data.append({"name": "Total", "payable_maund": round(sum(r.payable_maund for r in data), 3), "amount": sum(r.amount for r in data)})
		chart = {"data": {"labels": ["Paid", "Unpaid"], "datasets": [{"values": [paid, data[-1]["amount"] - paid]}]}, "type": "pie"}
		return columns, data, None, chart
	return columns, data
