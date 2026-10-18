# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, getdate, now_datetime, nowdate

from sugarcane.vehicle_tracking.report_utils import POINT, REG, VEH, col, dates, hours_since, rows, standard_minutes

def execute(filters=None):
	"""Every registration with where it was really taken against the point's own coordinates, device and photo quality."""
	data = rows(filters)
	photos = defaultdict(list)
	for p in frappe.get_all("LP Vehicle Photo", filters={"parenttype": "LP Vehicle Registration", "parent": ["in", [r.name for r in data] or [""]],
			"stage": "Loading Point"}, fields=["parent", "sharpness"]):
		photos[p.parent].append(p.sharpness or 0)
	for r in data:
		r.photos = len(photos[r.name])
		r.sharpness = round(sum(photos[r.name]) / len(photos[r.name]), 1) if photos[r.name] else None
		r.gps_actual = f"{r.latitude:.6f}, {r.longitude:.6f}" if r.latitude else ""
		r.gps_point = f"{r.point_latitude:.6f}, {r.point_longitude:.6f}" if r.point_latitude else ""
	columns = [REG, col("registered_at", "Registered", "Datetime", width=150), VEH, POINT, col("indent", "Indent", "Link", "Cane Indent", 120),
		col("gps_actual", "GPS Actual", width=170), col("gps_point", "GPS as per Parameters", width=170), col("distance_from_point_m", "Distance (m)", "Float", width=95),
		col("inside_geofence", "In Geofence", "Check", width=90), col("gps_accuracy_m", "Accuracy (m)", "Float", width=95), col("photos", "Photos", "Int", width=65),
		col("sharpness", "Avg Sharpness", "Float", width=100), col("serial_no", "Serial No.", width=150), col("cell_id", "Tower Id", width=90),
		col("device", "Device", "Link", "Survey Device", 105), col("registered_by", "User", "Link", "User", 150), col("status", "Status", width=90)]
	return columns, data
