# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class DailyProductionEntry(Document):
	def validate(self):
		from sugarcane.sugar_production.production import fill

		if self.docstatus == 0:
			fill(self)
			self.status = "Draft"

	def before_submit(self):
		from sugarcane.sugar_production.production import check

		check(self)

	def on_submit(self):
		from sugarcane.sugar_production.production import post

		post(self)

	def before_cancel(self):
		later = frappe.db.get_value("Daily Production Entry", {"docstatus": 1, "crushing_day": [">", self.crushing_day]}, "name")
		if later:
			frappe.throw(_("Cancel the later production {0} first").format(later))
		self.ignore_linked_doctypes = ("Stock Entry", "Work Order", "Daily Manufacturing Report", "Stock Ledger Entry", "GL Entry")

	def on_cancel(self):
		from sugarcane.sugar_production.production import unpost

		unpost(self)
