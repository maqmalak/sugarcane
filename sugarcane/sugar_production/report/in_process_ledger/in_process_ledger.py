# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt, getdate

from sugarcane.cane_procurement.report_utils import col


def execute(filters=None):
	"""The in-process ledger, day by day: cane in the yard (opening, received from the daily purchase, put into process,
	closing — t and Rs), the packing used and the day's actual processing cost (production and service cost centres), and
	what came out (by-products at NRV, sugar at stock cost): the day's full cost per bag."""
	from sugarcane.cane_costing.report.cost_of_production_statement.cost_of_production_statement import period
	from sugarcane.cane_costing.costing import costed_cost_centers

	f = frappe._dict(filters or {})
	_season, start, end = period(f)
	s = frappe.get_cached_doc("Sugar Settings")
	company = s.company
	item, wh = s.cane_item, s.cane_yard_warehouse
	last = frappe.db.sql("""select qty_after_transaction, stock_value from `tabStock Ledger Entry` where is_cancelled = 0 and item_code = %s and warehouse = %s
		and posting_date < %s order by posting_date desc, posting_time desc, creation desc limit 1""", (item, wh, start), as_dict=True)
	qty, value = (flt(last[0].qty_after_transaction), flt(last[0].stock_value)) if last else (0.0, 0.0)
	moves = {}
	for r in frappe.db.sql("""select posting_date d, sum(case when actual_qty > 0 then actual_qty else 0 end) qin,
			sum(case when actual_qty > 0 then stock_value_difference else 0 end) vin, sum(case when actual_qty < 0 then -actual_qty else 0 end) qout,
			sum(case when actual_qty < 0 then -stock_value_difference else 0 end) vout from `tabStock Ledger Entry` where is_cancelled = 0
			and item_code = %s and warehouse = %s and posting_date between %s and %s group by posting_date""", (item, wh, start, end), as_dict=True):
		moves[getdate(r.d)] = r
	prod = {getdate(p.crushing_day): p for p in frappe.get_all("Daily Production Entry", filters={"docstatus": 1, "crushing_day": ["between", [start, end]]},
		fields=["crushing_day", "bags_produced", "packing_cost", "by_product_value", "sugar_value"], limit=0)}
	costed, _off = costed_cost_centers(company)
	proc = {getdate(r.d): flt(r.amt) for r in frappe.db.sql("""select g.posting_date d, sum(g.debit - g.credit) amt from `tabGL Entry` g
		join `tabAccount` a on a.name = g.account where g.is_cancelled = 0 and g.company = %s and g.posting_date between %s and %s
		and a.root_type = 'Expense' and g.cost_center in %s and g.voucher_type not in ('Delivery Note', 'Sales Invoice', 'Stock Reconciliation')
		and a.account_name not like 'Cost of Production Absorbed%%' group by g.posting_date""", (company, start, end, list(costed) or [""]), as_dict=True)}
	rows = []
	for day in sorted(set(moves) | set(prod) | set(proc)):
		m = moves.get(day) or frappe._dict(qin=0, vin=0, qout=0, vout=0)
		p = prod.get(day) or frappe._dict()
		o_q, o_v = qty, value
		qty, value = qty + flt(m.qin) - flt(m.qout), value + flt(m.vin) - flt(m.vout)
		bags = flt(p.bags_produced)
		full = flt(m.vout) + flt(p.packing_cost) + proc.get(day, 0) - flt(p.by_product_value)
		rows.append({"day": day, "open_t": round(o_q / 1000, 3), "open_v": round(o_v, 2), "in_t": round(flt(m.qin) / 1000, 3), "in_v": round(flt(m.vin), 2),
			"process_t": round(flt(m.qout) / 1000, 3), "process_v": round(flt(m.vout), 2), "packing": round(flt(p.packing_cost), 2),
			"processing": round(proc.get(day, 0), 2), "by_products": round(flt(p.by_product_value), 2), "sugar_stock": round(flt(p.sugar_value), 2),
			"bags": bags, "full_cost": round(full, 2), "full_per_bag": round(full / bags, 2) if bags else None,
			"close_t": round(qty / 1000, 3), "close_v": round(value, 2)})
	cols = [col("day", "Day", "Date", width=95), col("open_t", "Opening Cane (t)", "Float", width=115), col("open_v", "Opening Value", "Currency", width=120),
		col("in_t", "Received (t)", "Float", width=100), col("in_v", "Received Value", "Currency", width=125), col("process_t", "Into Process (t)", "Float", width=115),
		col("process_v", "Into Process Value", "Currency", width=135), col("packing", "Packing", "Currency", width=100),
		col("processing", "Processing (actual)", "Currency", width=135), col("by_products", "By-products Out (NRV)", "Currency", width=150),
		col("sugar_stock", "Sugar Out (stock cost)", "Currency", width=150), col("bags", "Bags", "Float", width=75),
		col("full_cost", "Full Cost of the Day", "Currency", width=140), col("full_per_bag", "Full Cost / Bag", "Currency", width=115),
		col("close_t", "Closing Cane (t)", "Float", width=110), col("close_v", "Closing Value", "Currency", width=120)]
	return cols, rows
