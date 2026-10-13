# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class VehicleType(Document):
	def validate(self):
		for low, high in (("min_gross_kg", "max_gross_kg"), ("min_tare_kg", "max_tare_kg")):
			if self.get(low) and self.get(high) and self.get(low) > self.get(high):
				frappe.throw(_("{0} can't be more than {1}").format(_(self.meta.get_label(low)), _(self.meta.get_label(high))))
		if self.max_tare_kg and self.max_gross_kg and self.max_tare_kg >= self.max_gross_kg:
			frappe.throw(_("Max tare must be less than max gross"))
