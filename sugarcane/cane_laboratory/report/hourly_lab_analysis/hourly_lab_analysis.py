# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import cint

from sugarcane.cane_procurement.report_utils import col
from sugarcane.depot_purchase.report_utils import dates


def execute(filters=None):
	f = frappe._dict(filters or {})
	last = frappe.db.sql("select max(crushing_day) from `tabLab Sample` where docstatus = 1")[0][0]
	start, end = dates({**f, "to_date": f.to_date or last, "from_date": f.from_date or last}) if last else dates(f)
	q = {"docstatus": 1, "crushing_day": ["between", [start, end]]}
	if f.sample_type:
		q["sample_type"] = f.sample_type
	if cint(f.out_of_range):
		q["out_of_range"] = 1
	data = frappe.get_list("Lab Sample", filters=q, fields=["name", "crushing_day", "hour", "shift", "sample_type", "brix", "pol", "purity", "ph",
		"moisture_pct", "fibre_pct", "colour_icumsa", "out_of_range", "problems", "chemist"], order_by="sample_time asc", limit_page_length=0)
	for r in data:
		for k in ("brix", "pol", "purity", "ph", "moisture_pct", "fibre_pct", "colour_icumsa"):
			r[k] = r[k] or None  # 0 = not measured
	columns = [col("name", "Sample", "Link", "Lab Sample", 115), col("crushing_day", "Day", "Date", width=95), col("hour", "Hour", width=60),
		col("shift", "Shift", width=75), col("sample_type", "Stream", "Link", "Lab Sample Type", 130), col("brix", "Brix", "Float", width=70),
		col("pol", "Pol", "Float", width=70), col("purity", "Purity", "Float", width=70), col("ph", "pH", "Float", width=55),
		col("moisture_pct", "Moisture %", "Float", width=85), col("fibre_pct", "Fibre %", "Float", width=70), col("colour_icumsa", "Colour", "Float", width=70),
		col("out_of_range", "Out", "Check", width=50), col("problems", "Outside the Limits", width=240), col("chemist", "Chemist", "Link", "User", 160)]
	return columns, data
