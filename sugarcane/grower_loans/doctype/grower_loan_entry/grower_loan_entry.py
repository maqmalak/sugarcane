# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class GrowerLoanEntry(Document):
	def on_update(self):
		if not self.flags.in_insert:
			frappe.throw(frappe._("Loan entries can't be changed"))
