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
	"""Pol lost in bagasse, press mud and molasses, and undetermined, % cane — per day, with recovery and mill extraction."""
	f = frappe._dict(filters or {})
	_season, start, end = period(f)
	rows = frappe.get_all("Daily Manufacturing Report", filters={"docstatus": 1, "crushing_day": ["between", [start, end]]},
		fields=["crushing_day", "pol_pct_cane", "loss_bagasse", "loss_press_mud", "loss_molasses", "loss_known", "loss_undetermined", "recovery_pct",
			"mill_extraction_pct", "mixed_juice_purity"], order_by="crushing_day asc", limit=0)
	for r in rows:
		r.total = round(flt(r.loss_known) + flt(r.loss_undetermined), 3)
	cols = [col("crushing_day", "Day", "Date", width=95), col("pol_pct_cane", "Pol % Cane", "Float", width=95), col("loss_bagasse", "In Bagasse", "Float", width=95),
		col("loss_press_mud", "In Press Mud", "Float", width=100), col("loss_molasses", "In Molasses", "Float", width=100), col("loss_known", "Known", "Float", width=85),
		col("loss_undetermined", "Undetermined", "Float", width=105), col("total", "Total Loss", "Float", width=95), col("recovery_pct", "Recovery %", "Percent", width=95),
		col("mill_extraction_pct", "Mill Extraction %", "Percent", width=120), col("mixed_juice_purity", "MJ Purity %", "Percent", width=100)]
	n = len(rows) or 1
	summary = [{"label": f"Average {k}", "value": round(sum(flt(r.get(fld)) for r in rows) / n, 3), "datatype": "Float"}
		for k, fld in (("pol % cane", "pol_pct_cane"), ("known loss", "loss_known"), ("undetermined loss", "loss_undetermined"))]
	chart = {"data": {"labels": [str(r.crushing_day) for r in rows], "datasets": [{"name": "Bagasse", "values": [flt(r.loss_bagasse) for r in rows]},
		{"name": "Molasses", "values": [flt(r.loss_molasses) for r in rows]}, {"name": "Undetermined", "values": [flt(r.loss_undetermined) for r in rows]}]},
		"type": "bar", "barOptions": {"stacked": 1}}
	return cols, rows, None, chart, summary
