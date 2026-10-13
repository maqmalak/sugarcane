# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt

from sugarcane.eagleeye_survey.report_utils import col, survey_rows


def execute(filters=None):
	filters = frappe._dict(filters or {})
	season = filters.season or frappe.db.get_single_value("Sugar Settings", "active_season")
	targets = {}
	for t in frappe.get_list("Surveyor Target", filters={"season": season}, fields=["surveyor", "surveyor_name",
			"target_acres", "target_surveys", "circle"], limit_page_length=0):
		row = targets.setdefault(t.surveyor, {"surveyor": t.surveyor, "surveyor_name": t.surveyor_name, "circles": [],
			"target_acres": 0.0, "target_surveys": 0})
		row["target_acres"] += flt(t.target_acres)
		row["target_surveys"] += t.target_surveys or 0
		if t.circle:
			row["circles"].append(t.circle)
	for r in survey_rows({**filters, "season": season}, fields=["surveyor", "calc_area_acres", "overlap_status"]):
		row = targets.setdefault(r.surveyor, {"surveyor": r.surveyor, "surveyor_name": frappe.utils.get_fullname(r.surveyor),
			"circles": [], "target_acres": 0.0, "target_surveys": 0})
		row["done_acres"] = row.get("done_acres", 0) + flt(r.calc_area_acres)
		row["done_surveys"] = row.get("done_surveys", 0) + 1
		if r.overlap_status in ("Under Review", "Rejected"):
			row["overlaps"] = row.get("overlaps", 0) + 1
	days = {}
	for a in frappe.get_list("Surveyor Attendance", filters={"docstatus": 1}, fields=["surveyor", "status"], limit_page_length=0):
		days.setdefault(a.surveyor, [0, 0])
		days[a.surveyor][0] += 1
		days[a.surveyor][1] += a.status == "Out of Area"
	data = []
	for row in targets.values():
		row["circles"] = ", ".join(row["circles"])
		row.setdefault("done_acres", 0)
		row.setdefault("done_surveys", 0)
		row.setdefault("overlaps", 0)
		row["acres_pct"] = 100 * row["done_acres"] / row["target_acres"] if row["target_acres"] else 0
		row["surveys_pct"] = 100 * row["done_surveys"] / row["target_surveys"] if row["target_surveys"] else 0
		row["days_present"], row["days_out_of_area"] = days.get(row["surveyor"], [0, 0])
		data.append(row)
	columns = [col("surveyor_name", "Surveyor", width=150), col("surveyor", "User", "Link", "User", 200),
		col("circles", "Circles", width=170), col("target_acres", "Target (acres)", "Float", width=105),
		col("done_acres", "Surveyed (acres)", "Float", width=120), col("acres_pct", "Area Achieved %", "Percent", width=120),
		col("target_surveys", "Target Fields", "Int", width=100), col("done_surveys", "Fields Surveyed", "Int", width=110),
		col("surveys_pct", "Fields Achieved %", "Percent", width=125), col("overlaps", "Overlapping Fields", "Int", width=125),
		col("days_present", "Days Worked", "Int", width=95), col("days_out_of_area", "Out of Area Days", "Int", width=120)]
	chart = {"data": {"labels": [d["surveyor_name"] for d in data], "datasets": [
		{"name": _("Target (acres)"), "values": [round(d["target_acres"]) for d in data]},
		{"name": _("Surveyed (acres)"), "values": [round(d["done_acres"]) for d in data]}]}, "type": "bar",
		"colors": ["#ced4da", "#2f9e44"]} if data else None
	return columns, data, None, chart
