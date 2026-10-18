# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, add_months, cint, date_diff, flt, getdate, nowdate

from sugarcane.cane_procurement.report_utils import col


def _range(f, back=90):
	end = getdate(f.to_date or nowdate())
	return getdate(f.from_date or add_days(end, -back)), end


def execute(filters=None):
	"""Every Delivery Order lifted: bags, the truck's weighment against the expected weight, the gate pass and the invoice."""
	f = frappe._dict(filters or {})
	start, end = _range(f, 30)
	rows = frappe.db.sql("""select dn.name, dn.posting_date, dn.customer, dn.customer_name, dn.territory, dn.delivery_order_no, dn.dispatch_vehicle_no vehicle_no,
		dn.total_qty, dn.grand_total, dn.status, dn.per_billed, dn.sales_weighment, dn.gate_pass, w.net_kg, w.expected_kg, w.difference_kg,
		w.difference_pct, w.within_limit from `tabDelivery Note` dn left join `tabSales Weighment` w on w.name = dn.sales_weighment
		where dn.docstatus = 1 and dn.is_return = 0 and dn.posting_date between %(s)s and %(e)s and (%(c)s = '' or dn.customer = %(c)s)
		order by dn.posting_date, dn.name""", {"s": start, "e": end, "c": f.customer or ""}, as_dict=True)
	cols = [col("name", "Delivery Order", "Link", "Delivery Note", 130), col("posting_date", "Date", "Date", width=95),
		col("customer_name", "Customer", width=170), col("territory", "Region", width=110), col("delivery_order_no", "DO No.", width=95),
		col("vehicle_no", "Vehicle", width=95), col("total_qty", "Qty", "Float", width=75), col("grand_total", "Value", "Currency", width=120),
		col("net_kg", "Net kg", "Int", width=85), col("expected_kg", "Expected kg", "Float", width=95), col("difference_kg", "Diff kg", "Float", width=80),
		col("difference_pct", "Diff %", "Percent", width=70), col("sales_weighment", "Weighment", "Link", "Sales Weighment", 120),
		col("gate_pass", "Gate Pass", "Link", "Gate Pass", 120), col("per_billed", "% Billed", "Percent", width=80)]
	return cols, rows
