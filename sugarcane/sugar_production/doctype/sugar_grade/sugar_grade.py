# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class SugarGrade(Document):
	def validate(self):
		if self.is_default:
			frappe.db.sql("update `tabSugar Grade` set is_default = 0 where name != %s", self.name or "")
		other = frappe.db.get_value("Sugar Grade", {"item": self.item, "name": ["!=", self.name or ""]}, "name")
		if other:
			frappe.throw(_("Item {0} is already grade {1}").format(self.item, other))


def grades() -> list:
	return frappe.get_all("Sugar Grade", filters={"is_active": 1}, fields=["name", "item", "is_default", "sequence"], order_by="sequence asc, name asc")


def default_grade():
	g = frappe.db.get_value("Sugar Grade", {"is_default": 1, "is_active": 1}, ["name", "item"], as_dict=True)
	if g:
		return g
	item = frappe.db.get_single_value("Sugar Settings", "sugar_item")
	return frappe._dict(name=None, item=item)
