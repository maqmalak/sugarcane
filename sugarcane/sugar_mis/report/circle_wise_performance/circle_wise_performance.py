# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe

from sugarcane.cane_procurement.procurement import settings
from sugarcane.cane_procurement.report_utils import col
from sugarcane.sugar_mis.live import circle_performance


def execute(filters=None):
	"""Per circle: the survey (fields, acres, expected maund), the quota, indents issued / used / expired and the cane supplied —
	% of quota and % of the surveyed crop."""
	f = frappe._dict(filters or {})
	rows = circle_performance(f.season or settings().season, f.to_date)
	cols = [col("circle", "Circle", "Link", "Cane Circle", 130), col("zone", "Zone", width=100), col("fields", "Fields Surveyed", "Int", width=90),
		col("acres", "Acres", "Float", width=80), col("expected_maund", "Expected Maund", "Float", width=115), col("quota_maund", "Quota Maund", "Float", width=110),
		col("indents", "Indents", "Int", width=75), col("indent_maund", "Indent Maund", "Float", width=105), col("indents_used", "Used", "Int", width=65),
		col("indents_expired", "Expired", "Int", width=70), col("indent_use_pct", "% Used", "Percent", width=75), col("loads", "Loads", "Int", width=65),
		col("growers", "Growers", "Int", width=75), col("supplied_maund", "Supplied Maund", "Float", width=115), col("amount", "Payable", "Currency", width=120),
		col("pct_quota", "% of Quota", "Percent", width=90), col("pct_survey", "% of Survey", "Percent", width=90)]
	chart = {"data": {"labels": [r["circle"] for r in rows], "datasets": [{"name": "Supplied", "values": [r["supplied_maund"] for r in rows]},
		{"name": "Indented", "values": [r["indent_maund"] for r in rows]}]}, "type": "bar"}
	return cols, rows, None, chart
