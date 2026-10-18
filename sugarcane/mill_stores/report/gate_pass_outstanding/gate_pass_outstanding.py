# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, add_months, cint, date_diff, flt, getdate, nowdate

from sugarcane.cane_procurement.report_utils import col


def _range(f, back=90):
	end = getdate(f.to_date or nowdate())
	return getdate(f.from_date or add_days(end, -back)), end


def execute(filters=None):
	"""Returnable items still outside the mill, oldest first, with the days overdue."""
	f = frappe._dict(filters or {})
	start, end = _range(f, 365)
	rows = frappe.db.sql("""select g.name, g.posting_date, g.party_name, g.vehicle_no, g.expected_return_date, g.status, i.item_code, i.description,
		i.qty, i.returned_qty, i.qty - i.returned_qty pending from `tabGate Pass` g join `tabGate Pass Item` i on i.parent = g.name
		where g.docstatus = 1 and g.pass_type = 'Outward - Returnable' and g.status in ('Out', 'Partly Returned') and i.qty > i.returned_qty
		and g.posting_date between %s and %s order by g.expected_return_date""", (start, end), as_dict=True)
	today = getdate(nowdate())
	for r in rows:
		r.overdue_days = max(0, date_diff(today, r.expected_return_date)) if r.expected_return_date else 0
	cols = [col("name", "Gate Pass", "Link", "Gate Pass", 130), col("posting_date", "Out On", "Date", width=95), col("party_name", "Party", width=170),
		col("vehicle_no", "Vehicle", width=95), col("item_code", "Item", "Link", "Item", 110), col("description", "Description", width=170),
		col("qty", "Out", "Float", width=65), col("returned_qty", "Back", "Float", width=65), col("pending", "Pending", "Float", width=75),
		col("expected_return_date", "Due Back", "Date", width=95), col("overdue_days", "Days Overdue", "Int", width=95), col("status", "Status", width=110)]
	return cols, rows
