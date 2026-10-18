# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class MillStoppage(Document):
	def validate(self):
		from sugarcane.cane_laboratory.lab import validate_stoppage

		validate_stoppage(self)
