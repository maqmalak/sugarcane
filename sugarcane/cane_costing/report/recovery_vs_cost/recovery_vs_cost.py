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
	"""Recovery % and cost per kg side by side. Month: each costing run (or the books, for a month without one). Circle: the
	circle's recovery from vehicle samples, its cane cost per ton, and the cost per kg that recovery gives at the period's
	processing cost and by-product credit per ton of cane."""
	from sugarcane.cane_costing.costing import compute

	f = frappe._dict(filters or {})
	season, start, end = period(f)
	company = frappe.db.get_single_value("Sugar Settings", "company")
	if (f.view or "Month") == "Month":
		rows, d = [], start.replace(day=1)
		while d <= end:
			last = min(add_days(d.replace(month=d.month % 12 + 1, year=d.year + (d.month == 12)), -1), end)
			run = frappe.db.get_value("Costing Run", {"docstatus": 1, "from_date": [">=", d], "to_date": ["<=", last]},
				["name", "recovery_pct", "cost_per_kg", "cost_per_bag", "cane_tons"], as_dict=True)
			if not run:
				r = compute(company, max(d, start), last, season, standalone=True)
				run = frappe._dict(name=None, recovery_pct=r["recovery_pct"], cost_per_kg=r["per_kg"], cost_per_bag=r["per_bag"], cane_tons=r["cane_tons"])
			if flt(run.cane_tons):
				rows.append({"period": d.strftime("%b %Y"), "cane_tons": flt(run.cane_tons), "recovery": flt(run.recovery_pct), "per_kg": round(flt(run.cost_per_kg), 2),
					"per_bag": flt(run.cost_per_bag), "run": run.name})
			d = add_days(last, 1)
		cols = [col("period", "Month", width=100), col("cane_tons", "Cane (t)", "Float", width=100), col("recovery", "Recovery %", "Percent", width=100),
			col("per_kg", "Cost per kg", "Currency", width=110), col("per_bag", "Cost per Bag", "Currency", width=115), col("run", "Costing Run", "Link", "Costing Run", 120)]
		chart = {"data": {"labels": [r["period"] for r in rows], "datasets": [{"name": "Cost per kg", "values": [r["per_kg"] for r in rows]}]}, "type": "bar"}
		return cols, rows, None, chart
	r = compute(company, start, end, season, standalone=True)
	tons = r["cane_tons"] or 1
	processing_t = (r["processing"] - r["credit"]) / tons  # net of by-products, per ton of cane
	rows = []
	for c in frappe.db.sql("""select c.circle, sum(c.payable_kg) kg, sum(c.govt_value + c.subsidy + c.additional_subsidy) cane_value,
			avg(v.est_recovery_pct) rec, count(v.name) samples from `tabCane Purchase Receipt` c
			left join `tabVehicle Recovery Sample` v on v.cpr = c.name and v.docstatus = 1
			where c.docstatus = 1 and c.posting_date between %s and %s group by c.circle order by kg desc""", (start, end), as_dict=True):
		rec = flt(c.rec) or r["recovery_pct"]
		cane_t = flt(c.cane_value) / (flt(c.kg) / 1000) if c.kg else 0
		per_kg = (cane_t + processing_t) / (rec * 10) if rec else 0
		rows.append({"circle": c.circle, "cane_tons": round(flt(c.kg) / 1000, 1), "samples": c.samples, "recovery": round(rec, 2),
			"cane_cost_t": round(cane_t, 2), "per_kg": round(per_kg, 2), "per_bag": round(per_kg * 50, 2)})
	cols = [col("circle", "Circle", "Link", "Cane Circle", 130), col("cane_tons", "Cane (t)", "Float", width=95), col("samples", "Vehicle Samples", "Int", width=110),
		col("recovery", "Recovery %", "Percent", width=95), col("cane_cost_t", "Cane Cost / t", "Currency", width=115),
		col("per_kg", "Cost per kg (est.)", "Currency", width=125), col("per_bag", "Cost per Bag (est.)", "Currency", width=130)]
	return cols, rows
