# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe.utils import flt

from sugarcane.cane_procurement.report_utils import col, dates


def execute(filters=None):
	"""What a maund of cane cost the mill, per crushing day: govt value + subsidy + additional subsidy + the mill's share of road
	cess + depot freight and commission + transit shortage (net of what the contractors paid back). TPT is the grower's own cost
	(deducted from the CPR), so it is shown but not added."""
	f = frappe._dict(filters or {})
	start, end = dates(f)
	s = frappe.get_cached_doc("Sugar Settings")
	g = defaultdict(lambda: defaultdict(float))
	for r in frappe.db.sql("""select posting_date day, sum(payable_maund) maund, sum(govt_value) govt, sum(subsidy) subsidy,
			sum(additional_subsidy) additional, sum(road_cess_mill) cess, sum(tpt_amount) tpt from `tabCane Purchase Receipt`
			where docstatus = 1 and posting_date between %s and %s group by posting_date""", (start, end), as_dict=True):
		g[r.day].update({k: flt(v) for k, v in r.items() if k != "day"})
	accounts = {"freight": s.freight_account, "commission": s.depot_commission_account, "shortage": s.transit_shortage_account}
	for key, account in accounts.items():
		if not account:
			continue
		for r in frappe.db.sql("""select posting_date day, sum(debit) - sum(credit) amt from `tabGL Entry` where account = %s and is_cancelled = 0
				and posting_date between %s and %s group by posting_date""", (account, start, end), as_dict=True):
			g[r.day][key] += flt(r.amt)
	data = []
	for day, v in sorted(g.items()):
		total = v["govt"] + v["subsidy"] + v["additional"] + v["cess"] + v["freight"] + v["commission"] + v["shortage"]
		data.append({"day": day, **{k: round(x, 2) for k, x in v.items()}, "total": round(total, 2),
			"per_maund": round(total / v["maund"], 2) if v["maund"] else 0})
	columns = [col("day", "Crushing Day", "Date", width=105), col("maund", "Payable md", "Float", width=95), col("govt", "Govt Value", "Currency", width=115),
		col("subsidy", "Subsidy", "Currency", width=100), col("additional", "Add. Subsidy", "Currency", width=100), col("cess", "Cess (mill)", "Currency", width=95),
		col("freight", "Depot Freight", "Currency", width=105), col("commission", "Commission", "Currency", width=100),
		col("shortage", "Transit Shortage (net)", "Currency", width=145), col("total", "Cane Cost", "Currency", width=120),
		col("per_maund", "Cost / Maund", "Currency", width=105), col("tpt", "TPT (grower's)", "Currency", width=110)]
	if data:
		tot = {k: round(sum(r.get(k) or 0 for r in data), 2) for k in ("maund", "govt", "subsidy", "additional", "cess", "freight", "commission", "shortage", "total", "tpt")}
		tot["per_maund"] = round(tot["total"] / tot["maund"], 2) if tot["maund"] else 0
		data.append({"day": "Total", **tot})
	chart = {"data": {"labels": [str(r["day"]) for r in data[:-1]], "datasets": [{"name": "Cost / maund", "values": [r["per_maund"] for r in data[:-1]]}]},
		"type": "line"}
	return columns, data, None, chart
