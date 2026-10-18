# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe

from sugarcane.cane_procurement.report_utils import col


def execute(filters=None):
	f = frappe._dict(filters or {})
	q = {"docstatus": ["<", 2]}
	for k in ("circle", "status", "loan_type"):
		if f.get(k):
			q[k] = f[k]
	data = frappe.get_list("Grower Loan", filters=q, fields=["name", "grower", "grower_name", "circle", "loan_type", "status", "application_date",
		"disbursed_on", "amount", "markup_pct", "markup_accrued", "recovered", "outstanding", "guarantor_name", "surveyed_acres"],
		order_by="application_date asc", limit_page_length=0)
	columns = [col("name", "Loan", "Link", "Grower Loan", 115), col("grower", "Grower ID", "Link", "Grower", 105), col("grower_name", "Grower", width=150),
		col("circle", "Circle", "Link", "Cane Circle", 105), col("loan_type", "Type", width=100), col("status", "Status", width=85),
		col("disbursed_on", "Disbursed", "Date", width=95), col("amount", "Loan", "Currency", width=110), col("markup_pct", "Markup %", "Percent", width=80),
		col("markup_accrued", "Markup", "Currency", width=100), col("recovered", "Recovered", "Currency", width=110), col("outstanding", "Outstanding", "Currency", width=115),
		col("surveyed_acres", "Acres", "Float", width=70), col("guarantor_name", "Guarantor", width=140)]
	if data:
		data.append({"name": "Total", **{k: sum(r.get(k) or 0 for r in data) for k in ("amount", "markup_accrued", "recovered", "outstanding")}})
	return columns, data
