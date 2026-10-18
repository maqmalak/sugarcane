# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from sugarcane.sugar_sales import dispatch


class SalesWeighment(Document):
	def validate(self):
		dispatch.compute(self)
		if self.docstatus == 0:
			self.status = "Empty Weighed"

	def before_submit(self):
		dispatch.before_submit(self)

	def on_submit(self):
		dispatch.on_submit(self)

	def on_cancel(self):
		dispatch.on_cancel(self)
