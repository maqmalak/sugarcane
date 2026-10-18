# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, now_datetime

from sugarcane.calc.cpr import CPRError, CPRInput, compute

INPUTS = ("govt_rate", "road_cess_pct", "grower_cess_share_pct", "subsidy_rate", "additional_subsidy_rate", "tpt_rate",
	"binding_kg_per_quintal", "garbage_pct", "garbage_fixed_kg", "loan_deduction")


class CanePurchaseReceipt(Document):
	def validate(self):
		"""Every amount is recomputed from the weights and the rates copied from the token, so nothing typed in survives."""
		from sugarcane.cane_procurement.procurement import settings

		try:
			self.result = compute(CPRInput(gross_kg=self.gross_kg, tare_kg=self.tare_kg, maund_kg=settings().maund_kg,
				**{f: self.get(f) or 0 for f in INPUTS}))
		except CPRError as e:
			frappe.throw(str(e), title=_("CPR"))
		for k, v in self.result.as_dict(floats=True).items():
			if k != "loan_capped" and self.meta.has_field(k):
				self.set(k, v)
		if not self.posted_at:
			self.posted_at = now_datetime()

	def before_submit(self):
		if not self.flags.ignore_permissions and not frappe.has_permission(self.doctype, "submit"):
			frappe.throw(_("CPRs are posted by the tare weighment"), frappe.PermissionError)
		self.payment_status = "Unpaid"

	def on_submit(self):
		from sugarcane.cane_procurement.procurement import cpr_journal_entry, make_bilty

		self.db_set("journal_entry", cpr_journal_entry(self))
		self.db_set("bilty", make_bilty(self))
		from sugarcane.grower_loans.loans import record_recovery

		record_recovery(self)
		now = now_datetime()
		frappe.db.set_value("Cane Token", self.token, {"status": "Completed", "cpr": self.name, "completed_at": now}, update_modified=False)
		frappe.db.set_value("Cane Weighment", self.weighment, "cpr", self.name, update_modified=False)

	def before_cancel(self):
		if self.payment_status == "Paid":
			frappe.throw(_("CPR {0} is already paid to the grower ({1})").format(self.name, self.payment_scroll or ""))
		if self.cess_deposited:
			frappe.throw(_("The road cess of CPR {0} is already deposited ({1})").format(self.name, self.road_cess_deposit or ""))
		if self.daily_purchase and frappe.db.get_value("Daily Cane Purchase", self.daily_purchase, "docstatus") == 1:
			frappe.throw(_("Crushing day {0} is closed (invoice {1}). Cancel the Daily Cane Purchase first.").format(
				self.posting_date, self.daily_purchase))
		if self.bilty and frappe.db.get_value("TPT Bilty", self.bilty, "status") == "Paid":
			frappe.throw(_("Bilty {0} was paid to the driver; reverse that payment first").format(self.bilty))
		self.ignore_linked_doctypes = ("Cane Token", "Cane Weighment", "TPT Bilty", "Journal Entry", "Daily Cane Purchase", "Grower Loan Entry",
			"GL Entry", "Payment Ledger Entry")

	def on_cancel(self):
		for doctype, name in (("TPT Bilty", self.bilty), ("Journal Entry", self.journal_entry)):
			if name and frappe.db.get_value(doctype, name, "docstatus") == 1:
				doc = frappe.get_doc(doctype, name)
				doc.flags.ignore_permissions = True
				doc.flags.ignore_links = True
				doc.cancel()
		from sugarcane.grower_loans.loans import undo_recovery

		undo_recovery(self)
		frappe.db.set_value("Cane Token", self.token, "cpr", None, update_modified=False)
		frappe.db.set_value("Cane Weighment", self.weighment, "cpr", None, update_modified=False)
		self.db_set("daily_purchase", None)
