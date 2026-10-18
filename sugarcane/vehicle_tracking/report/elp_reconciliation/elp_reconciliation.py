# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, getdate, now_datetime, nowdate

from sugarcane.vehicle_tracking.report_utils import POINT, REG, VEH, col, dates, hours_since, rows, standard_minutes

def execute(filters=None):
	"""Per circle and day: indents valid vs loads registered, arrived, accepted and rejected — and the gaps."""
	f = frappe._dict(filters or {})
	start, end = dates(f)
	q = {"docstatus": 1, "indent_date": ["between", [start, end]]}
	if f.circle:
		q["circle"] = f.circle
	ind = defaultdict(int)
	for i in frappe.get_list("Cane Indent", filters=q, fields=["circle", "indent_date"], limit_page_length=0):
		ind[(i.circle, getdate(i.indent_date))] += 1
	reg = defaultdict(lambda: defaultdict(int))
	for r in rows(filters):
		d = reg[(r.circle, getdate(r.registered_at))]
		d["registered"] += 1
		d[r.status] += 1
	data = []
	for key in sorted(set(ind) | set(reg), key=lambda k: (k[1], k[0] or "")):
		d = reg.get(key, {})
		registered = d.get("registered", 0)
		data.append({"date": key[1], "circle": key[0], "indents": ind.get(key, 0), "registered": registered,
			"not_registered": max(ind.get(key, 0) - registered, 0), "arrived": d.get("Arrived", 0) + d.get("Accepted", 0) + d.get("Rejected", 0),
			"not_arrived": d.get("In Transit", 0), "accepted": d.get("Accepted", 0), "rejected": d.get("Rejected", 0), "cancelled": d.get("Cancelled", 0)})
	columns = [col("date", "Date", "Date", width=100), col("circle", "Circle", "Link", "Cane Circle", 120), col("indents", "Indents (supply day)", "Int", width=130),
		col("registered", "Registered", "Int", width=90), col("not_registered", "Not Registered", "Int", width=110), col("arrived", "Arrived", "Int", width=80),
		col("not_arrived", "Not Arrived", "Int", width=95), col("accepted", "Accepted", "Int", width=85), col("rejected", "Rejected", "Int", width=80),
		col("cancelled", "Cancelled", "Int", width=85)]
	return columns, data
