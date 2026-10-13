# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class SurveyorTarget(Document):
	def validate(self):
		if self.from_date and self.to_date and getdate(self.to_date) < getdate(self.from_date):
			frappe.throw(_("To date must be after from date"))
