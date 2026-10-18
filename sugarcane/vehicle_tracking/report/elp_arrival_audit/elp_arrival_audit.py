# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, getdate, now_datetime, nowdate

from sugarcane.vehicle_tracking.report_utils import POINT, REG, VEH, col, dates, hours_since, rows, standard_minutes

def execute(filters=None):
	"""Every arrival: where the gate photos were taken, journey against standard and average, and the audit verdict."""
	from sugarcane.calc import geo

	s = frappe.get_cached_doc("Sugar Settings")
	data = [r for r in rows(filters) if r.arrived_at]
	std = standard_minutes()
	for r in data:
		r.gps_arrival = f"{r.arrival_latitude:.6f}, {r.arrival_longitude:.6f}" if r.arrival_latitude else "gate PC"
		r.mill_m = round(geo.distance_m(r.arrival_latitude, r.arrival_longitude, s.mill_latitude, s.mill_longitude)) \
			if r.arrival_latitude and s.mill_latitude else None
		r.standard = std.get((r.point_type, r.loading_point or r.depot)) or None
	columns = [REG, VEH, POINT, col("arrived_at", "Arrived", "Datetime", width=150), col("gps_arrival", "GPS at Gate", width=170),
		col("mill_m", "From Mill (m)", "Int", width=95), col("arrival_cell_id", "Tower Id", width=90), col("arrival_serial_no", "Serial No.", width=150),
		col("transit_minutes", "Journey (min)", "Int", width=95), col("standard", "Standard (min)", "Int", width=100), col("average_minutes", "Average (min)", "Int", width=100),
		col("late_minutes", "Late (min)", "Int", width=80), col("status", "Status", width=90), col("decided_by", "Verified By", "Link", "User", 150),
		col("reject_reason", "Reject Reason", width=180)]
	return columns, data
