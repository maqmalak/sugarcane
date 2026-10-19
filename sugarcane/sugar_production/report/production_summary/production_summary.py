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
	"""Cane crushed, sugar bags by grade, recovery and by-products, by day / week / month (approved DMRs)."""
	f = frappe._dict(filters or {})
	season, start, end = period(f)
	by = f.group_by or "Day"
	grades = frappe.get_all("Sugar Grade", filters={"is_active": 1}, pluck="name", order_by="sequence asc")
	dmrs = frappe.get_all("Daily Manufacturing Report", filters={"docstatus": 1, "crushing_day": ["between", [start, end]]},
		fields=["name", "crushing_day", "cane_crushed_kg", "sugar_bags", "sugar_kg", "molasses_kg", "bagasse_kg", "bagasse_burnt_kg",
			"press_mud_kg", "stoppage_minutes", "running_hours"], order_by="crushing_day asc", limit=0)
	gb = {}
	for r in frappe.db.sql("""select parent, grade, sum(bags) bags from `tabDMR Grade Output` where parent in %s group by parent, grade""",
			([d.name for d in dmrs] or [""],), as_dict=True):
		gb.setdefault(r.parent, {})[r.grade] = cint(r.bags)
	rows = {}
	for d in dmrs:
		day = getdate(d.crushing_day)
		key = str(day) if by == "Day" else (f"{day.isocalendar()[0]}-W{day.isocalendar()[1]:02d}" if by == "Week" else day.strftime("%Y-%m"))
		r = rows.setdefault(key, {"period": key, "days": 0, "cane": 0.0, "bags": 0, "sugar": 0.0, "molasses": 0.0, "bagasse": 0.0, "burnt": 0.0,
			"press_mud": 0.0, "stopped": 0.0, **{f"g_{frappe.scrub(g)}": 0 for g in grades}})
		r["days"] += 1
		r["cane"] += flt(d.cane_crushed_kg) / 1000
		r["bags"] += cint(d.sugar_bags)
		r["sugar"] += flt(d.sugar_kg) / 1000
		for k, fld in (("molasses", "molasses_kg"), ("bagasse", "bagasse_kg"), ("burnt", "bagasse_burnt_kg"), ("press_mud", "press_mud_kg")):
			r[k] += flt(d.get(fld)) / 1000
		r["stopped"] += flt(d.stoppage_minutes) / 60
		split = gb.get(d.name) or ({grades[0]: cint(d.sugar_bags)} if grades else {})
		for g, n in split.items():
			r[f"g_{frappe.scrub(g)}"] = r.get(f"g_{frappe.scrub(g)}", 0) + n
	out = []
	for r in rows.values():
		c = r["cane"] or 1
		r.update({"recovery": round(100 * r["sugar"] / c, 2), "molasses_pct": round(100 * r["molasses"] / c, 2),
			"bagasse_pct": round(100 * r["bagasse"] / c, 2), "press_mud_pct": round(100 * r["press_mud"] / c, 2)})
		out.append({k: (round(v, 2) if isinstance(v, float) else v) for k, v in r.items()})
	cols = [col("period", by, width=100), col("days", "Days", "Int", width=60), col("cane", "Cane Crushed (t)", "Float", width=120)]
	cols += [col(f"g_{frappe.scrub(g)}", f"Bags {g}", "Int", width=90) for g in grades]
	cols += [col("bags", "Bags Total", "Int", width=95), col("sugar", "Sugar (t)", "Float", width=90), col("recovery", "Recovery %", "Percent", width=90),
		col("molasses", "Molasses (t)", "Float", width=100), col("molasses_pct", "Molasses % Cane", "Percent", width=110),
		col("bagasse", "Bagasse (t)", "Float", width=95), col("burnt", "Burnt (t)", "Float", width=85), col("bagasse_pct", "Bagasse % Cane", "Percent", width=110),
		col("press_mud", "Press Mud (t)", "Float", width=100), col("press_mud_pct", "Press Mud % Cane", "Percent", width=115),
		col("stopped", "Stopped (h)", "Float", width=90)]
	chart = {"data": {"labels": [r["period"] for r in out], "datasets": [{"name": "Bags", "values": [r["bags"] for r in out]}]}, "type": "bar"}
	tc = sum(r["cane"] for r in out) or 1
	summary = [{"label": "Cane crushed (t)", "value": round(sum(r["cane"] for r in out), 1), "datatype": "Float"},
		{"label": "Bags", "value": sum(r["bags"] for r in out), "datatype": "Int", "indicator": "green"},
		{"label": "Recovery %", "value": round(100 * sum(r["sugar"] for r in out) / tc, 2), "datatype": "Percent", "indicator": "blue"}]
	return cols, out, None, chart, summary
