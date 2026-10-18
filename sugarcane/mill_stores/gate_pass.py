# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Gate passes: nothing leaves the mill without one. Returnable (repair, loan of tools), non-returnable (scrap, rejected
material back to the supplier) and sales dispatch (made from the Delivery Order when the truck's weighment is done)."""
import frappe
from frappe import _
from frappe.utils import flt, now_datetime, nowdate


def validate(doc):
	if not doc.items:
		frappe.throw(_("Add the items that go out"))
	for i in doc.items:
		if flt(i.qty) <= 0:
			frappe.throw(_("Row {0}: give a quantity").format(i.idx))
		if i.item_code and not i.description:
			i.description = frappe.db.get_value("Item", i.item_code, "item_name")
		if i.item_code and not i.uom:
			i.uom = frappe.db.get_value("Item", i.item_code, "stock_uom")
	if doc.pass_type == "Outward - Returnable" and not doc.expected_return_date:
		frappe.throw(_("A returnable gate pass needs the date the items are expected back"))
	if doc.party and not doc.party_name and doc.party_type in ("Supplier", "Customer", "Employee"):
		field = {"Supplier": "supplier_name", "Customer": "customer_name", "Employee": "employee_name"}[doc.party_type]
		doc.party_name = frappe.db.get_value(doc.party_type, doc.party, field)
	if doc.docstatus == 0:
		doc.status = "Draft"


def on_submit(doc):
	doc.db_set({"status": "Out", "out_at": now_datetime(), "out_by": frappe.session.user})
	if doc.reference_doctype == "Delivery Note" and doc.reference_name:
		frappe.db.set_value("Delivery Note", doc.reference_name, "gate_pass", doc.name, update_modified=False)
	if doc.pass_type != "Outward - Returnable":
		doc.db_set({"status": "Closed", "closed_on": nowdate()})


def on_cancel(doc):
	doc.db_set("status", "Cancelled")
	if doc.reference_doctype == "Delivery Note" and doc.reference_name:
		frappe.db.set_value("Delivery Note", doc.reference_name, "gate_pass", None, update_modified=False)


@frappe.whitelist(methods=["POST"])
def record_return(name: str, rows=None, on=None) -> dict:
	"""Items of a returnable pass came back: rows = {row name: qty} (empty = everything still out)."""
	doc = frappe.get_doc("Gate Pass", name)
	doc.check_permission("submit")
	if doc.docstatus != 1 or doc.pass_type != "Outward - Returnable":
		frappe.throw(_("Only a submitted returnable gate pass takes returns"))
	rows = frappe.parse_json(rows) if rows else {}
	for i in doc.items:
		qty = flt(rows.get(i.name)) if rows else flt(i.qty) - flt(i.returned_qty)
		if qty < 0 or flt(i.returned_qty) + qty > flt(i.qty) + 1e-9:
			frappe.throw(_("Row {0}: more back than went out").format(i.idx))
		if qty:
			i.db_set({"returned_qty": flt(i.returned_qty) + qty, "returned_on": on or nowdate()})
	doc.reload()
	back = all(flt(i.returned_qty) >= flt(i.qty) - 1e-9 for i in doc.items)
	doc.db_set({"status": "Returned" if back else "Partly Returned", "closed_on": (on or nowdate()) if back else None})
	doc.add_comment("Info", _("Returned: {0}").format(", ".join(f"{i.description or i.item_code} {i.returned_qty:g}/{i.qty:g}" for i in doc.items)))
	return doc.as_dict()


def from_delivery_note(dn, vehicle_no=None, driver_name=None, is_demo=0) -> str:
	"""The sales dispatch pass for a Delivery Order, submitted (the truck leaves)."""
	d = frappe.get_doc("Delivery Note", dn)
	gp = frappe.get_doc({"doctype": "Gate Pass", "pass_type": "Sales Dispatch", "posting_date": d.posting_date, "party_type": "Customer",
		"party": d.customer, "party_name": d.customer_name, "vehicle_no": vehicle_no or d.get("dispatch_vehicle_no"), "driver_name": driver_name,
		"reference_doctype": "Delivery Note", "reference_name": d.name, "is_demo": is_demo,
		"items": [{"item_code": i.item_code, "description": i.item_name, "qty": i.qty, "uom": i.uom} for i in d.items]})
	gp.flags.ignore_permissions = True
	gp.insert()
	gp.submit()
	return gp.name
