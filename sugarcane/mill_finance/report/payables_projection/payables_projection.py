# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, add_months, cint, date_diff, flt, getdate, nowdate

from sugarcane.cane_procurement.report_utils import col


def _range(f, back=90):
	end = getdate(f.to_date or nowdate())
	return getdate(f.from_date or add_days(end, -back)), end


def execute(filters=None):
	"""What the mill will have to pay, by week for the next 8 weeks: unpaid purchase invoices by due date, plus purchase orders
	received but not yet invoiced (due by the supplier's usual credit days, 30 if none). Overdue bills fall in "Overdue"."""
	today = getdate(nowdate())
	buckets = ["Overdue"] + [f"Week {i}" for i in range(1, 9)] + ["Later"]
	g = {}

	def put(supplier, name, due, amount, kind):
		d = date_diff(due, today) if due else 0
		b = "Overdue" if d < 0 else (f"Week {d // 7 + 1}" if d < 56 else "Later")
		r = g.setdefault(supplier, {"supplier": supplier, **{frappe.scrub(x): 0.0 for x in buckets}, "invoiced": 0.0, "to_invoice": 0.0})
		r[frappe.scrub(b)] += amount
		r["invoiced" if kind == "PI" else "to_invoice"] += amount

	for pi in frappe.db.sql("""select supplier, name, due_date, outstanding_amount from `tabPurchase Invoice` where docstatus = 1
			and outstanding_amount > 0""", as_dict=True):
		put(pi.supplier, pi.name, pi.due_date, flt(pi.outstanding_amount), "PI")
	for po in frappe.db.sql("""select supplier, name, schedule_date, grand_total * (per_received - per_billed) / 100 amt from `tabPurchase Order`
			where docstatus = 1 and status not in ('Closed', 'Completed') and per_received > per_billed""", as_dict=True):
		put(po.supplier, po.name, add_days(po.schedule_date or today, 30), flt(po.amt), "PO")
	rows = sorted(g.values(), key=lambda r: -(r["invoiced"] + r["to_invoice"]))
	for r in rows:
		r["total"] = round(r["invoiced"] + r["to_invoice"], 2)
	cols = [col("supplier", "Supplier", "Link", "Supplier", 180)] + [col(frappe.scrub(b), b, "Currency", width=105) for b in buckets] + [
		col("invoiced", "Invoiced", "Currency", width=115), col("to_invoice", "Received, Not Invoiced", "Currency", width=140), col("total", "Total", "Currency", width=120)]
	chart = {"data": {"labels": buckets, "datasets": [{"name": "Payable", "values": [round(sum(r[frappe.scrub(b)] for r in rows), 2) for b in buckets]}]}, "type": "bar"}
	return cols, rows, None, chart
