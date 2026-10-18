# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, getdate, now_datetime, nowdate

from sugarcane.vehicle_tracking.report_utils import POINT, REG, VEH, col, dates, hours_since, rows, standard_minutes

def execute(filters=None):
	"""Vehicles registered at a point that have not reached the mill gate."""
	now = now_datetime()
	data = rows(filters, {"status": "In Transit"})
	for r in data:
		r.hours = hours_since(r.registered_at, now)
		r.overdue_min = max(0, int((now - get_datetime(r.expected_arrival)).total_seconds() // 60)) if r.expected_arrival else None
	columns = [REG, VEH, POINT, col("grower_name", "Grower", width=150), col("registered_at", "Registered", "Datetime", width=150),
		col("expected_arrival", "Expected", "Datetime", width=150), col("hours", "Hours on Road", "Float", width=105),
		col("overdue_min", "Overdue (min)", "Int", width=100), col("driver_name", "Driver", width=120)]
	return columns, sorted(data, key=lambda r: -(r.overdue_min or 0))
