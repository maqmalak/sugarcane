# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import re

import frappe
from frappe.utils import add_days, add_months, cint, date_diff, flt, getdate, nowdate

from sugarcane.cane_procurement.report_utils import col


def _range(f, back=90):
	end = getdate(f.to_date or nowdate())
	return getdate(f.from_date or add_days(end, -back)), end


def _k(supplier):
	return re.sub(r"\W+", "_", frappe.scrub(supplier)).strip("_")


def execute(filters=None):
	"""Supplier quotations side by side, one row per item: each supplier's rate and amount, the lowest marked, the spread
	and what the last purchase cost — the comparative statement the purchase committee signs."""
	f = frappe._dict(filters or {})
	start, end = _range(f, 180)
	cond = ["sq.docstatus < 2", "sq.transaction_date between %(s)s and %(e)s"]
	if f.request_for_quotation:
		cond.append("i.request_for_quotation = %(rfq)s")
	if f.item_code:
		cond.append("i.item_code = %(item)s")
	lines = frappe.db.sql(f"""select sq.name sq, sq.supplier, sq.supplier_name, sq.docstatus, i.item_code, i.item_name, i.qty, i.uom, i.rate,
		i.amount, i.request_for_quotation rfq, sq.transaction_date from `tabSupplier Quotation` sq join `tabSupplier Quotation Item` i on i.parent = sq.name
		where {" and ".join(cond)} order by i.item_code, i.rate""", {"s": start, "e": end, "rfq": f.request_for_quotation, "item": f.item_code}, as_dict=True)
	suppliers = sorted({(l.supplier, l.supplier_name) for l in lines}, key=lambda x: x[1] or x[0])
	by_item = {}
	for l in lines:
		r = by_item.setdefault((l.rfq or "", l.item_code), {"rfq": l.rfq, "item_code": l.item_code, "item_name": l.item_name, "qty": l.qty, "uom": l.uom})
		key = _k(l.supplier)
		if f"{key}_rate" not in r or flt(l.rate) < flt(r[f"{key}_rate"]):
			r[f"{key}_rate"], r[f"{key}_amount"] = flt(l.rate), flt(l.amount)
	rows = []
	for r in by_item.values():
		rates = [(r[f"{_k(s)}_rate"], n or s) for s, n in suppliers if f"{_k(s)}_rate" in r]
		if not rates:
			continue
		low, high = min(rates), max(rates)
		r["lowest_rate"], r["lowest_supplier"], r["quotes"] = low[0], low[1], len(rates)
		r["spread_pct"] = round(100 * (high[0] - low[0]) / low[0], 1) if low[0] else 0
		r["lowest_amount"] = round(low[0] * flt(r["qty"]), 2)
		last = frappe.db.sql("""select pi.rate from `tabPurchase Order Item` pi join `tabPurchase Order` po on po.name = pi.parent
			where po.docstatus = 1 and pi.item_code = %s order by po.transaction_date desc limit 1""", r["item_code"])
		r["last_po_rate"] = flt(last[0][0]) if last else None
		rows.append(r)
	cols = [col("rfq", "Inquiry", "Link", "Request for Quotation", 120), col("item_code", "Item", "Link", "Item", 120), col("item_name", "Description", width=170),
		col("qty", "Qty", "Float", width=70), col("uom", "UOM", width=60)]
	for s, n in suppliers:
		cols.append(col(f"{_k(s)}_rate", f"{n or s} rate", "Currency", width=120))
	cols += [col("quotes", "Quotes", "Int", width=65), col("lowest_supplier", "Lowest", width=150), col("lowest_rate", "Lowest Rate", "Currency", width=110),
		col("lowest_amount", "Lowest Amount", "Currency", width=120), col("spread_pct", "Spread %", "Percent", width=80),
		col("last_po_rate", "Last PO Rate", "Currency", width=110)]
	summary = [{"label": "Items compared", "value": len(rows), "datatype": "Int"}, {"label": "Suppliers", "value": len(suppliers), "datatype": "Int"},
		{"label": "Total at lowest", "value": round(sum(r["lowest_amount"] for r in rows), 2), "datatype": "Currency", "indicator": "green"}]
	return cols, rows, None, None, summary
