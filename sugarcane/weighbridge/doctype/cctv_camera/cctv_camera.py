# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class CCTVCamera(Document):
	def validate(self):
		self.camera_name = (self.camera_name or "").strip()
		if self.snapshot_url and not self.snapshot_url.lower().startswith(("http://", "https://")):
			frappe.throw(_("Snapshot URL must start with http:// or https://"))
		if self.place != "Weighbridge":
			self.terminal = None
		if self.place != "Depot Gate":
			self.depot = None
