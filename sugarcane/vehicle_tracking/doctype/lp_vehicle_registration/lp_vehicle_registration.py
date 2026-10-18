# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class LPVehicleRegistration(Document):
	def validate(self):
		from sugarcane.vehicle_tracking.elp import validate_registration

		validate_registration(self)
