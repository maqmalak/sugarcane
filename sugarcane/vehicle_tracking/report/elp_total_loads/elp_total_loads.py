# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, getdate, now_datetime, nowdate

from sugarcane.vehicle_tracking.report_utils import POINT, REG, VEH, col, dates, hours_since, rows, standard_minutes

def execute(filters=None):
	by = defaultdict(lambda: defaultdict(int))
	for r in rows(filters):
		d = by[getdate(r.registered_at)]
		d["loads"] += 1
		d[r.status] += 1
	data = [{"date": k, "loads": v["loads"], "accepted": v["Accepted"], "rejected": v["Rejected"], "pending": v["In Transit"] + v["Arrived"],
		"cancelled": v["Cancelled"]} for k, v in sorted(by.items())]
	columns = [col("date", "Date", "Date", width=100), col("loads", "Loads Registered", "Int", width=120), col("accepted", "Accepted", "Int", width=90),
		col("rejected", "Rejected", "Int", width=85), col("pending", "Pending", "Int", width=80), col("cancelled", "Cancelled", "Int", width=85)]
	chart = {"data": {"labels": [str(d["date"]) for d in data], "datasets": [{"name": _("Loads"), "values": [d["loads"] for d in data]}]}, "type": "bar"}
	summary = [{"label": _("Total loads"), "value": sum(d["loads"] for d in data), "datatype": "Int"},
		{"label": _("Accepted"), "value": sum(d["accepted"] for d in data), "datatype": "Int", "indicator": "green"},
		{"label": _("Rejected"), "value": sum(d["rejected"] for d in data), "datatype": "Int", "indicator": "red"}]
	return columns, data, None, chart, summary
