"""Shared code for the depot reports."""

import frappe

from sugarcane.cane_procurement.report_utils import dates


def dispatches(filters, fields):
	"""Dispatches loaded between the dates (default: the last 7 crushing days with CPRs), optionally for one depot / status."""
	f = frappe._dict(filters or {})
	start, end = dates(f)
	q = {"docstatus": ["<", 2], "dispatch_day": ["between", [start, end]]}
	for k in ("depot", "status", "contractor"):
		if f.get(k):
			q[k] = f[k]
	return frappe.get_list("Depot Dispatch", filters=q, fields=fields, order_by="depot_gross_at asc", limit_page_length=0)
