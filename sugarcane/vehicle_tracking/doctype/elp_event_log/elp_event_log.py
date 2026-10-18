# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class ELPEventLog(Document):
	def on_update(self):
		if not self.flags.in_insert:
			frappe.throw(frappe._("The ELP log can't be changed"))

	def on_trash(self):
		if not frappe.flags.in_test and "System Manager" not in frappe.get_roles():
			frappe.throw(frappe._("The ELP log can't be deleted"))
