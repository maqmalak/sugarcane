# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class CrushingSeason(Document):
	def validate(self):
		if getdate(self.end_date) <= getdate(self.start_date):
			frappe.throw(_("End date must be after the start date"))
		for field in ("road_cess_pct", "grower_cess_share_pct", "garbage_pct", "standard_recovery_pct"):
			if not 0 <= (self.get(field) or 0) <= 100:
				frappe.throw(_("{0} must be between 0 and 100").format(_(self.meta.get_label(field))))
		if self.status == "Open":
			other = frappe.db.get_value("Crushing Season",
				{"company": self.company, "status": "Open", "name": ["!=", self.name]}, "name")
			if other:
				frappe.throw(_("Season {0} is already open for {1}. Close it first.").format(
					frappe.bold(other), frappe.bold(self.company)))
		seen = set()
		for row in self.get("circle_quotas") or []:
			if row.circle in seen:
				frappe.throw(_("Row {0}: circle {1} has more than one quota").format(row.idx, frappe.bold(row.circle)))
			seen.add(row.circle)
			if (row.quota_maund or 0) < 0:
				frappe.throw(_("Row {0}: the quota cannot be negative").format(row.idx))

	def on_update(self):
		settings = frappe.get_single("Sugar Settings")
		if self.status == "Open" and settings.company == self.company and settings.active_season != self.name:
			settings.db_set("active_season", self.name)
			frappe.clear_document_cache("Sugar Settings", "Sugar Settings")
