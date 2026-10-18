# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from sugarcane.mill_stores import gate_pass as gp


class GatePass(Document):
	def validate(self):
		gp.validate(self)

	def on_submit(self):
		gp.on_submit(self)

	def on_cancel(self):
		gp.on_cancel(self)
