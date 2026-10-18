"""Daily Production Entry (§5): from the approved DMR, a Work Order for the bags made against the season's bag BOM and a
Stock Entry (Manufacture) that consumes the cane actually crushed (not the BOM standard) and the packing bags, receives the
sugar into the godown and the by-products at their NRV; the sugar carries what is left of the cost. The day's cane purchase
invoice must exist first (the cane has to be in stock)."""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

PROD_ROLES = {"System Manager", "Cane Admin", "Production Manager"}


def fill(doc):
	dmr = frappe.db.get_value("Daily Manufacturing Report", {"crushing_day": getdate(doc.crushing_day), "docstatus": 1},
		["name", "cane_crushed_kg", "sugar_bags", "recovery_pct", "molasses_kg", "bagasse_kg", "press_mud_kg", "season"], as_dict=True)
	if not dmr:
		frappe.throw(_("Approve the Daily Manufacturing Report of {0} first").format(frappe.utils.formatdate(doc.crushing_day)),
			title=_("DMR not approved"))
	doc.dmr, doc.season = dmr.name, dmr.season
	doc.company = doc.company or frappe.db.get_single_value("Sugar Settings", "company")
	doc.update({"cane_crushed_kg": dmr.cane_crushed_kg, "bags_produced": dmr.sugar_bags, "recovery_pct": dmr.recovery_pct,
		"molasses_kg": dmr.molasses_kg, "bagasse_kg": dmr.bagasse_kg, "press_mud_kg": dmr.press_mud_kg})
	doc.daily_purchase = frappe.db.get_value("Daily Cane Purchase", {"crushing_day": getdate(doc.crushing_day), "docstatus": 1}, "name")


def check(doc):
	"""Before submit (nothing written yet): the role, the closed cane day and the stock the entry will consume."""
	from sugarcane.stock import stock_qty

	if not PROD_ROLES & set(frappe.get_roles()):
		frappe.throw(_("Only the Production Manager posts production"), frappe.PermissionError)
	if not doc.daily_purchase:
		frappe.throw(_("Close crushing day {0} first: the cane is put into stock by its daily purchase invoice").format(
			frappe.utils.formatdate(doc.crushing_day)), title=_("Day not closed"))
	if cint(doc.bags_produced) <= 0 or cint(doc.cane_crushed_kg) <= 0:
		frappe.throw(_("No bags or no cane on the DMR"))
	s = frappe.get_cached_doc("Sugar Settings")
	day = getdate(doc.crushing_day)
	for item, wh, need, label in ((s.cane_item, s.cane_yard_warehouse, cint(doc.cane_crushed_kg), _("cane in the yard")),
			(s.packing_item, s.packing_warehouse, cint(doc.bags_produced), _("packing bags"))):
		have = stock_qty(item, wh, day)
		if have + 0.001 < need:
			frappe.throw(_("Not enough {0}: {1} on the books, {2} needed").format(label, f"{have:,.0f}", f"{need:,}"), title=_("Stock"))


def post(doc):
	"""Work Order + Stock Entry (Manufacture). Called on submit, after check()."""
	from erpnext.manufacturing.doctype.work_order.work_order import make_stock_entry

	from sugarcane.setup.production import ensure_bom

	s = frappe.get_cached_doc("Sugar Settings")
	day = getdate(doc.crushing_day)
	doc.bom = ensure_bom(doc.season)
	wo = frappe.get_doc({"doctype": "Work Order", "production_item": s.sugar_item, "bom_no": doc.bom, "qty": cint(doc.bags_produced),
		"company": doc.company, "fg_warehouse": s.sugar_warehouse, "source_warehouse": s.cane_yard_warehouse, "skip_transfer": 1,
		"wip_warehouse": s.cane_yard_warehouse, "scrap_warehouse": s.byproduct_warehouse, "planned_start_date": f"{day} 07:00:00",
		"use_multi_level_bom": 0, "description": _("Crushing day {0}").format(frappe.utils.formatdate(day))})
	wo.flags.ignore_permissions = True
	wo.insert()
	for it in wo.required_items:  # the BOM's source warehouses (yard for cane, packing store for bags)
		it.source_warehouse = s.cane_yard_warehouse if it.item_code == s.cane_item else s.packing_warehouse
	wo.save()
	wo.submit()
	se = frappe.get_doc(make_stock_entry(wo.name, "Manufacture", cint(doc.bags_produced)))
	se.posting_date, se.posting_time, se.set_posting_time = day, "23:59:00", 1
	nrv = frappe.db.get_value("Crushing Season", doc.season, ["molasses_nrv_per_kg", "bagasse_nrv_per_kg", "press_mud_nrv_per_kg"], as_dict=True)
	actual = {s.molasses_item: (cint(doc.molasses_kg), flt(nrv.molasses_nrv_per_kg)), s.bagasse_item: (cint(doc.bagasse_kg), flt(nrv.bagasse_nrv_per_kg)),
		s.press_mud_item: (cint(doc.press_mud_kg), flt(nrv.press_mud_nrv_per_kg))}
	rows, seen = [], set()
	for it in se.items:
		if it.item_code == s.cane_item and it.s_warehouse:
			it.qty = it.transfer_qty = cint(doc.cane_crushed_kg)  # the cane actually crushed, not the BOM standard
			it.s_warehouse = s.cane_yard_warehouse
		elif it.item_code == s.packing_item and it.s_warehouse:
			it.s_warehouse = s.packing_warehouse
		elif it.item_code in actual:  # by-products: the DMR actuals at their NRV
			qty, rate = actual[it.item_code]
			seen.add(it.item_code)
			if not qty:
				continue
			it.qty = it.transfer_qty = qty
			it.t_warehouse, it.basic_rate, it.set_basic_rate_manually = s.byproduct_warehouse, rate, 1
			it.valuation_type = "Manual"
		rows.append(it)
	se.items = rows
	for code, (qty, rate) in actual.items():
		if qty and code not in seen:
			se.append("items", {"item_code": code, "qty": qty, "transfer_qty": qty, "uom": "Kg", "stock_uom": "Kg", "conversion_factor": 1,
				"t_warehouse": s.byproduct_warehouse, "secondary_item_type": "By-Product", "valuation_type": "Manual", "basic_rate": rate,
				"set_basic_rate_manually": 1})
	se.flags.ignore_permissions = True
	se.insert()
	se.submit()
	se.reload()
	fg = next((i for i in se.items if i.item_code == s.sugar_item and i.t_warehouse), None)
	cane = next((i for i in se.items if i.item_code == s.cane_item), None)
	byv = sum(flt(i.amount) for i in se.items if i.item_code in actual)
	doc.db_set({"work_order": wo.name, "stock_entry": se.name, "bom": doc.bom, "status": "Posted", "cane_cost": flt(cane.amount) if cane else 0,
		"by_product_value": byv, "sugar_value": flt(fg.amount) if fg else 0,
		"cost_per_bag": flt(fg.amount) / cint(doc.bags_produced) if fg else 0})


def unpost(doc):
	for dt, name in (("Stock Entry", doc.stock_entry), ("Work Order", doc.work_order)):
		if name and frappe.db.get_value(dt, name, "docstatus") == 1:
			v = frappe.get_doc(dt, name)
			v.flags.ignore_permissions = True
			v.flags.ignore_links = True
			v.cancel()
	doc.db_set("status", "Cancelled")
