# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

from sugarcane.cane_procurement.report_utils import col
from sugarcane.depot_purchase.report_utils import dispatches


def execute(filters=None):
	"""Per depot and contractor: trucks received, sent vs received, shortage against the allowance and what was recovered."""
	rows = dispatches({**(filters or {}), "status": "Received"}, ["depot", "contractor", "dispatched_kg", "received_kg", "shortage_kg",
		"excess_shortage_kg", "allowed_shortage_pct", "shortage_value", "recovery_amount", "freight_amount", "journey_minutes"])
	g = defaultdict(lambda: defaultdict(float))
	for r in rows:
		d = g[(r.depot, r.contractor)]
		d["trucks"] += 1
		d["over"] += 1 if r.excess_shortage_kg else 0
		for k in ("dispatched_kg", "received_kg", "shortage_kg", "excess_shortage_kg", "shortage_value", "recovery_amount", "freight_amount", "journey_minutes"):
			d[k] += r.get(k) or 0
		d["allowed"] = r.allowed_shortage_pct
	data = []
	for (depot, contractor), d in sorted(g.items()):
		data.append({"depot": depot, "contractor": contractor, **d, "shortage_pct": round(d["shortage_kg"] * 100 / d["dispatched_kg"], 3) if d["dispatched_kg"] else 0,
			"avg_journey": round(d["journey_minutes"] / d["trucks"]) if d["trucks"] else None})
	columns = [col("depot", "Depot", "Link", "Cane Depot", 150), col("contractor", "Contractor", "Link", "Supplier", 160), col("trucks", "Trucks", "Int", width=70),
		col("over", "Over Allowance", "Int", width=105), col("dispatched_kg", "Sent kg", "Int", width=100), col("received_kg", "Received kg", "Int", width=100),
		col("shortage_kg", "Shortage kg", "Int", width=95), col("shortage_pct", "Shortage %", "Percent", width=90), col("allowed", "Allowed %", "Percent", width=85),
		col("excess_shortage_kg", "Above Allowance kg", "Int", width=125), col("shortage_value", "Shortage Value", "Currency", width=115),
		col("recovery_amount", "Recovered", "Currency", width=105), col("freight_amount", "Freight", "Currency", width=105),
		col("avg_journey", "Avg Journey min", "Int", width=110)]
	chart = {"data": {"labels": [f"{d['depot']} · {d['contractor'] or ''}" for d in data], "datasets": [{"name": "Shortage %", "values": [d["shortage_pct"] for d in data]}]},
		"type": "bar"}
	return columns, data, None, chart
