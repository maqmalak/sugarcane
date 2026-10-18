# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class TPTBilty(Document):
	def before_submit(self):
		self.status = "Unpaid"

	def before_cancel(self):
		if self.status == "Paid":
			frappe.throw(_("Bilty {0} was paid; reverse the payment first").format(self.name))
		self.ignore_linked_doctypes = ("Cane Purchase Receipt",)

	def on_cancel(self):
		self.db_set("status", "Cancelled")
