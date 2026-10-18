# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class CaneToken(Document):
	def before_submit(self):
		if not self.flags.ignore_permissions:
			frappe.throw(_("Tokens are issued from the gate screen"))
		self.status = "Issued"

	def before_cancel(self):
		if self.cpr and frappe.db.get_value("Cane Purchase Receipt", self.cpr, "docstatus") == 1:
			frappe.throw(_("Token {0} already has CPR {1}; cancel the CPR first").format(self.name, self.cpr))

		self.ignore_linked_doctypes = ("Cane Weighment", "Cane Purchase Receipt", "TPT Bilty", "Cane Indent", "LP Vehicle Registration")

	def on_cancel(self):
		from sugarcane.cane_procurement.procurement import on_token_cancel

		on_token_cancel(self)
