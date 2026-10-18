# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import get_datetime

from sugarcane.cane_procurement.report_utils import col, dates


def _min(a, b):
	return int((get_datetime(b) - get_datetime(a)).total_seconds() // 60) if a and b else None


def execute(filters=None):
	f = frappe._dict(filters or {})
	start, end = dates(f)
	q = {"docstatus": ["in", [1, 2]], "crushing_day": ["between", [start, end]]}
	for k in ("circle", "status"):
		if f.get(k):
			q[k] = f[k]
	data = frappe.get_list("Cane Token", filters=q, fields=["name", "crushing_day", "status", "entry_type", "issued_at", "issued_by", "gross_at",
		"completed_at", "vehicle_no", "vehicle_type", "lane", "grower_name", "circle", "point_name", "source", "indent", "elp_registration",
		"cpr", "gate_reason", "cancel_reason"], order_by="issued_at asc", limit_page_length=0)
	for r in data:
		r.to_gross, r.gross_to_tare, r.total = _min(r.issued_at, r.gross_at), _min(r.gross_at, r.completed_at), _min(r.issued_at, r.completed_at)
	columns = [col("name", "Token", "Link", "Cane Token", 120), col("crushing_day", "Day", "Date", width=95), col("status", "Status", width=85),
		col("entry_type", "Entry", width=95), col("issued_at", "Issued", "Datetime", width=140), col("vehicle_no", "Vehicle", width=95),
		col("vehicle_type", "Type", width=110), col("lane", "Lane", width=110), col("grower_name", "Grower", width=140), col("circle", "Circle", "Link", "Cane Circle", 100),
		col("point_name", "Point", width=110), col("indent", "Indent", "Link", "Cane Indent", 120), col("elp_registration", "ELP", "Link", "LP Vehicle Registration", 115),
		col("to_gross", "Gate → Gross (min)", "Int", width=120), col("gross_to_tare", "Gross → Tare (min)", "Int", width=120), col("total", "Total (min)", "Int", width=90),
		col("cpr", "CPR", "Link", "Cane Purchase Receipt", 120), col("issued_by", "Clerk", "Link", "User", 150), col("gate_reason", "Gate-rate Reason", width=200),
		col("cancel_reason", "Cancel Reason", width=180)]
	return columns, data
