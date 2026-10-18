# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, getdate, nowdate

from sugarcane.cane_procurement.report_utils import col


def execute(filters=None):
	"""Each depot's cane: bought (net and payable kg), sent, held, on the road, and its warehouse balance on the books."""
	from erpnext.stock.utils import get_stock_balance

	f = frappe._dict(filters or {})
	on = getdate(f.to_date) if f.to_date else None
	at = f"{on} 23:59:59" if on else "2999-12-31"
	item = frappe.db.get_single_value("Sugar Settings", "cane_item")
	transit = frappe.db.get_single_value("Sugar Settings", "transit_warehouse")
	data = []
	for d in frappe.get_all("Cane Depot", filters={"is_active": 1}, fields=["name", "warehouse", "contractor"], order_by="name"):
		bought = frappe.db.sql("""select ifnull(sum(net_kg), 0), ifnull(sum(payable_kg), 0), count(*) from `tabCane Purchase Receipt`
			where docstatus = 1 and purchase_depot = %s and posted_at <= %s""", (d.name, at))[0]
		sent = frappe.db.sql("""select ifnull(sum(dispatched_kg), 0), ifnull(sum(case when status in ('In Transit', 'At Mill') then dispatched_kg else 0 end), 0)
			from `tabDepot Dispatch` where docstatus = 1 and depot = %s and depot_gross_at <= %s""", (d.name, at))[0]
		books = get_stock_balance(item, d.warehouse, on or add_days(nowdate(), 3650), "23:59:59") if d.warehouse else 0
		data.append({"depot": d.name, "contractor": d.contractor, "loads": bought[2], "net_kg": bought[0], "payable_kg": bought[1], "sent_kg": sent[0],
			"held_kg": bought[0] - sent[0], "on_road_kg": sent[1], "books_kg": books, "warehouse": d.warehouse})
	columns = [col("depot", "Depot", "Link", "Cane Depot", 150), col("contractor", "Contractor", "Link", "Supplier", 150), col("loads", "Loads Bought", "Int", width=95),
		col("net_kg", "Bought Net kg", "Int", width=110), col("payable_kg", "Bought Payable kg", "Int", width=125), col("sent_kg", "Sent kg", "Int", width=100),
		col("held_kg", "Held kg (weighed)", "Int", width=120), col("on_road_kg", "On the Road kg", "Int", width=110),
		col("books_kg", "Warehouse kg (closed days)", "Float", width=170), col("warehouse", "Warehouse", "Link", "Warehouse", 170)]
	msg = None
	if transit and item:
		msg = frappe._("Cane In Transit on the books (closed days): {0} kg").format(
			f"{get_stock_balance(item, transit, on or add_days(nowdate(), 3650), '23:59:59'):,.0f}")
	return columns, data, msg
