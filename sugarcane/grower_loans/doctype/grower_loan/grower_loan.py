# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from sugarcane.grower_loans import loans


class GrowerLoan(Document):
	def validate(self):
		loans.validate_loan(self)

	def before_submit(self):
		loans._need(loans.MANAGERS, _("approve loans"))
		loans.check_approval(self)
		self.status = "Approved"
		self.approved_by, self.approved_on = frappe.session.user, frappe.utils.now_datetime()

	def before_cancel(self):
		if frappe.db.exists("Grower Loan Entry", {"loan": self.name}):
			frappe.throw(_("Loan {0} already has recoveries or markup; repay or write it off instead").format(self.name))
		self.ignore_linked_doctypes = ("Journal Entry", "GL Entry", "Payment Ledger Entry")

	def on_cancel(self):
		if self.disbursement_journal and frappe.db.get_value("Journal Entry", self.disbursement_journal, "docstatus") == 1:
			je = frappe.get_doc("Journal Entry", self.disbursement_journal)
			je.flags.ignore_permissions = True
			je.flags.ignore_links = True
			je.cancel()
		self.db_set("status", "Cancelled")
