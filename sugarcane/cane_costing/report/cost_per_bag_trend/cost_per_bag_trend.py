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
	"""Each production day: stock cost per bag and the provisional full cost (budgeted processing); the costing run's final cost
	per bag for its period beside them."""
	f = frappe._dict(filters or {})
	_season, start, end = period(f)
	runs = frappe.get_all("Costing Run", filters={"docstatus": 1, "to_date": [">=", start], "from_date": ["<=", end]},
		fields=["name", "from_date", "to_date", "cost_per_bag"])
	rows = []
	for p in frappe.get_all("Daily Production Entry", filters={"docstatus": 1, "crushing_day": ["between", [start, end]]},
			fields=["crushing_day", "bags_produced", "cost_per_bag", "provisional_cost_per_bag"], order_by="crushing_day asc", limit=0):
		run = next((r for r in runs if getdate(r.from_date) <= getdate(p.crushing_day) <= getdate(r.to_date)), None)
		rows.append({"day": p.crushing_day, "bags": p.bags_produced, "stock": flt(p.cost_per_bag), "provisional": flt(p.provisional_cost_per_bag) or None,
			"final": flt(run.cost_per_bag) if run else None, "run": run.name if run else None})
	cols = [col("day", "Day", "Date", width=95), col("bags", "Bags", "Int", width=70), col("stock", "Stock Cost / Bag", "Currency", width=125),
		col("provisional", "Provisional / Bag", "Currency", width=125), col("final", "Final / Bag (Costing Run)", "Currency", width=160),
		col("run", "Costing Run", "Link", "Costing Run", 120)]
	chart = {"data": {"labels": [str(r["day"]) for r in rows], "datasets": [{"name": "Stock cost", "values": [r["stock"] for r in rows]},
		{"name": "Provisional", "values": [r["provisional"] or 0 for r in rows]}, {"name": "Final", "values": [r["final"] or 0 for r in rows]}]},
		"type": "line"}
	return cols, rows, None, chart
