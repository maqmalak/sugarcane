# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt

from sugarcane.eagleeye_survey.report_utils import col, grouped


def actual_by_variety(season):
	"""Payable maunds received per variety from submitted CPRs; the variety is the one on the CPR's indent (from the survey)."""
	rows = frappe.db.sql("""select i.variety, sum(c.payable_maund) maund from `tabCane Purchase Receipt` c
		join `tabCane Indent` i on i.name = c.indent where c.docstatus = 1 and c.season = %s group by i.variety""", season, as_dict=True)
	return {r.variety: flt(r.maund) for r in rows}


def execute(filters=None):
	filters = frappe._dict(filters or {})
	season = filters.season or frappe.db.get_single_value("Sugar Settings", "active_season")
	actual = actual_by_variety(season)

	def extra(key, rows):
		expected = sum(flt(r.expected_production_maund) for r in rows)
		got = actual.get(key[0], 0)
		area = sum(flt(r.calc_area_acres) for r in rows)
		return {"actual_maund": got, "actual_yield": got / area if area else 0,
			"achieved_pct": 100 * got / expected if expected else 0}

	columns, data, _msg, chart = grouped(filters, [col("variety", "Variety", "Link", "Cane Variety", 130)], extra=extra)
	columns += [col("actual_maund", "Actual Received (maund)", "Float", width=160),
		col("actual_yield", "Actual Yield (md/acre)", "Float", width=150), col("achieved_pct", "Achieved (%)", "Percent", width=110)]
	if data:
		t = data[-1]  # total row: ratios recomputed, not summed
		t["actual_yield"] = t["actual_maund"] / t["acres"] if t["acres"] else 0
		t["achieved_pct"] = 100 * t["actual_maund"] / t["expected_maund"] if t["expected_maund"] else 0
	message = None if actual else _("Actual receipts come from CPRs (Phase 3); none are recorded for this season yet.")
	rows = [d for d in data if not d.get("bold")]
	if rows:
		chart = {"data": {"labels": [d["variety"] for d in rows], "datasets": [
			{"name": _("Expected (maund)"), "values": [round(d["expected_maund"]) for d in rows]},
			{"name": _("Actual (maund)"), "values": [round(d["actual_maund"]) for d in rows]}]}, "type": "bar",
			"colors": ["#74c0fc", "#2f9e44"]}
	return columns, data, message, chart
