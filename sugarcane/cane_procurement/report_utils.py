"""Shared code for the procurement reports: filters, columns and date defaults (the latest crushing days with CPRs)."""

import frappe
from frappe import _
from frappe.utils import add_days, getdate, nowdate


def col(fieldname, label, fieldtype="Data", options=None, width=120):
	return {"fieldname": fieldname, "label": _(label), "fieldtype": fieldtype, "options": options, "width": width}


def dates(filters, days=7):
	"""From / to crushing day. Without filters: the last `days` days up to the latest day with a CPR (or today)."""
	f = frappe._dict(filters or {})
	last = frappe.db.sql("select max(posting_date) from `tabCane Purchase Receipt` where docstatus = 1")[0][0]
	end = getdate(f.to_date or last or nowdate())
	return getdate(f.from_date or add_days(end, -(days - 1))), end


def cpr_filters(filters):
	f = frappe._dict(filters or {})
	start, end = dates(f)
	q = {"docstatus": 1, "posting_date": ["between", [start, end]]}
	for key in ("circle", "village", "source", "entry_type", "payment_status", "season", "vehicle_type", "grower"):
		if f.get(key):
			q[key] = f[key]
	return q


def cprs(filters, fields):
	return frappe.get_list("Cane Purchase Receipt", filters=cpr_filters(filters), fields=fields, order_by="posted_at asc", limit_page_length=0)


MONEY_SUMS = ("govt_value", "subsidy", "additional_subsidy", "road_cess_total", "road_cess_grower", "tpt_amount", "payable_cpr")
