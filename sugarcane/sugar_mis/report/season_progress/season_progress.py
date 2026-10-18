# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import cint, flt, getdate

from sugarcane.cane_procurement.procurement import settings
from sugarcane.cane_procurement.report_utils import col


def execute(filters=None):
	"""Day by day through the season: cane bought (gate / depots), crushed, sugar made and recovery, with the running totals
	against the season's crushing target."""
	f = frappe._dict(filters or {})
	season = f.season or settings().season
	s = frappe.db.get_value("Crushing Season", season, ["start_date", "end_date", "crushing_target_maund", "daily_intake_maund"], as_dict=True)
	upto = getdate(f.to_date) if f.to_date else None
	cane = {r.day: r for r in frappe.db.sql("""select posting_date day, count(*) loads, count(distinct grower) growers,
		sum(payable_maund) maund, sum(case when ifnull(purchase_depot, '') = '' then payable_maund else 0 end) gate,
		sum(payable_cpr) payable from `tabCane Purchase Receipt` where docstatus = 1 and season = %s group by posting_date""", season, as_dict=True)}
	dmr = {r.crushing_day: r for r in frappe.get_all("Daily Manufacturing Report", filters={"season": season, "docstatus": ["<", 2]},
		fields=["crushing_day", "status", "cane_crushed_maund", "sugar_bags", "recovery_pct", "stoppage_minutes", "capacity_use_pct"])}
	days = sorted(set(cane) | set(dmr))
	if upto:
		days = [d for d in days if d <= upto]
	target = flt(s.crushing_target_maund) if s else 0
	rows, cum, crushed, bags = [], 0.0, 0.0, 0.0
	for d in days:
		c, m = cane.get(d) or frappe._dict(), dmr.get(d) or frappe._dict()
		cum += flt(c.maund)
		crushed += flt(m.cane_crushed_maund)
		bags += flt(m.sugar_bags)
		rows.append({"day": d, "loads": cint(c.loads), "growers": cint(c.growers), "gate": flt(c.gate), "depot": flt(c.maund) - flt(c.gate),
			"maund": flt(c.maund), "vs_intake": round(100 * flt(c.maund) / flt(s.daily_intake_maund), 1) if s and flt(s.daily_intake_maund) else None,
			"payable": flt(c.payable), "crushed": flt(m.cane_crushed_maund), "bags": flt(m.sugar_bags), "recovery": flt(m.recovery_pct) or None,
			"stoppage": cint(m.stoppage_minutes), "capacity": flt(m.capacity_use_pct) or None, "dmr": m.status, "cum_maund": round(cum, 1),
			"cum_pct": round(100 * cum / target, 2) if target else None, "cum_crushed": round(crushed, 1), "cum_bags": bags})
	cols = [col("day", "Day", "Date", width=95), col("loads", "Loads", "Int", width=65), col("growers", "Growers", "Int", width=75),
		col("gate", "Gate Maund", "Float", width=100), col("depot", "Depot Maund", "Float", width=100), col("maund", "Bought Maund", "Float", width=110),
		col("vs_intake", "% of Daily Intake", "Percent", width=100), col("payable", "Payable to Growers", "Currency", width=130),
		col("crushed", "Crushed Maund", "Float", width=110), col("bags", "Sugar Bags", "Float", width=95), col("recovery", "Recovery %", "Percent", width=90),
		col("stoppage", "Stoppage Min", "Int", width=95), col("capacity", "Capacity Use %", "Percent", width=100), col("dmr", "DMR", width=85),
		col("cum_maund", "Season Maund", "Float", width=115), col("cum_pct", "% of Target", "Percent", width=90),
		col("cum_crushed", "Season Crushed", "Float", width=115), col("cum_bags", "Season Bags", "Float", width=100)]
	chart = {"data": {"labels": [str(r["day"]) for r in rows], "datasets": [{"name": "Bought", "values": [r["maund"] for r in rows]},
		{"name": "Crushed", "values": [r["crushed"] for r in rows]}]}, "type": "bar"}
	summary = [{"label": "Season maund", "value": round(cum, 0), "datatype": "Float", "indicator": "blue"},
		{"label": "Target", "value": target, "datatype": "Float"},
		{"label": "% of target", "value": round(100 * cum / target, 2) if target else 0, "datatype": "Percent", "indicator": "orange"},
		{"label": "Sugar bags", "value": bags, "datatype": "Float", "indicator": "green"}]
	return cols, rows, None, chart, summary
