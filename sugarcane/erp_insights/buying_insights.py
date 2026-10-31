"""At-a-glance tiles for the buying documents' React pages (Purchase Order, Purchase Receipt, Purchase Invoice, Material
Request, Request for Quotation, Supplier Quotation) — same shape as selling_insights: tiles, progress bars, lists."""

import frappe
from frappe import _
from frappe.utils import date_diff, flt, getdate, nowdate

from sugarcane.erp_insights.selling_insights import _bar, _row, _tile


@frappe.whitelist()
def get_buying_insights(doctype, name):
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	fn = {"Purchase Order": _po, "Purchase Receipt": _pr, "Purchase Invoice": _pi, "Material Request": _mr,
		"Request for Quotation": _rfq, "Supplier Quotation": _sq}.get(doctype)
	if not fn:
		frappe.throw(_("No insights for {0}").format(doctype))
	return fn(doc)


def _supplier_payable(supplier, company):
	return flt(frappe.db.sql("""select sum(outstanding_amount) from `tabPurchase Invoice` where supplier = %s and company = %s
		and docstatus = 1""", (supplier, company))[0][0])


def _lines(doc, done_field, title):
	items = sorted(doc.items, key=lambda i: -flt(i.get("base_net_amount") or i.get("amount")))[:8]
	return {"title": title, "rows": [
		_row(i.item_name or i.item_code, flt(i.get(done_field)) / flt(i.qty) * 100 if flt(i.qty) else 0, "percent",
			f"{frappe.format(flt(i.get(done_field)), 'Float')} / {frappe.format(flt(i.qty), 'Float')} {i.uom or ''}") for i in items]}


def _po(doc):
	today = getdate(nowdate())
	left = date_diff(doc.schedule_date, today) if doc.get("schedule_date") else None
	pending = flt(doc.per_received) < 100 and doc.docstatus == 1 and doc.status not in ("Closed", "Completed")
	due = (_("{0} days late").format(-left) if left is not None and left < 0 else _("in {0} days").format(left)) if left is not None else "—"
	return {
		"tiles": [
			_tile(_("Order value"), doc.base_grand_total, "money", _("{0} lines · {1} qty").format(len(doc.items), frappe.format(flt(doc.total_qty), "Float")), "sky"),
			_tile(_("Taxes"), doc.base_total_taxes_and_charges, "money", doc.get("taxes_and_charges") or _("no tax template"), "violet"),
			_tile(_("Goods due"), due if pending else _("Received") if flt(doc.per_received) >= 100 else "—", "text", str(doc.get("schedule_date") or ""),
				"rose" if pending and left is not None and left < 0 else "amber" if pending and left is not None and left <= 7 else "emerald"),
			_tile(_("Owed to supplier"), _supplier_payable(doc.supplier, doc.company), "money", _("all unpaid bills"), "rose"),
		],
		"bars": [_bar(_("Received"), doc.per_received, None, "sky"), _bar(_("Billed"), doc.per_billed, None, "emerald")],
		"lists": [_lines(doc, "received_qty", _("Line progress (received / ordered)"))],
	}


def _pr(doc):
	rejected = sum(flt(i.rejected_qty) for i in doc.items)
	pos = sorted({i.purchase_order for i in doc.items if i.get("purchase_order")})
	lead = None
	if pos:
		d = frappe.db.sql("select min(transaction_date) from `tabPurchase Order` where name in %(s)s", {"s": pos})[0][0]
		lead = date_diff(doc.posting_date, d) if d else None
	return {
		"tiles": [
			_tile(_("Received value"), doc.base_grand_total, "money", _("{0} qty accepted").format(frappe.format(flt(doc.total_qty), "Float")), "sky"),
			_tile(_("Rejected"), rejected, "number", _("qty sent back") if rejected else _("nothing rejected"), "rose" if rejected else "emerald"),
			_tile(_("Order to receipt"), lead, "days", _("from {0}").format(", ".join(pos[:2])) if pos else _("not against an order"), "amber" if lead and lead > 14 else "emerald"),
			_tile(_("Billed"), doc.per_billed, "percent", _("of this receipt"), "violet"),
		],
		"bars": [_bar(_("Billed"), doc.per_billed, None, "emerald")],
		"lists": [{"title": _("Received into"), "rows": [
			_row(w, sum(flt(i.stock_qty) for i in doc.items if i.warehouse == w), "number", _("{0} lines").format(sum(1 for i in doc.items if i.warehouse == w)))
			for w in sorted({i.warehouse for i in doc.items if i.warehouse})]}],
	}


