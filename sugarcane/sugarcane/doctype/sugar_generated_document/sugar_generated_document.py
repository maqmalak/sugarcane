# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SugarGeneratedDocument(Document):
	def on_update(self):
		if not self.flags.in_insert:
			frappe.throw(frappe._("A generated document can't be changed; generate a new version"))
