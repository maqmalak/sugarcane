# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class CostAllocationRule(Document):
	def validate(self):
		seen = set()
		for t in self.targets:
			if t.cost_center == self.service_cost_center:
				frappe.throw(_("Row {0}: a cost centre can't be allocated to itself").format(t.idx))
			if t.cost_center in seen:
				frappe.throw(_("Row {0}: {1} is listed twice").format(t.idx, t.cost_center))
			seen.add(t.cost_center)
		if self.basis == "Fixed %" and self.targets and abs(sum(flt(t.pct) for t in self.targets) - 100) > 0.01:
			frappe.throw(_("The shares add up to {0}%, not 100%").format(round(sum(flt(t.pct) for t in self.targets), 2)))
		if self.basis == "Hours" and not any(flt(t.hours) for t in self.targets):
			frappe.throw(_("Enter the hours of each cost centre"))
		if self.is_active and frappe.db.exists("Cost Allocation Rule", {"service_cost_center": self.service_cost_center, "is_active": 1,
				"name": ["!=", self.name]}):
			frappe.throw(_("{0} already has an active rule").format(self.service_cost_center))
