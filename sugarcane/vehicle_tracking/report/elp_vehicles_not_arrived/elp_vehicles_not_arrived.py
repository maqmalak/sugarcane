# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, get_datetime, getdate, now_datetime, nowdate

from sugarcane.vehicle_tracking.report_utils import POINT, REG, VEH, col, dates, hours_since, rows, standard_minutes

def execute(filters=None):
	"""Vehicles still not at the mill more than the given hours (48 by default) after registration."""
	f = frappe._dict(filters or {})
	limit = cint(f.hours) if f.hours is not None else 48
	now = now_datetime()
	data = [r for r in rows(filters, {"status": "In Transit"}) if (hours_since(r.registered_at, now) or 0) >= limit]
	for r in data:
		r.hours = hours_since(r.registered_at, now)
	columns = [REG, VEH, POINT, col("grower_name", "Grower", width=150), col("indent", "Indent", "Link", "Cane Indent", 120),
		col("registered_at", "Registered", "Datetime", width=150), col("hours", "Hours", "Float", width=80), col("driver_name", "Driver", width=120),
		col("registered_by", "Registered By", "Link", "User", 150)]
	return columns, sorted(data, key=lambda r: -(r.hours or 0)), None, None, [{"label": _("Not arrived after {0} h").format(limit),
		"value": len(data), "datatype": "Int", "indicator": "red" if data else "green"}]
