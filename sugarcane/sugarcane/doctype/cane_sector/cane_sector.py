# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from sugarcane.utils import clean_code


class CaneSector(Document):
	def autoname(self):
		"""<circle code>-S<sector code>, e.g. 001-S01."""
		self.sector_code = clean_code(self.sector_code, 2, "Sector code")
		circle_code = frappe.db.get_value("Cane Circle", self.circle, "circle_code")
		self.name = f"{circle_code}-S{self.sector_code}"

	def validate(self):
		self.sector_code = clean_code(self.sector_code, 2, "Sector code")
