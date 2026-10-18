# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

from sugarcane.cane_procurement.report_utils import MONEY_SUMS, col, cprs

KEY = "circle"


def execute(filters=None):
	rows = cprs(filters, ["name", "posting_date", "circle", "source", "point_name", "entry_type", "net_kg", "payable_kg", "payable_maund",
		*MONEY_SUMS, "daily_purchase"])
	g = defaultdict(lambda: defaultdict(float))
	for r in rows:
		key = r.circle or "—"
		d = g[key]
		d["loads"] += 1
		d["elp"] += 1 if r.entry_type == "ELP Verified" else 0
		for k in ("net_kg", "payable_kg", "payable_maund", *MONEY_SUMS):
			d[k] += r.get(k) or 0
	data = []
	for key, d in sorted(g.items(), key=lambda kv: -kv[1]["payable_maund"]):
		data.append({KEY: key, **{k: round(v, 3) for k, v in d.items()}, "avg_load": round(d["payable_maund"] / d["loads"], 1),
			"elp_pct": 100 * d["elp"] / d["loads"], "tpt_per_maund": round(d["tpt_amount"] / d["payable_maund"], 2) if d["payable_maund"] else 0})
	columns = [col("circle", "Circle", "Link", "Cane Circle", 140), col("loads", "Loads", "Int", width=70), col("elp_pct", "ELP Verified %", "Percent", width=110),
		col("payable_kg", "Payable kg", "Int", width=100), col("payable_maund", "Maund", "Float", width=95), col("avg_load", "Avg Load md", "Float", width=95),
		col("govt_value", "Govt Value", "Currency", width=120), col("subsidy", "Subsidy", "Currency", width=105),
		col("additional_subsidy", "Add. Subsidy", "Currency", width=105), col("road_cess_total", "Road Cess", "Currency", width=100),
		col("tpt_amount", "TPT", "Currency", width=105), col("tpt_per_maund", "TPT / md", "Currency", width=85),
		col("payable_cpr", "Payable", "Currency", width=125)]
	chart = {"data": {"labels": [str(d[KEY]) for d in data], "datasets": [{"name": "Maund", "values": [d["payable_maund"] for d in data]}]},
		"type": "bar"}
	if data:
		data.append({KEY: "Total", **{k: round(sum(d.get(k) or 0 for d in data), 3) for k in ("loads", "payable_kg", "payable_maund", *MONEY_SUMS)}})
	return columns, data, None, chart
