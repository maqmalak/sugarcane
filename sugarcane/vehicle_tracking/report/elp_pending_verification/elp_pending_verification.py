# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, getdate, now_datetime, nowdate

from sugarcane.vehicle_tracking.report_utils import POINT, REG, VEH, col, dates, hours_since, rows, standard_minutes

def execute(filters=None):
	"""Arrived vehicles (gate photos taken) waiting for the audit team."""
	now = now_datetime()
	data = rows(filters, {"status": "Arrived"})
	for r in data:
		r.waiting_min = int((now - get_datetime(r.arrived_at)).total_seconds() // 60) if r.arrived_at else None
	columns = [REG, VEH, POINT, col("grower_name", "Grower", width=150), col("arrived_at", "Arrived", "Datetime", width=150),
		col("waiting_min", "Waiting (min)", "Int", width=100), col("transit_minutes", "Journey (min)", "Int", width=100),
		col("late_minutes", "Late (min)", "Int", width=85), col("arrival_by", "Gate User", "Link", "User", 150)]
	return columns, sorted(data, key=lambda r: -(r.waiting_min or 0))
