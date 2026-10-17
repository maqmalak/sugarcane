# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt

from sugarcane.cane_indenting.report_utils import col, indent_filters


def execute(filters=None):
	f = indent_filters(filters)
	rows = frappe.get_list("Cane Indent", filters=f, fields=["name", "indent_date", "valid_to", "status", "grower", "grower_name",
		"cnic", "circle", "village_name", "variety", "crop_type", "load_maund", "source", "batch", "print_count", "token"],
		order_by="indent_date asc, name asc", limit_page_length=0)
	columns = [col("name", "Indent No.", "Link", "Cane Indent", 130), col("indent_date", "Supply Date", "Date", width=100),
		col("valid_to", "Valid To", "Date", width=95), col("status", "Status", width=90), col("grower", "Grower ID", "Link", "Grower", 115),
		col("grower_name", "Grower", width=160), col("cnic", "CNIC", width=125), col("circle", "Circle", "Link", "Cane Circle", 110),
		col("village_name", "Village", width=110), col("variety", "Variety", "Link", "Cane Variety", 95), col("crop_type", "Plant / Ratoon", width=95),
		col("load_maund", "Load (md)", "Float", width=85), col("source", "Deliver To", "Link", "Cane Source", 140),
		col("batch", "Batch", "Link", "Indent Batch", 105), col("print_count", "Prints", "Int", width=60), col("token", "Token", width=100)]
	return columns, rows, None, None, [
		{"label": _("Indents"), "value": len(rows), "datatype": "Int"},
		{"label": _("Maund"), "value": sum(flt(r.load_maund) for r in rows), "datatype": "Float"},
		{"label": _("Used"), "value": sum(1 for r in rows if r.status == "Used"), "datatype": "Int", "indicator": "green"},
		{"label": _("Expired"), "value": sum(1 for r in rows if r.status == "Expired"), "datatype": "Int", "indicator": "red"}]
