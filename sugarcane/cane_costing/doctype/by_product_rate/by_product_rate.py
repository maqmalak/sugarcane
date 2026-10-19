# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate

from sugarcane.calc.costing import nrv_per_kg


class ByproductRate(Document):
	def validate(self):
		if flt(self.rate_per_ton) < 0 or flt(self.selling_cost_per_ton) < 0:
			frappe.throw(_("Rates can't be negative"))
		self.nrv_per_kg = nrv_per_kg(self.rate_per_ton, self.selling_cost_per_ton)
		s = frappe.db.get_value("Crushing Season", self.season, ["start_date", "end_date"], as_dict=True)
		if s and self.valid_from and not (getdate(s.start_date) <= getdate(self.valid_from) <= getdate(s.end_date)):
			frappe.throw(_("Valid From must fall inside season {0}").format(self.season))
		if frappe.db.exists("By-product Rate", {"season": self.season, "item": self.item, "valid_from": self.valid_from, "is_active": 1,
				"name": ["!=", self.name]}):
			frappe.throw(_("{0} already has a rate from {1}").format(self.item, self.valid_from))
