# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, getdate, now_datetime, nowdate

from sugarcane.vehicle_tracking.report_utils import POINT, REG, VEH, col, dates, hours_since, rows, standard_minutes

def execute(filters=None):
	"""Indents valid on the day that no vehicle was registered against yet."""
	f = frappe._dict(filters or {})
	day = getdate(f.date or nowdate())
	q = {"docstatus": 1, "status": ["in", ["Authorized", "Printed"]], "valid_from": ["<=", day], "valid_to": [">=", day]}
	if f.circle:
		q["circle"] = f.circle
	busy = set(frappe.get_all("LP Vehicle Registration", filters={"status": ["!=", "Cancelled"], "indent": ["is", "set"]}, pluck="indent"))
	data = [r for r in frappe.get_list("Cane Indent", filters=q, fields=["name", "indent_date", "valid_to", "grower", "grower_name",
		"circle", "village_name", "source", "load_maund"], order_by="valid_to asc, name asc", limit_page_length=0) if r.name not in busy]
	columns = [col("name", "Indent", "Link", "Cane Indent", 130), col("indent_date", "Supply Date", "Date", width=100),
		col("valid_to", "Valid To", "Date", width=95), col("grower_name", "Grower", width=170), col("circle", "Circle", "Link", "Cane Circle", 110),
		col("village_name", "Village", width=110), col("source", "Deliver To", "Link", "Cane Source", 140), col("load_maund", "Load (md)", "Float", width=85)]
	return columns, data, None, None, [{"label": _("Indents not registered"), "value": len(data), "datatype": "Int", "indicator": "orange"}]
