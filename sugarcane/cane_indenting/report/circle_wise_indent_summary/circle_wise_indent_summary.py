# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt

from collections import defaultdict

from sugarcane.cane_indenting import generator
from sugarcane.cane_indenting.report_utils import col, season_of
from sugarcane.quota import season_quotas


def execute(filters=None):
	filters = frappe._dict(filters or {})
	season = season_of(filters)
	ent = generator.entitlements(season)
	quotas = season_quotas(season)
	f = {"season": season}
	if filters.circle:
		f["circle"] = filters.circle
	data = defaultdict(lambda: defaultdict(float))
	growers = defaultdict(set)
	for b in ent:
		if not filters.circle or b["circle"] == filters.circle:
			d = data[b["circle"]]
			d["expected"] += b["expected"]
			d["entitled"] += b["entitled"]
			d["loads"] += b["loads"]
			growers[b["circle"]].add(b["grower"])
	for r in frappe.get_list("Cane Indent", filters=f, fields=["circle", "status", "docstatus", "load_maund"], limit_page_length=0):
		d = data[r.circle]
		if r.docstatus < 2:
			d["issued"] += 1
			d["issued_maund"] += flt(r.load_maund)
		d[r.status.lower()] += 1
	visible = set(frappe.get_list("Cane Circle", pluck="name", limit_page_length=0))
	rows = []
	for circle, d in sorted(data.items()):
		if circle not in visible:
			continue
		rows.append({"circle": circle, "quota": quotas.get(circle, 0), "expected": d["expected"], "entitled": d["entitled"],
			"growers": len(growers[circle]), "loads": int(d["loads"]), "issued": int(d["issued"]), "issued_maund": d["issued_maund"],
			"cover": 100 * d["issued"] / d["loads"] if d["loads"] else 0, "draft": int(d["draft"]), "authorized": int(d["authorized"]),
			"printed": int(d["printed"]), "used": int(d["used"]), "expired": int(d["expired"]), "cancelled": int(d["cancelled"])})
	columns = [col("circle", "Circle", "Link", "Cane Circle", 130), col("quota", "Season Quota (md)", "Float", width=130),
		col("expected", "Surveyed (md)", "Float", width=115), col("entitled", "Entitled (md)", "Float", width=110),
		col("growers", "Growers", "Int", width=75), col("loads", "Entitled Loads", "Int", width=105), col("issued", "Indents Issued", "Int", width=105),
		col("issued_maund", "Issued (md)", "Float", width=100), col("cover", "Issued % of Loads", "Percent", width=115),
		col("draft", "Draft", "Int", width=60), col("authorized", "Authorized", "Int", width=85), col("printed", "Printed", "Int", width=70),
		col("used", "Used", "Int", width=60), col("expired", "Expired", "Int", width=70), col("cancelled", "Cancelled", "Int", width=80)]
	chart = {"data": {"labels": [r["circle"] for r in rows], "datasets": [{"name": _("Entitled loads"), "values": [r["loads"] for r in rows]},
		{"name": _("Indents issued"), "values": [r["issued"] for r in rows]}]}, "type": "bar"}
	return columns, rows, None, chart
