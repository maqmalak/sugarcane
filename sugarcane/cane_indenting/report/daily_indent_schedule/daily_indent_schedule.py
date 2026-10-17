# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt

from collections import defaultdict

from frappe.utils import getdate

from sugarcane.cane_indenting import generator
from sugarcane.cane_indenting.report_utils import col, indent_filters, season_of


def execute(filters=None):
	filters = frappe._dict(filters or {})
	season = season_of(filters)
	std = generator.standards(season)
	f = indent_filters(filters)
	f["docstatus"] = ["<", 2]
	days = defaultdict(lambda: {"indents": 0, "maund": 0.0, "used": 0, "expired": 0, "circles": set()})
	for r in frappe.get_list("Cane Indent", filters=f, fields=["indent_date", "circle", "load_maund", "status"], limit_page_length=0):
		d = days[getdate(r.indent_date)]
		d["indents"] += 1
		d["maund"] += flt(r.load_maund)
		d["circles"].add(r.circle)
		d["used"] += r.status == "Used"
		d["expired"] += r.status == "Expired"
	rows = [{"indent_date": day, "indents": d["indents"], "maund": d["maund"], "capacity": std.per_day,
		"utilisation": 100 * d["indents"] / std.per_day if std.per_day else 0, "circles": len(d["circles"]), "used": d["used"],
		"expired": d["expired"]} for day, d in sorted(days.items())]
	columns = [col("indent_date", "Supply Date", "Date", width=105), col("indents", "Indents", "Int", width=80),
		col("maund", "Maund", "Float", width=100), col("capacity", "Daily Capacity (loads)", "Int", width=140),
		col("utilisation", "Capacity Used %", "Percent", width=120), col("circles", "Circles", "Int", width=70),
		col("used", "Used", "Int", width=60), col("expired", "Expired", "Int", width=70)]
	chart = {"data": {"labels": [str(r["indent_date"]) for r in rows], "datasets": [{"name": _("Indents"), "values": [r["indents"] for r in rows]}]},
		"type": "bar"}
	return columns, rows, None, chart
