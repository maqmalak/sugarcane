# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, getdate, now_datetime, nowdate

from sugarcane.vehicle_tracking.report_utils import POINT, REG, VEH, col, dates, hours_since, rows, standard_minutes

def execute(filters=None):
	std = standard_minutes()
	by = defaultdict(lambda: defaultdict(int))
	journeys = defaultdict(list)
	for r in rows(filters):
		key = (r.point_type, r.loading_point or r.depot, r.point_name, r.circle)
		d = by[key]
		d["registered"] += 1
		d[r.status] += 1
		if r.transit_minutes:
			journeys[key].append(r.transit_minutes)
	data = []
	for key, d in sorted(by.items(), key=lambda kv: kv[0][2] or ""):
		decided = d["Accepted"] + d["Rejected"]
		j = journeys[key]
		data.append({"point_name": key[2], "point_type": key[0], "circle": key[3], "registered": d["registered"], "in_transit": d["In Transit"],
			"arrived": d["Arrived"], "accepted": d["Accepted"], "rejected": d["Rejected"], "cancelled": d["Cancelled"],
			"reject_pct": 100 * d["Rejected"] / decided if decided else 0, "standard": std.get((key[0], key[1])) or None,
			"average": round(sum(j) / len(j)) if j else None})
	columns = [POINT, col("point_type", "Type", width=100), col("circle", "Circle", "Link", "Cane Circle", 110), col("registered", "Registered", "Int", width=90),
		col("in_transit", "In Transit", "Int", width=85), col("arrived", "Pending Verification", "Int", width=130), col("accepted", "Accepted", "Int", width=85),
		col("rejected", "Rejected", "Int", width=80), col("cancelled", "Cancelled", "Int", width=80), col("reject_pct", "Rejected %", "Percent", width=90),
		col("standard", "Standard Journey (min)", "Int", width=150), col("average", "Average Journey (min)", "Int", width=145)]
	chart = {"data": {"labels": [d["point_name"] for d in data], "datasets": [{"name": _("Accepted"), "values": [d["accepted"] for d in data]},
		{"name": _("Rejected"), "values": [d["rejected"] for d in data]}]}, "type": "bar", "barOptions": {"stacked": 1}}
	return columns, data, None, chart
