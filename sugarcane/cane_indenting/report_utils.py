"""Shared code for the indenting reports."""

import frappe
from frappe import _


def col(fieldname, label, fieldtype="Data", options=None, width=120):
	return {"fieldname": fieldname, "label": _(label), "fieldtype": fieldtype, "options": options, "width": width}


def season_of(filters) -> str:
	return (filters or {}).get("season") or frappe.db.get_single_value("Sugar Settings", "active_season")


def indent_filters(filters) -> dict:
	filters = frappe._dict(filters or {})
	f = {"season": season_of(filters)}
	for key in ("circle", "village", "status", "grower"):
		if filters.get(key):
			f[key] = filters[key]
	if filters.from_date and filters.to_date:
		f["indent_date"] = ["between", [filters.from_date, filters.to_date]]
	elif filters.from_date:
		f["indent_date"] = [">=", filters.from_date]
	elif filters.to_date:
		f["indent_date"] = ["<=", filters.to_date]
	return f
