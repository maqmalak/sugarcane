# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, flt, get_datetime, getdate, time_diff_in_hours

from sugarcane.calc import geo


class SurveyorAttendance(Document):
	def validate(self):
		self.attendance_date = getdate(self.time_in) if self.time_in else self.attendance_date
		if frappe.db.exists("Surveyor Attendance", {"surveyor": self.surveyor, "attendance_date": self.attendance_date,
				"docstatus": 1, "name": ["!=", self.name]}):
			frappe.throw(_("{0} is already checked in on {1}").format(self.surveyor, self.attendance_date))
		if not self.circle:
			self.circle = assigned_circle(self.surveyor, self.attendance_date)
		self.compute()

	def before_update_after_submit(self):
		self.compute()

	def compute(self):
		fence = geofence(self.circle)
		self.inside_geofence_in = 1 if fence(self.latitude_in, self.longitude_in) else 0
		self.inside_geofence_out = 1 if self.time_out and fence(self.latitude_out, self.longitude_out) else 0
		if self.time_out:
			if get_datetime(self.time_out) < get_datetime(self.time_in):
				frappe.throw(_("Check-out can't be before check-in"))
			self.working_hours = flt(time_diff_in_hours(self.time_out, self.time_in), 2)
		self.distance_km = flt(travelled_km(self.surveyor, self.attendance_date), 2)
		half = flt(frappe.db.get_single_value("Sugar Settings", "half_day_hours")) or 4
		if not self.inside_geofence_in:
			self.status = "Out of Area"
		elif self.time_out and self.working_hours < half:
			self.status = "Half Day"
		else:
			self.status = "Present"


def assigned_circle(surveyor, date):
	"""The circle on the surveyor's current target for the active season (also the attendance geofence)."""
	season = frappe.db.get_single_value("Sugar Settings", "active_season")
	rows = frappe.get_all("Surveyor Target", filters={"surveyor": surveyor, "season": season, "circle": ["is", "set"]},
		fields=["circle", "from_date", "to_date"], order_by="from_date desc")
	day = getdate(date)
	for r in rows:
		if (not r.from_date or getdate(r.from_date) <= day) and (not r.to_date or getdate(r.to_date) >= day):
			return r.circle
	return rows[0].circle if rows else None


def geofence(circle):
	"""point → inside the circle boundary (plus the geofence radius). Without a circle boundary, everything passes."""
	radius = flt(frappe.db.get_single_value("Sugar Settings", "geofence_radius_m")) or 200
	poly = geo.cached_polygon(frappe.db.get_value("Cane Circle", circle, "polygon")) if circle else None

	def inside(lat, lng):
		if lat is None or lng is None or (not lat and not lng):
			return False
		return True if poly is None else geo.contains_point(poly, lat, lng, buffer_m=radius)

	return inside


def travelled_km(surveyor, date):
	day = getdate(date)
	rows = frappe.get_all("Surveyor Location Log", filters={"surveyor": surveyor,
		"logged_at": ["between", [f"{day} 00:00:00", f"{add_days(day, 1)} 00:00:00"]], "accuracy_m": ["<=", 50]},
		fields=["latitude", "longitude"], order_by="logged_at asc")
	return geo.path_length_m([(r.latitude, r.longitude) for r in rows]) / 1000
