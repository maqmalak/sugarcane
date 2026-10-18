# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe

from sugarcane.cane_procurement.report_utils import col
from sugarcane.depot_purchase.report_utils import dates


def execute(filters=None):
	f = frappe._dict(filters or {})
	last = frappe.db.sql("select max(crushing_day) from `tabMill Stoppage`")[0][0]
	start, end = dates({**f, "to_date": f.to_date or last}) if last else dates(f)
	q = {"crushing_day": ["between", [start, end]]}
	if f.category:
		q["category"] = f.category
	data = frappe.get_list("Mill Stoppage", filters=q, fields=["name", "crushing_day", "shift", "start", "end", "minutes", "category", "section",
		"reason", "recorded_by"], order_by="start asc", limit_page_length=0)
	columns = [col("name", "Stoppage", "Link", "Mill Stoppage", 110), col("crushing_day", "Day", "Date", width=95), col("shift", "Shift", width=75),
		col("start", "Stopped", "Datetime", width=145), col("end", "Restarted", "Datetime", width=145), col("minutes", "Minutes", "Int", width=75),
		col("category", "Category", width=110), col("section", "Section", width=115), col("reason", "Reason", width=260)]
	by = {}
	for r in data:
		by[r.category] = by.get(r.category, 0) + (r.minutes or 0)
	chart = {"data": {"labels": list(by), "datasets": [{"name": "Minutes", "values": list(by.values())}]}, "type": "pie"}
	if data:
		data.append({"name": "Total", "minutes": sum(r.minutes or 0 for r in data)})
	return columns, data, None, chart
