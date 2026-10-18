# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, get_datetime


class CaneWeighment(Document):
	def validate(self):
		if cint(self.gross_kg) <= 0:
			frappe.throw(_("The gross weight is missing"))
		if self.docstatus == 0 and self.status != "Cancelled":
			self.status = "Gross"

	def before_submit(self):
		if not self.flags.ignore_permissions:
			frappe.throw(_("Weights are taken on the weighbridge screen"))
		if cint(self.tare_kg) <= 0:
			frappe.throw(_("Take the tare weight first"))
		if cint(self.tare_kg) >= cint(self.gross_kg):
			frappe.throw(_("Tare {0} kg is not less than gross {1} kg").format(self.tare_kg, self.gross_kg))
		self.net_kg = cint(self.gross_kg) - cint(self.tare_kg)
		self.yard_minutes = int((get_datetime(self.tare_at) - get_datetime(self.gross_at)).total_seconds() // 60)
		self.status = "Completed"

	def on_submit(self):
		from sugarcane.cane_procurement.procurement import make_cpr

		self.db_set("cpr", make_cpr(self))

	def before_cancel(self):
		if self.cpr and frappe.db.get_value("Cane Purchase Receipt", self.cpr, "docstatus") == 1:
			frappe.throw(_("Cancel CPR {0} first").format(self.cpr))
		self.ignore_linked_doctypes = ("Cane Token", "Cane Purchase Receipt", "Weighment Reading Log")

	def on_cancel(self):
		self.db_set("status", "Cancelled")
