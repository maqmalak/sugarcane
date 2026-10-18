# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class PlantLevelReading(Document):
	def validate(self):
		from sugarcane.sugar_mis.plant import validate_reading

		validate_reading(self)
