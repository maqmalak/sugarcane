# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint


class DepotDispatch(Document):
	def validate(self):
		if self.docstatus == 0 and self.status not in ("Loading", "In Transit"):
			self.status = "Loading"

	def before_submit(self):
		if not self.flags.ignore_permissions:
			frappe.throw(_("A dispatch is sent by taking its loaded weight on the depot's weighbridge"))
		if cint(self.dispatched_kg) <= 0:
			frappe.throw(_("Take the empty and loaded weights at the depot first"))

	def before_cancel(self):
		if cint(self.posted_out) or cint(self.posted_in):
			frappe.throw(_("Dispatch {0} is posted with a closed day; cancel that Daily Cane Purchase first").format(self.name))
		self.ignore_linked_doctypes = ("Weighment Reading Log", "Stock Entry", "Journal Entry")

	def on_cancel(self):
		self.db_set("status", "Cancelled")
