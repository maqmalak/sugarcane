# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from sugarcane.calc.identity import VILLAGE_CODE_LEN
from sugarcane.utils import clean_code


class CaneVillage(Document):
	def autoname(self):
		"""<circle code>-<village code>, e.g. 001-001: the same prefix the village's grower IDs start with."""
		self.village_code = clean_code(self.village_code, VILLAGE_CODE_LEN, "Village code")
		circle_code = frappe.db.get_value("Cane Circle", self.circle, "circle_code")
		self.name = f"{circle_code}-{self.village_code}"

	def validate(self):
		self.village_code = clean_code(self.village_code, VILLAGE_CODE_LEN, "Village code")
		if not self.is_new() and self.has_value_changed("village_code"):
			frappe.throw(_("The village code is part of the village and grower IDs and can't be changed"))
		if self.sector and frappe.db.get_value("Cane Sector", self.sector, "circle") != self.circle:
			frappe.throw(_("Sector {0} is not in circle {1}").format(frappe.bold(self.sector), frappe.bold(self.circle)))
		if not self.is_new() and self.has_value_changed("circle"):
			frappe.throw(_("A village can't move to another circle; its grower IDs carry the circle code"))
