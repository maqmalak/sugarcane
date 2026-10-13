# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, getdate

from sugarcane.eagleeye_survey.report_utils import col


def execute(filters=None):
	filters = frappe._dict(filters or {})
	f = {"docstatus": 1}
	if filters.from_date and filters.to_date:
		f["attendance_date"] = ["between", [filters.from_date, filters.to_date]]
	if filters.surveyor:
		f["surveyor"] = filters.surveyor
	if filters.circle:
		f["circle"] = filters.circle
	if filters.status:
		f["status"] = filters.status
	rows = frappe.get_list("Surveyor Attendance", filters=f, fields=["name", "attendance_date", "surveyor", "surveyor_name",
		"circle", "status", "time_in", "time_out", "working_hours", "distance_km", "inside_geofence_in", "inside_geofence_out",
		"device"], order_by="attendance_date desc, surveyor asc", limit_page_length=0)
	surveys = {}
	for s in frappe.get_list("Cane Survey", filters={"docstatus": 1, "surveyor": ["in", list({r.surveyor for r in rows}) or [""]]},
			fields=["surveyor", "survey_date", "calc_area_acres"], limit_page_length=0):
		k = (s.surveyor, getdate(s.survey_date))
		n, a = surveys.get(k, (0, 0.0))
		surveys[k] = (n + 1, a + flt(s.calc_area_acres))
	for r in rows:
		r.surveys, r.surveyed_acres = surveys.get((r.surveyor, getdate(r.attendance_date)), (0, 0.0))
	columns = [
		col("attendance_date", "Date", "Date", width=95), col("surveyor_name", "Surveyor", width=150),
		col("surveyor", "User", "Link", "User", 190), col("circle", "Circle", "Link", "Cane Circle", 110),
		col("status", "Status", width=100), col("time_in", "Check In", "Datetime", width=150),
		col("time_out", "Check Out", "Datetime", width=150), col("working_hours", "Hours", "Float", width=70),
		col("distance_km", "Distance (km)", "Float", width=100), col("inside_geofence_in", "In Geofence (In)", "Check", width=110),
		col("inside_geofence_out", "In Geofence (Out)", "Check", width=115), col("surveys", "Fields Surveyed", "Int", width=110),
		col("surveyed_acres", "Acres Surveyed", "Float", width=110), col("name", "Attendance", "Link", "Surveyor Attendance", 140),
	]
	summary = [
		{"label": _("Days"), "value": len(rows), "indicator": "blue"},
		{"label": _("Out of Area"), "value": sum(1 for r in rows if r.status == "Out of Area"), "indicator": "red"},
		{"label": _("Half Days"), "value": sum(1 for r in rows if r.status == "Half Day"), "indicator": "orange"},
		{"label": _("Avg Hours"), "value": round(sum(flt(r.working_hours) for r in rows) / len(rows), 1) if rows else 0, "indicator": "green"},
	]
	return columns, rows, None, None, summary
