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
	"""What the by-products sold actually realised (sales − selling cost) against the NRV they were credited at."""
	from sugarcane.cane_costing.costing import by_product_variance

	f = frappe._dict(filters or {})
	season, _start, end = period(f)
	company = frappe.db.get_single_value("Sugar Settings", "company")
	rows = by_product_variance(company, season, end)
	out = []
	for r in rows:
		t = r["qty_kg"] / 1000 or 1
		out.append({"item": r["item"], "tons": round(r["qty_kg"] / 1000, 3), "nrv": r["nrv"], "sales": r["sales"], "selling_cost": r["selling_cost"],
			"realised": r["realised"], "variance": r["variance"], "nrv_per_ton": round(r["nrv"] / t, 2), "realised_per_ton": round(r["realised"] / t, 2)})
	cols = [col("item", "By-product", "Link", "Item", 130), col("tons", "Sold (t)", "Float", width=90), col("nrv", "NRV Credited", "Currency", width=125),
		col("sales", "Sales Value", "Currency", width=125), col("selling_cost", "Selling Cost", "Currency", width=115),
		col("realised", "Realised", "Currency", width=125), col("variance", "Variance", "Currency", width=120),
		col("nrv_per_ton", "NRV / t", "Currency", width=100), col("realised_per_ton", "Realised / t", "Currency", width=105)]
	return cols, out
