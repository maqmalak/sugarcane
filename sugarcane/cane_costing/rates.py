# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""By-product NRV: the season's By-product Rate valid on the day (sale rate − selling cost per ton), else the NRV per kg
on the Crushing Season."""
import frappe
from frappe.utils import flt, getdate

SEASON_FIELD = {"molasses_item": "molasses_nrv_per_kg", "bagasse_item": "bagasse_nrv_per_kg", "press_mud_item": "press_mud_nrv_per_kg"}


def rate(item: str, day, season: str | None = None) -> frappe._dict:
	"""{nrv_per_kg, rate_per_ton, selling_cost_per_ton, source}"""
	f = {"item": item, "is_active": 1, "valid_from": ["<=", getdate(day)]}
	if season:
		f["season"] = season
	r = frappe.db.get_value("By-product Rate", f, ["name", "nrv_per_kg", "rate_per_ton", "selling_cost_per_ton"], as_dict=True,
		order_by="valid_from desc")
	if r:
		return frappe._dict(nrv_per_kg=flt(r.nrv_per_kg), rate_per_ton=flt(r.rate_per_ton), selling_cost_per_ton=flt(r.selling_cost_per_ton), source=r.name)
	s = frappe.get_cached_doc("Sugar Settings")
	field = next((v for k, v in SEASON_FIELD.items() if s.get(k) == item), None)
	nrv = flt(frappe.db.get_value("Crushing Season", season, field)) if season and field else 0
	return frappe._dict(nrv_per_kg=nrv, rate_per_ton=nrv * 1000, selling_cost_per_ton=0, source="Crushing Season")
