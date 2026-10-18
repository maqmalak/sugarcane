# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from frappe.utils import nowdate

from sugarcane.cane_accounting import contractor_bills


class ContractorBill(Document):
	def validate(self):
		self.bill_date = self.bill_date or nowdate()
		if self.docstatus == 0:
			contractor_bills.build(self)
			self.status = "Draft"

	def before_submit(self):
		contractor_bills.check(self)

	def on_submit(self):
		contractor_bills.post(self)

	def before_cancel(self):
		self.ignore_linked_doctypes = ("Journal Entry", "GL Entry", "Payment Ledger Entry")

	def on_cancel(self):
		contractor_bills.unpost(self)
