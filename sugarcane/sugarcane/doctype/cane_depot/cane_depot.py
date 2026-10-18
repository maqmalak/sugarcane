# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class CaneDepot(Document):
	def validate(self):
		company = frappe.db.get_single_value("Sugar Settings", "company")
		if not self.warehouse and company and frappe.db.exists("Company", company):
			from sugarcane.setup.accounts import depot_warehouse

			self.warehouse = depot_warehouse(self.depot_name or self.name, company)
