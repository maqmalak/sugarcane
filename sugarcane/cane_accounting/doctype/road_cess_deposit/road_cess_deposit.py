# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from sugarcane.cane_accounting import accounting


class RoadCessDeposit(Document):
	def validate(self):
		accounting.validate_deposit(self)

	def before_submit(self):
		accounting.check_deposit(self)

	def on_submit(self):
		accounting.submit_deposit(self)

	def before_cancel(self):
		self.ignore_linked_doctypes = ("Journal Entry", "Cane Purchase Receipt", "GL Entry", "Payment Ledger Entry")

	def on_cancel(self):
		accounting.cancel_deposit(self)
