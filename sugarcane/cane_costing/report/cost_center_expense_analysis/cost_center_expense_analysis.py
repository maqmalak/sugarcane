# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, cint, flt, getdate

from sugarcane.cane_procurement.report_utils import col


def period(f):
	"""The filters' dates, else the season's (the latest season with production when none is given)."""
	season = f.get("season") or frappe.db.get_value("Daily Production Entry", {"docstatus": 1}, "season", order_by="crushing_day desc") or \
		frappe.db.get_single_value("Sugar Settings", "active_season")
	s = frappe.db.get_value("Crushing Season", season, ["start_date", "end_date"], as_dict=True) or frappe._dict()
	return season, getdate(f.get("from_date") or s.start_date), getdate(f.get("to_date") or s.end_date)


def execute(filters=None):
	"""Processing cost by cost centre (after the service centres are allocated) and element, and per ton of cane."""
	from sugarcane.cane_costing.costing import compute
	from sugarcane.calc.costing import ELEMENTS

	f = frappe._dict(filters or {})
	season, start, end = period(f)
	r = compute(frappe.db.get_single_value("Sugar Settings", "company"), start, end, season, standalone=True)
	tons = r["cane_tons"] or 1
	by = {}
	for d in r["details"]:
		row = by.setdefault(d["cost_center"], {"cost_center": d["cost_center"], "allocated_in": 0.0, **{frappe.scrub(e): 0.0 for e in ELEMENTS}})
		row[frappe.scrub(d["element"])] = row.get(frappe.scrub(d["element"]), 0) + d["amount"]
		if d["allocated_from"]:
			row["allocated_in"] += d["amount"]
	rows = []
	for row in by.values():
		row["total"] = round(sum(row.get(frappe.scrub(e), 0) for e in ELEMENTS), 2)
		row["per_ton"] = round(row["total"] / tons, 2)
		rows.append({k: (round(v, 2) if isinstance(v, float) else v) for k, v in row.items()})
	rows.sort(key=lambda x: -x["total"])
	cols = [col("cost_center", "Cost Centre", "Link", "Cost Center", 190)] + [col(frappe.scrub(e), e, "Currency", width=120) for e in ELEMENTS]
	cols += [col("allocated_in", "Of Which Allocated In", "Currency", width=140), col("total", "Total", "Currency", width=130),
		col("per_ton", "Per Ton of Cane", "Currency", width=115)]
	summary = [{"label": "Cane crushed (t)", "value": r["cane_tons"], "datatype": "Float"},
		{"label": "Processing (elements)", "value": round(sum(x["total"] for x in rows), 2), "datatype": "Currency"},
		{"label": "Off-season share", "value": r["off_season"], "datatype": "Currency"},
		{"label": "Outside production (not costed)", "value": r["outside_production"], "datatype": "Currency"}]
	return cols, rows, None, None, summary
