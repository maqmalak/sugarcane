# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from sugarcane.calc.units import acres_to_kanal


class GrowerPassbook(Document):
	def autoname(self):
		self.passbook_no = (self.passbook_no or "").strip().upper()
		self.name = self.passbook_no

	def validate(self):
		self.passbook_no = (self.passbook_no or "").strip().upper()
		for row in self.land_holdings:
			row.kanal = flt(acres_to_kanal(row.acres or 0), 2)
		self.total_acres = flt(sum(flt(r.acres) for r in self.land_holdings), 3)
		self.total_kanal = flt(acres_to_kanal(self.total_acres), 2)
		if self.status == "Active":
			other = frappe.db.get_value("Grower Passbook",
				{"grower": self.grower, "status": "Active", "name": ["!=", self.name]}, "name")
			if other:
				frappe.throw(_("Grower {0} already has active passbook {1}. Mark it Lost or Cancelled first.").format(
					frappe.bold(self.grower), frappe.bold(other)))

	def on_update(self):
		current = frappe.db.get_value("Grower", self.grower, "passbook_no")
		if self.status == "Active" and current != self.name:
			frappe.db.set_value("Grower", self.grower, "passbook_no", self.name)
		elif self.status != "Active" and current == self.name:
			frappe.db.set_value("Grower", self.grower, "passbook_no", None)

	def on_trash(self):
		if frappe.db.get_value("Grower", self.grower, "passbook_no") == self.name:
			frappe.db.set_value("Grower", self.grower, "passbook_no", None)
