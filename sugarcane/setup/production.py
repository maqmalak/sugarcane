"""Production set-up (§5): sugar, packing bag and by-product items, the sugar godown / packing store / by-products store, and
the season's BOM for one 50 kg bag — cane at the standard recovery, one packing bag, and the by-products it leaves valued at
their NRV. Idempotent; settings already filled in are kept."""

import frappe
from frappe import _
from frappe.utils import flt

from sugarcane.calc.lab import bag_bom

ITEMS = {  # settings field: (item code, name, stock uom, group hint, stock?)
	"sugar_item": ("SUGAR-50KG", "Sugar (50 kg bag)", "Bag", "Products"),
	"packing_item": ("PACKING-BAG", "PP packing bag (50 kg)", "Nos", "Raw Material"),
	"molasses_item": ("MOLASSES", "Final molasses", "Kg", "Products"),
	"bagasse_item": ("BAGASSE", "Bagasse", "Kg", "Products"),
	"press_mud_item": ("PRESS-MUD", "Press mud (filter cake)", "Kg", "Products"),
}
WAREHOUSES = {"sugar_warehouse": "Sugar Godown", "packing_warehouse": "Packing Store", "byproduct_warehouse": "By-products Store"}


def _uom(name):
	if not frappe.db.exists("UOM", name):
		frappe.get_doc({"doctype": "UOM", "uom_name": name, "must_be_whole_number": 1 if name in ("Bag", "Nos") else 0}).insert(ignore_permissions=True)


def _group(hint):
	return hint if frappe.db.exists("Item Group", hint) else frappe.db.get_value("Item Group", {"is_group": 0}, "name")


def setup(company: str) -> dict:
	from sugarcane.setup.accounts import _warehouse

	abbr = frappe.get_cached_value("Company", company, "abbr")
	values = {}
	for field, (code, name, uom, group) in ITEMS.items():
		_uom(uom)
		if not frappe.db.exists("Item", code):
			frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": name, "item_group": _group(group), "stock_uom": uom,
				"is_stock_item": 1, "include_item_in_manufacturing": 1, "is_purchase_item": int(field == "packing_item"),
				"is_sales_item": int(field != "packing_item"), "valuation_rate": 45 if field == "packing_item" else 0,
				"description": name}).insert(ignore_permissions=True)
		values[field] = code
	for field, label in WAREHOUSES.items():
		values[field] = _warehouse(company, abbr, label)
	s = frappe.get_single("Sugar Settings")
	changed = False
	for k, v in values.items():
		if not s.get(k):
			s.set(k, v)
			changed = True
	if changed:
		s.flags.ignore_permissions = True
		s.save()
	return values


def ensure_bom(season: str, item: str | None = None) -> str:
	"""The season's bag BOM for a sugar item (grade); a new one (made default) when the standard recovery, expected
	by-products or NRV rates change. The main item's BOM is kept on the season (bag_bom)."""
	s = frappe.get_cached_doc("Sugar Settings")
	sea = frappe.get_doc("Crushing Season", season)
	item = item or s.sugar_item
	main = item == s.sugar_item
	if not sea.standard_recovery_pct:
		frappe.throw(_("Set the standard recovery % on season {0}").format(season))
	q = bag_bom(sea.standard_recovery_pct, sea.bag_weight_kg or 50, sea.expected_molasses_pct or 0, sea.expected_bagasse_pct or 0,
		sea.expected_mud_pct or 0)
	scrap = [(s.molasses_item, q["molasses_kg"], flt(sea.molasses_nrv_per_kg)), (s.bagasse_item, q["bagasse_kg"], flt(sea.bagasse_nrv_per_kg)),
		(s.press_mud_item, q["press_mud_kg"], flt(sea.press_mud_nrv_per_kg))]
	scrap = [x for x in scrap if x[1]]
	cane_rate = flt((flt(sea.govt_rate) + flt(sea.subsidy_rate) + flt(sea.additional_subsidy_rate)) / (flt(s.maund_kg) or 40), 6)
	price_list = _standard_prices(cane_rate)
	current = sea.bag_bom if main else frappe.db.get_value("BOM", {"item": item, "is_default": 1, "is_active": 1, "docstatus": 1}, "name")
	if current and frappe.db.get_value("BOM", current, "docstatus") == 1:
		bom = frappe.get_doc("BOM", current)
		cane = next((i.qty for i in bom.items if i.item_code == s.cane_item), None)
		have = sorted((x.item_code, round(flt(x.stock_qty), 3), round(flt(x.cost), 2)) for x in bom.secondary_items)
		want = sorted((c, round(qq, 3), round(qq * r, 2)) for c, qq, r in scrap)
		if cane is not None and abs(flt(cane) - q["cane_kg"]) < 0.001 and have == want:
			return bom.name
	bom = frappe.get_doc({
		"doctype": "BOM", "item": item, "quantity": 1, "company": sea.company or s.company, "is_active": 1, "is_default": 1,
		"rm_cost_as_per": "Price List", "buying_price_list": price_list, "with_operations": 0,
		"items": [
			{"item_code": s.cane_item, "qty": q["cane_kg"], "uom": "Kg", "stock_uom": "Kg", "conversion_factor": 1, "source_warehouse": s.cane_yard_warehouse},
			{"item_code": s.packing_item, "qty": 1, "uom": "Nos", "stock_uom": "Nos", "conversion_factor": 1, "source_warehouse": s.packing_warehouse},
		],
		# by-products at their NRV (Manual), so the sugar carries what is left of the cost
		"secondary_items": [{"secondary_item_type": "By-Product", "item_code": c, "stock_qty": qq, "qty": qq, "uom": "Kg", "stock_uom": "Kg",
			"conversion_factor": 1, "valuation_type": "Manual", "cost": flt(qq * r, 2)} for c, qq, r in scrap],
	})
	bom.flags.ignore_permissions = True
	bom.insert()
	bom.submit()
	if main:
		frappe.db.set_value("Crushing Season", season, "bag_bom", bom.name, update_modified=False)
	return bom.name


PRICE_LIST = "Cane Standard Cost"


def _standard_prices(cane_rate) -> str:
	"""Standard cost for the BOM (the real cost comes from stock at production): cane at govt rate + subsidies per kg."""
	s = frappe.get_cached_doc("Sugar Settings")
	if not frappe.db.exists("Price List", PRICE_LIST):
		frappe.get_doc({"doctype": "Price List", "price_list_name": PRICE_LIST, "buying": 1, "selling": 0, "enabled": 1,
			"currency": frappe.get_cached_value("Company", s.company, "default_currency")}).insert(ignore_permissions=True)
	for item, uom, rate in ((s.cane_item, "Kg", cane_rate), (s.packing_item, "Nos", 45)):
		name = frappe.db.get_value("Item Price", {"price_list": PRICE_LIST, "item_code": item}, "name")
		if name:
			frappe.db.set_value("Item Price", name, "price_list_rate", rate)
		else:
			frappe.get_doc({"doctype": "Item Price", "price_list": PRICE_LIST, "item_code": item, "uom": uom, "price_list_rate": rate}).insert(
				ignore_permissions=True)
	return PRICE_LIST


def season_updated(doc, method=None):
	"""Crushing Season on_update: keep its BOM in step (only once the production items exist)."""
	if doc.bag_bom or frappe.db.get_single_value("Sugar Settings", "sugar_item"):
		if frappe.db.get_single_value("Sugar Settings", "sugar_item") and doc.standard_recovery_pct:
			ensure_bom(doc.name)
