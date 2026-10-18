# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, getdate, now_datetime, nowdate

from sugarcane.vehicle_tracking.report_utils import POINT, REG, VEH, col, dates, hours_since, rows, standard_minutes

def execute(filters=None):
	"""Each completed journey against the point's standard time and its own average — long journeys stand out."""
	std = standard_minutes()
	data = [r for r in rows(filters) if r.transit_minutes]
	for r in data:
		r.standard = std.get((r.point_type, r.loading_point or r.depot)) or None
		r.vs_standard = r.transit_minutes - r.standard if r.standard else None
		r.vs_average = r.transit_minutes - r.average_minutes if r.average_minutes else None
	columns = [REG, VEH, POINT, col("registered_at", "Departed", "Datetime", width=150), col("arrived_at", "Arrived", "Datetime", width=150),
		col("transit_minutes", "Journey (min)", "Int", width=95), col("standard", "Standard (min)", "Int", width=100),
		col("vs_standard", "vs Standard", "Int", width=90), col("average_minutes", "Average (min)", "Int", width=100), col("vs_average", "vs Average", "Int", width=90),
		col("status", "Status", width=90)]
	by = defaultdict(list)
	for r in data:
		by[r.point_name].append(r.transit_minutes)
	labels = sorted(by)
	chart = {"data": {"labels": labels, "datasets": [{"name": _("Average journey (min)"), "values": [round(sum(by[k]) / len(by[k])) for k in labels]}]},
		"type": "bar"}
	return columns, sorted(data, key=lambda r: -(r.vs_standard or 0)), None, chart