def _pi(doc):
	today = getdate(nowdate())
	pays = frappe.db.sql("""select p.name, p.posting_date, r.allocated_amount, p.mode_of_payment from `tabPayment Entry Reference` r
		join `tabPayment Entry` p on p.name = r.parent where r.reference_doctype = 'Purchase Invoice' and r.reference_name = %s and p.docstatus = 1
		order by p.posting_date""", doc.name, as_dict=True)
	paid = flt(doc.grand_total) - flt(doc.outstanding_amount)
	left = date_diff(doc.due_date, today) if doc.get("due_date") else None
	due = (_("Paid") if flt(doc.outstanding_amount) <= 0.01 else _("{0} days overdue").format(-left) if left is not None and left < 0
		else _("due in {0} days").format(left) if left is not None else "—")
	wht = flt(doc.get("base_tax_withholding_net_total") and doc.get("taxes_and_charges_deducted"))
	return {
		"tiles": [
			_tile(_("Bill total"), doc.grand_total, "money", _("net {0} · tax {1}").format(frappe.format(flt(doc.net_total), "Currency"),
				frappe.format(flt(doc.total_taxes_and_charges), "Currency")), "sky"),
			_tile(_("Outstanding"), doc.outstanding_amount, "money", due, "emerald" if flt(doc.outstanding_amount) <= 0.01 else "rose" if left is not None and left < 0 else "amber"),
			_tile(_("Withholding"), wht, "money", _("deducted at source") if wht else _("none"), "violet"),
			_tile(_("Owed to supplier"), _supplier_payable(doc.supplier, doc.company), "money", _("all unpaid bills"), "rose"),
		],
		"bars": [_bar(_("Paid"), paid / flt(doc.grand_total) * 100 if flt(doc.grand_total) else 0, frappe.format(paid, "Currency"), "emerald")],
		"lists": [{"title": _("Payments made"), "rows": [_row(p.name, p.allocated_amount, "money", f"{p.posting_date} · {p.mode_of_payment or ''}",
			{"doctype": "Payment Entry", "name": p.name}) for p in pays]}],
	}


def _mr(doc):
	today = getdate(nowdate())
	left = date_diff(doc.schedule_date, today) if doc.get("schedule_date") else None
	return {
		"tiles": [
			_tile(_("Lines"), len(doc.items), "number", _("{0} qty").format(frappe.format(sum(flt(i.qty) for i in doc.items), "Float")), "sky"),
			_tile(_("Type"), doc.material_request_type, "text", doc.get("set_warehouse") or "", "violet"),
			_tile(_("Required by"), _("{0} days late").format(-left) if left is not None and left < 0 else _("in {0} days").format(left) if left is not None else "—",
				"text", str(doc.get("schedule_date") or ""), "rose" if left is not None and left < 0 else "emerald"),
			_tile(_("Ordered"), doc.per_ordered, "percent", doc.status, "amber" if flt(doc.per_ordered) < 100 else "emerald"),
		],
		"bars": [_bar(_("Ordered"), doc.per_ordered, None, "sky"), *([_bar(_("Received"), doc.per_received, None, "emerald")] if doc.get("per_received") is not None else [])],
		"lists": [_lines(doc, "ordered_qty", _("Line progress (ordered / requested)"))],
	}


def _rfq(doc):
	quotes = frappe.get_all("Supplier Quotation Item", filters={"request_for_quotation": doc.name, "docstatus": 1},
		fields=["parent"], distinct=True, pluck="parent")
	return {
		"tiles": [
			_tile(_("Suppliers asked"), len(doc.suppliers), "number", ", ".join(s.supplier for s in doc.suppliers[:3]), "sky"),
			_tile(_("Quotations back"), len(set(quotes)), "number", _("submitted"), "emerald" if quotes else "amber"),
			_tile(_("Lines"), len(doc.items), "number", _("{0} qty").format(frappe.format(sum(flt(i.qty) for i in doc.items), "Float")), "violet"),
		],
		"bars": [_bar(_("Replied"), len(set(quotes)) / len(doc.suppliers) * 100 if doc.suppliers else 0, None, "emerald")],
		"lists": [{"title": _("Suppliers"), "rows": [_row(s.supplier, 0, "text", s.get("quote_status") or "") for s in doc.suppliers]}],
	}


def _sq(doc):
	return {
		"tiles": [
			_tile(_("Quoted value"), doc.base_grand_total, "money", _("{0} lines").format(len(doc.items)), "sky"),
			_tile(_("Valid till"), str(doc.get("valid_till") or "—"), "text", doc.status, "violet"),
		],
		"bars": [],
		"lists": [],
	}
