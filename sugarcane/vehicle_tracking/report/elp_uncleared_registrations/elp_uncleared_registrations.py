# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, getdate, now_datetime, nowdate

from sugarcane.vehicle_tracking.report_utils import POINT, REG, VEH, col, dates, hours_since, rows, standard_minutes

def execute(filters=None):
	"""Registrations neither accepted, rejected nor cancelled after the given hours."""
	f = frappe._dict(filters or {})
	limit = cint(f.hours) if f.hours is not None else 24
	now = now_datetime()
	data = [r for r in rows(filters, {"status": ["in", ["In Transit", "Arrived"]]}) if (hours_since(r.registered_at, now) or 0) >= limit]
	for r in data:
		r.hours = hours_since(r.registered_at, now)
	columns = [REG, col("status", "Status", width=90), VEH, POINT, col("grower_name", "Grower", width=150),
		col("registered_at", "Registered", "Datetime", width=150), col("hours", "Hours Open", "Float", width=95),
		col("registered_by", "Registered By", "Link", "User", 150)]
	return columns, sorted(data, key=lambda r: -(r.hours or 0))
