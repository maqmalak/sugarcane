# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

"""Indents that passed their last valid day without a vehicle coming in: who, where, how long ago, and whether the grower
has been given a later indent since."""

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, nowdate

from sugarcane.cane_indenting.report_utils import col, indent_filters


def execute(filters=None):
	f = indent_filters(filters)
	f["status"] = "Expired"
	rows = frappe.get_list("Cane Indent", filters=f, fields=["name", "indent_date", "valid_to", "grower", "grower_name", "cnic",
		"circle", "village_name", "variety", "crop_type", "load_maund", "source", "batch", "print_count"],
		order_by="valid_to desc, circle asc, name asc", limit_page_length=0)
	today = getdate(nowdate())
	growers = {r.grower for r in rows if r.grower}
	mobile = dict(frappe.get_all("Grower", filters={"name": ["in", list(growers)]}, fields=["name", "mobile"], as_list=True)) if growers else {}
	# later indents of the same growers that are still live or already used
	later = defaultdict(list)
	if growers:
		for i in frappe.get_all("Cane Indent", filters={"season": f["season"], "grower": ["in", list(growers)], "docstatus": 1,
				"status": ["in", ["Authorized", "Printed", "Used"]]}, fields=["grower", "indent_date"]):
			later[i.grower].append(getdate(i.indent_date))
	for r in rows:
		r.days_expired = max(date_diff(today, r.valid_to), 0)
		r.mobile = mobile.get(r.grower)
		r.later_indents = sum(1 for d in later.get(r.grower, []) if d > getdate(r.valid_to))
	columns = [col("name", "Indent No.", "Link", "Cane Indent", 130), col("indent_date", "Supply Date", "Date", width=100),
		col("valid_to", "Expired After", "Date", width=105), col("days_expired", "Days Ago", "Int", width=80),
		col("grower", "Grower ID", "Link", "Grower", 115), col("grower_name", "Grower", width=160), col("mobile", "Mobile", width=115),
		col("cnic", "CNIC", width=125), col("circle", "Circle", "Link", "Cane Circle", 110), col("village_name", "Village", width=110),
		col("variety", "Variety", "Link", "Cane Variety", 95), col("crop_type", "Plant / Ratoon", width=95),
		col("load_maund", "Load (md)", "Float", width=85), col("source", "Deliver To", "Link", "Cane Source", 140),
		col("batch", "Batch", "Link", "Indent Batch", 105), col("print_count", "Prints", "Int", width=60),
		col("later_indents", "Later Indents", "Int", width=95)]
	return columns, rows, None, None, [
		{"label": _("Expired indents"), "value": len(rows), "datatype": "Int", "indicator": "red"},
		{"label": _("Maund not supplied"), "value": sum(flt(r.load_maund) for r in rows), "datatype": "Float", "indicator": "red"},
		{"label": _("Growers"), "value": len(growers), "datatype": "Int"},
		{"label": _("Growers with no later indent"), "value": len({r.grower for r in rows if not r.later_indents}), "datatype": "Int",
			"indicator": "orange"}]
