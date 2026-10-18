# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SugarSMSTemplate(Document):
	def validate(self):
		from sugarcane.sms import render_sample, segments

		text = render_sample(self)
		self.chars = len(text)
		self.segments = segments(text)
