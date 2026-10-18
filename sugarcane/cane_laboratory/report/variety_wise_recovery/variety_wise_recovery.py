# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe

from sugarcane.cane_procurement.report_utils import col
from sugarcane.depot_purchase.report_utils import dates

KEYS = {"Variety": "variety", "Circle": "circle", "Grower": "grower_name", "Source": "source"}


def execute(filters=None):
	"""Vehicle (core) samples grouped by variety / circle / grower / source: juice purity, fibre, CCS and estimated recovery,
	weighted by the load's maund."""
	f = frappe._dict(filters or {})
	key = KEYS.get(f.group_by or "Variety", "variety")
	last = frappe.db.sql("select max(crushing_day) from `tabVehicle Recovery Sample` where docstatus = 1")[0][0]
	start, end = dates({**f, "to_date": f.to_date or last}) if last else dates(f)
	data = frappe.db.sql(f"""select ifnull({key}, '—') name, count(*) samples, sum(payable_maund) maund,
		sum(brix * payable_maund) / sum(payable_maund) brix, sum(pol * payable_maund) / sum(payable_maund) pol,
		sum(purity * payable_maund) / sum(payable_maund) purity, sum(fibre_pct * payable_maund) / sum(payable_maund) fibre,
		sum(ccs_pct * payable_maund) / sum(payable_maund) ccs, sum(est_recovery_pct * payable_maund) / sum(payable_maund) recovery,
		min(est_recovery_pct) lowest, max(est_recovery_pct) highest
		from `tabVehicle Recovery Sample` where docstatus = 1 and crushing_day between %s and %s group by {key} order by recovery desc""",
		(start, end), as_dict=True)
	for r in data:
		for k in ("brix", "pol", "purity", "fibre", "ccs", "recovery"):
			r[k] = round(r[k] or 0, 2)
	columns = [col("name", f.group_by or "Variety", width=170), col("samples", "Samples", "Int", width=75), col("maund", "Maund Sampled", "Float", width=105),
		col("brix", "Juice Brix", "Float", width=85), col("pol", "Juice Pol", "Float", width=80), col("purity", "Purity", "Float", width=75),
		col("fibre", "Fibre %", "Float", width=75), col("ccs", "CCS %", "Float", width=75), col("recovery", "Est. Recovery %", "Float", width=115),
		col("lowest", "Lowest", "Float", width=75), col("highest", "Highest", "Float", width=75)]
	chart = {"data": {"labels": [r.name for r in data], "datasets": [{"name": "Est. recovery %", "values": [r.recovery for r in data]}]}, "type": "bar"}
	return columns, data, None, chart
