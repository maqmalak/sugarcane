# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class SurveyDevice(Document):
	def validate(self):
		self.android_id = (self.android_id or "").strip()
		if not self.android_id:
			frappe.throw(_("Android ID is required"))
		if not self.device_name:
			self.device_name = self.android_id[:12]
