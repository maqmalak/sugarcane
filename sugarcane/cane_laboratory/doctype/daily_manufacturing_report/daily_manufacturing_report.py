# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class DailyManufacturingReport(Document):
	def validate(self):
		from sugarcane.cane_laboratory.lab import build_dmr

		if self.docstatus == 0:
			build_dmr(self)
			if self.status not in ("Draft", "Prepared"):
				self.status = "Draft"

	def before_submit(self):
		from sugarcane.cane_laboratory.lab import APPROVE_ROLES

		if not APPROVE_ROLES & set(frappe.get_roles()):
			frappe.throw(_("The Production Manager approves the DMR"), frappe.PermissionError)
		if self.status != "Prepared":
			frappe.throw(_("The lab has to prepare the report before it is approved"))
		self.status = "Approved"
		self.approved_by, self.approved_at = frappe.session.user, now_datetime()

	def before_cancel(self):
		prod = frappe.db.get_value("Daily Production Entry", {"dmr": self.name, "docstatus": 1}, "name")
		if prod:
			frappe.throw(_("Production {0} was posted from this report; cancel it first").format(prod))
		later = frappe.db.get_value("Daily Manufacturing Report", {"season": self.season, "docstatus": 1, "crushing_day": [">", self.crushing_day]}, "name")
		if later:
			frappe.throw(_("Cancel the later report {0} first (its opening yard comes from this one)").format(later))

	def on_cancel(self):
		self.db_set("status", "Cancelled")
