# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SugarVaultDocument(Document):
	def validate(self):
		from sugarcane.vault import status_of

		if self.grower:
			self.grower_name = frappe.db.get_value("Grower", self.grower, "grower_name")
		self.status = status_of(self)
