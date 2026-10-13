# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from sugarcane.calc.identity import CIRCLE_CODE_LEN
from sugarcane.utils import clean_code


class CaneCircle(Document):
	def validate(self):
		self.circle_code = clean_code(self.circle_code, CIRCLE_CODE_LEN, "Circle code")
		if not self.is_new() and self.has_value_changed("circle_code"):
			frappe.throw(_("The circle code is part of every village and grower ID in the circle and can't be changed"))
