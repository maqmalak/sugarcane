# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class LabSample(Document):
	def validate(self):
		from sugarcane.cane_laboratory.lab import validate_sample

		validate_sample(self)
