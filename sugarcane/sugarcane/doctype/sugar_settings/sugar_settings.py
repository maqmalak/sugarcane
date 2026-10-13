# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class SugarSettings(Document):
	def validate(self):
		if self.maund_kg and self.maund_kg <= 0:
			frappe.throw(_("Maund must be more than 0 kg"))
		if self.crushing_day_start_hour is not None and not 0 <= self.crushing_day_start_hour <= 23:
			frappe.throw(_("Crushing day start hour must be 0–23"))
		if self.active_season and self.company and frappe.db.get_value(
				"Crushing Season", self.active_season, "company") != self.company:
			frappe.throw(_("Season {0} belongs to another company").format(frappe.bold(self.active_season)))

		self.set_mill_pin()

	def set_mill_pin(self):
		from sugarcane.calc import geo

		try:
			poly = geo.polygon_of(self.mill_boundary)
		except (geo.GeoError, ValueError, TypeError, KeyError) as e:
			frappe.throw(_("The mill premises are not a valid polygon: {0}").format(e))
		if poly is not None and not (self.mill_latitude and self.mill_longitude):
			self.mill_latitude, self.mill_longitude = (round(v, 6) for v in geo.centroid(poly))

	def on_update(self):
		frappe.clear_document_cache("Sugar Settings", "Sugar Settings")


@frappe.whitelist()
def setup_accounts():
	"""Creates the cane ledgers, Cane Yard warehouse, Sugarcane item and internal supplier for the settings company."""
	frappe.only_for(("System Manager", "Cane Admin"))
	company = frappe.db.get_single_value("Sugar Settings", "company")
	if not company:
		frappe.throw(_("Set the company first"))
	from sugarcane.setup.accounts import setup_company

	return setup_company(company)
