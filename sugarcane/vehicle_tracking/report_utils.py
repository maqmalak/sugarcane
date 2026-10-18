"""Shared code for the ELP MIS reports: filters, columns and registration rows (permission-aware)."""

import frappe
from frappe import _
from frappe.utils import add_days, cint, get_datetime, getdate, now_datetime, nowdate

FIELDS = ["name", "status", "point_type", "loading_point", "depot", "point_name", "circle", "registered_at", "expected_arrival",
	"arrived_at", "decided_at", "decided_by", "indent", "grower", "grower_name", "vehicle_no", "vehicle_type", "driver_name",
	"reject_reason", "late_minutes", "transit_minutes", "average_minutes", "registered_by", "device", "serial_no", "cell_id",
	"latitude", "longitude", "point_latitude", "point_longitude", "distance_from_point_m", "inside_geofence", "arrival_latitude",
	"arrival_longitude", "arrival_cell_id", "arrival_serial_no", "arrival_by", "lp_verified", "gps_accuracy_m"]


def col(fieldname, label, fieldtype="Data", options=None, width=120):
	return {"fieldname": fieldname, "label": _(label), "fieldtype": fieldtype, "options": options, "width": width}


def dates(filters):
	f = frappe._dict(filters or {})
	return getdate(f.from_date or add_days(nowdate(), -6)), getdate(f.to_date or nowdate())


def rows(filters, extra=None, fields=FIELDS):
	f = frappe._dict(filters or {})
	start, end = dates(f)
	q = {"registered_at": ["between", [f"{start} 00:00:00", f"{end} 23:59:59"]]}
	for key in ("circle", "status", "point_name", "vehicle_no"):
		if f.get(key):
			q[key] = f[key]
	q.update(extra or {})
	return frappe.get_list("LP Vehicle Registration", filters=q, fields=fields, order_by="registered_at desc", limit_page_length=0)


def hours_since(dt, now=None):
	return round(((now or now_datetime()) - get_datetime(dt)).total_seconds() / 3600, 1) if dt else None


def standard_minutes():
	out = {}
	for dt in ("Loading Point", "Cane Depot"):
		for r in frappe.get_all(dt, fields=["name", "journey_to_mill_min"]):
			out[(dt, r.name)] = cint(r.journey_to_mill_min)
	return out


REG = col("name", "Registration", "Link", "LP Vehicle Registration", 130)
VEH = col("vehicle_no", "Vehicle", width=110)
POINT = col("point_name", "Point", width=150)
