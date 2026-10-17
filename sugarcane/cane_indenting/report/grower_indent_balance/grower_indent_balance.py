# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt

from collections import defaultdict

from sugarcane.cane_indenting import generator
from sugarcane.cane_indenting.report_utils import col, season_of


def execute(filters=None):
	filters = frappe._dict(filters or {})
	season = season_of(filters)
	visible = set(frappe.get_list("Cane Circle", pluck="name", limit_page_length=0))
	growers = {}
	for b in generator.entitlements(season):
		if b["circle"] not in visible or (filters.circle and b["circle"] != filters.circle) or (filters.grower and b["grower"] != filters.grower):
			continue
		if filters.village and b["village"] != filters.village:
			continue
		g = growers.setdefault(b["grower"], {"grower": b["grower"], "grower_name": b["grower_name"], "circle": b["circle"],
			"village": b["village"], "expected": 0.0, "entitled": 0.0, "loads": 0})
		g["expected"] += b["expected"]
		g["entitled"] += b["entitled"]
		g["loads"] += b["loads"]
	counts = defaultdict(lambda: defaultdict(int))
	for r in frappe.get_all("Cane Indent", filters={"season": season, "grower": ["in", list(growers) or [""]]},
			fields=["grower", "status", "docstatus"]):
		if r.docstatus < 2:
			counts[r.grower]["issued"] += 1
		counts[r.grower][r.status.lower()] += 1
	rows = []
	for g in sorted(growers.values(), key=lambda x: x["grower"]):
		c = counts[g["grower"]]
		rows.append({**g, "issued": c["issued"], "used": c["used"], "expired": c["expired"], "pending": c["authorized"] + c["printed"],
			"balance": g["loads"] - c["issued"]})
	columns = [col("grower", "Grower ID", "Link", "Grower", 115), col("grower_name", "Grower", width=170),
		col("circle", "Circle", "Link", "Cane Circle", 110), col("village", "Village", "Link", "Cane Village", 90),
		col("expected", "Surveyed (md)", "Float", width=110), col("entitled", "Entitled (md)", "Float", width=105),
		col("loads", "Entitled Loads", "Int", width=105), col("issued", "Issued", "Int", width=70), col("pending", "Not Used Yet", "Int", width=95),
		col("used", "Used", "Int", width=60), col("expired", "Expired", "Int", width=70), col("balance", "Loads Still to Issue", "Int", width=130)]
	return columns, rows
