# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, cint, flt, getdate

from sugarcane.cane_procurement.report_utils import col


def period(f):
	"""The filters' dates, else the season's (the latest season with production when none is given)."""
	season = f.get("season") or frappe.db.get_value("Daily Production Entry", {"docstatus": 1}, "season", order_by="crushing_day desc") or \
		frappe.db.get_single_value("Sugar Settings", "active_season")
	s = frappe.db.get_value("Crushing Season", season, ["start_date", "end_date"], as_dict=True) or frappe._dict()
	return season, getdate(f.get("from_date") or s.start_date), getdate(f.get("to_date") or s.end_date)


def execute(filters=None):
	"""Molasses, bagasse and press mud (t): opening, produced, burnt in the boilers, sold, other movements, closing."""
	f = frappe._dict(filters or {})
	_season, start, end = period(f)
	s = frappe.get_cached_doc("Sugar Settings")
	out = []
	for item in (s.molasses_item, s.bagasse_item, s.press_mud_item):
		if not item:
			continue
		opening = flt(frappe.db.sql("""select sum(actual_qty) from `tabStock Ledger Entry` where is_cancelled = 0 and item_code = %s
			and posting_date < %s""", (item, start))[0][0])
		mv = frappe.db.sql("""select sle.voucher_type, se.purpose, sum(sle.actual_qty) qty, sum(sle.stock_value_difference) value
			from `tabStock Ledger Entry` sle left join `tabStock Entry` se on sle.voucher_type = 'Stock Entry' and se.name = sle.voucher_no
			where sle.is_cancelled = 0 and sle.item_code = %s and sle.posting_date between %s and %s group by sle.voucher_type, se.purpose""",
			(item, start, end), as_dict=True)
		produced = sum(flt(m.qty) for m in mv if m.purpose == "Manufacture")
		burnt = -sum(flt(m.qty) for m in mv if m.purpose == "Material Issue")
		sold = -sum(flt(m.qty) for m in mv if m.voucher_type == "Delivery Note")
		total = sum(flt(m.qty) for m in mv)
		other = total - produced + burnt + sold
		value_in = sum(flt(m.value) for m in mv if m.purpose == "Manufacture")
		out.append({"item": item, "opening": round(opening / 1000, 3), "produced": round(produced / 1000, 3), "burnt": round(burnt / 1000, 3),
			"sold": round(sold / 1000, 3), "other": round(other / 1000, 3), "closing": round((opening + total) / 1000, 3),
			"nrv_credited": round(value_in, 2), "nrv_per_ton": round(value_in / produced * 1000, 2) if produced else 0})
	cols = [col("item", "By-product", "Link", "Item", 130), col("opening", "Opening (t)", "Float", width=100), col("produced", "Produced (t)", "Float", width=105),
		col("burnt", "Burnt in Boilers (t)", "Float", width=130), col("sold", "Sold (t)", "Float", width=90), col("other", "Other (t)", "Float", width=85),
		col("closing", "Closing (t)", "Float", width=100), col("nrv_credited", "NRV Credited", "Currency", width=130),
		col("nrv_per_ton", "NRV per Ton", "Currency", width=110)]
	return cols, out
