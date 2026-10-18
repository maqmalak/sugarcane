# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class VehicleRecoverySample(Document):
	def validate(self):
		from sugarcane.cane_laboratory.lab import validate_vehicle_sample

		validate_vehicle_sample(self)
