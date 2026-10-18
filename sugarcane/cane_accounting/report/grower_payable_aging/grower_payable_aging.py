# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe.utils import date_diff, flt

from sugarcane.api.v1.accounts import BUCKETS, as_on_default, bucket
from sugarcane.cane_procurement.report_utils import col


def execute(filters=None):
	"""Unpaid CPRs per grower by age (days since the crushing day). The total equals the Grower Payable ledger."""
	f = frappe._dict(filters or {})
	d = as_on_default(f.as_on)
	cond, vals = ["c.docstatus = 1", "c.payment_status = 'Unpaid'", "c.posting_date <= %(d)s"], {"d": d}
	for k in ("circle", "source"):
		if f.get(k):
			cond.append(f"c.{k} = %({k})s")
			vals[k] = f[k]
	rows = frappe.db.sql(f"""select c.grower, c.grower_name, c.circle, c.village_name, c.posting_date, c.payable_cpr, g.iban from `tabCane Purchase Receipt` c
		left join tabGrower g on g.name = c.grower where {' and '.join(cond)}""", vals, as_dict=True)
	by = defaultdict(lambda: defaultdict(float))
	info = {}
	for r in rows:
		b = by[r.grower]
		b[bucket(date_diff(d, r.posting_date))] += flt(r.payable_cpr)
		b["total"] += flt(r.payable_cpr)
		b["cprs"] += 1
		b["oldest"] = max(b["oldest"], date_diff(d, r.posting_date))
		info[r.grower] = r
	data = [{"grower": g, "grower_name": info[g].grower_name, "circle": info[g].circle, "village": info[g].village_name, "iban": "yes" if info[g].iban else "no",
		**{k: round(v, 2) for k, v in b.items()}} for g, b in sorted(by.items(), key=lambda kv: -kv[1]["total"])]
	columns = [col("grower", "Grower ID", "Link", "Grower", 110), col("grower_name", "Grower", width=160), col("circle", "Circle", "Link", "Cane Circle", 110),
		col("village", "Village", width=110), col("iban", "IBAN", width=55), col("cprs", "CPRs", "Int", width=60)]
	columns += [col(label, label + " days", "Currency", width=105) for *_x, label in BUCKETS]
	columns += [col("total", "Total", "Currency", width=120), col("oldest", "Oldest (days)", "Int", width=95)]
	if data:
		data.append({"grower": "Total", **{k: round(sum(flt(r.get(k)) for r in data), 2) for k in [b[2] for b in BUCKETS] + ["total", "cprs"]}})
	chart = {"data": {"labels": [b[2] for b in BUCKETS], "datasets": [{"name": "Unpaid", "values": [data[-1].get(b[2], 0) if data else 0 for b in BUCKETS]}]},
		"type": "bar"}
	return columns, data, None, chart
