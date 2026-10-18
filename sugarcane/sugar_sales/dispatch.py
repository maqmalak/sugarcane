# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Sugar dispatch: the buyer's truck is weighed empty, loaded against the Delivery Order (Delivery Note), weighed loaded;
the net weight is checked against bags × bag weight (+ packing). Within the tolerance the Delivery Note is submitted
(stock leaves the godown) and the sales-dispatch gate pass is made."""
import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime

from sugarcane.cane_procurement import procurement as p

OVERRIDE = {"System Manager", "Cane Admin", "Sales Manager"}


def _settings():
	s = frappe.get_cached_doc("Sugar Settings")
	season = frappe.db.get_value("Crushing Season", s.active_season, "bag_weight_kg") if s.active_season else None
	return frappe._dict(bag_kg=flt(season) or 50, packing_kg=flt(s.get("bag_packing_kg")) or 0.1,
		tolerance=flt(s.get("sales_weight_tolerance_pct")) or 0.5)


def expected(dn) -> tuple[float, float]:
	"""(bags, expected kg) for a Delivery Note: bag items at the season's bag weight plus packing, kg items as they are."""
	cfg = _settings()
	bags, kg = 0.0, 0.0
	for i in dn.items:
		uom = (i.uom or i.stock_uom or "").lower()
		if uom == "bag":
			bags += flt(i.qty)
			kg += flt(i.qty) * (cfg.bag_kg + cfg.packing_kg)
		elif uom in ("kg", "kgs"):
			kg += flt(i.stock_qty or i.qty)
		elif uom in ("ton", "tonne"):
			kg += flt(i.qty) * 1000
	return bags, round(kg, 2)


@frappe.whitelist(methods=["POST"])
def weigh_empty(delivery_note: str, vehicle_no: str, terminal: str, driver_name=None, manual_kg=None, note=None, at=None, is_demo=0) -> dict:
	dn = frappe.get_doc("Delivery Note", delivery_note)
	if dn.docstatus == 2:
		frappe.throw(_("Delivery Order {0} is cancelled").format(dn.name))
	if frappe.db.exists("Sales Weighment", {"delivery_note": dn.name, "docstatus": ["<", 2]}):
		frappe.throw(_("Delivery Order {0} already has a weighment").format(dn.name))
	kg, reading, note = p.take_weight(terminal, _("sales tare"), manual_kg, note, at)
	bags, exp = expected(dn)
	cfg = _settings()
	sw = frappe.get_doc({"doctype": "Sales Weighment", "delivery_note": dn.name, "customer": dn.customer, "customer_name": dn.customer_name,
		"vehicle_no": (vehicle_no or "").upper().strip(), "driver_name": driver_name, "terminal": terminal, "tare_kg": kg,
		"tare_at": at or now_datetime(), "bags": bags, "bag_weight_kg": cfg.bag_kg, "packing_kg": cfg.packing_kg, "expected_kg": exp,
		"allowed_pct": cfg.tolerance, "status": "Empty Weighed", "remarks": note or None, "is_demo": cint(is_demo)})
	sw.insert()
	p.reading_log(terminal, kg, reading, "Sales Tare", note)
	if not dn.get("dispatch_vehicle_no"):
		frappe.db.set_value("Delivery Note", dn.name, "dispatch_vehicle_no", sw.vehicle_no, update_modified=False)
	return sw.as_dict()


@frappe.whitelist(methods=["POST"])
def weigh_loaded(name: str, manual_kg=None, note=None, at=None, accept=0) -> dict:
	sw = frappe.get_doc("Sales Weighment", name)
	if sw.docstatus != 0 or sw.gross_kg:
		frappe.throw(_("Weighment {0} is already complete").format(name))
	kg, reading, note = p.take_weight(sw.terminal, _("sales gross"), manual_kg, note, at)
	sw.gross_kg, sw.gross_at = kg, at or now_datetime()
	if note:
		sw.remarks = "\n".join(x for x in (sw.remarks, note) if x)
	sw.flags.accept = cint(accept)
	sw.submit()
	p.reading_log(sw.terminal, kg, reading, "Sales Gross", note)
	return frappe.get_doc("Sales Weighment", name).as_dict()


def compute(doc):
	if doc.gross_kg and doc.tare_kg:
		doc.net_kg = cint(doc.gross_kg) - cint(doc.tare_kg)
		doc.difference_kg = round(flt(doc.net_kg) - flt(doc.expected_kg), 2)
		doc.difference_pct = round(100 * flt(doc.difference_kg) / flt(doc.expected_kg), 3) if flt(doc.expected_kg) else 0
		doc.within_limit = 1 if abs(flt(doc.difference_pct)) <= flt(doc.allowed_pct) else 0


def before_submit(doc):
	if not (doc.tare_kg and doc.gross_kg):
		frappe.throw(_("Weigh the truck empty and loaded first"))
	if doc.gross_kg <= doc.tare_kg:
		frappe.throw(_("The loaded weight must be more than the empty weight"))
	compute(doc)
	if not doc.within_limit:
		if not (doc.flags.accept and OVERRIDE & set(frappe.get_roles())):
			frappe.throw(_("Net {0} kg against {1} kg expected ({2}%, allowed ±{3}%). Count the bags again, or a Sales Manager accepts it with a note.")
				.format(doc.net_kg, doc.expected_kg, doc.difference_pct, doc.allowed_pct), title=_("Weight does not match the Delivery Order"))
	doc.status = "Completed"


def on_submit(doc):
	dn = frappe.get_doc("Delivery Note", doc.delivery_note)
	frappe.db.set_value("Delivery Note", dn.name, "sales_weighment", doc.name, update_modified=False)
	if dn.docstatus == 0:
		dn.reload()
		dn.flags.ignore_permissions = True
		dn.submit()
	if not frappe.db.get_value("Delivery Note", dn.name, "gate_pass"):
		from sugarcane.mill_stores.gate_pass import from_delivery_note

		from_delivery_note(dn.name, doc.vehicle_no, doc.driver_name, is_demo=doc.is_demo)


def on_cancel(doc):
	doc.db_set("status", "Cancelled")
	frappe.db.set_value("Delivery Note", doc.delivery_note, "sales_weighment", None, update_modified=False)
