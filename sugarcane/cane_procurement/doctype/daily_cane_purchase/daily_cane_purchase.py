# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, getdate, now_datetime


class DailyCanePurchase(Document):
	def validate(self):
		from sugarcane.cane_procurement.procurement import day_cprs, day_window, season_for, settings

		cfg = settings()
		self.crushing_day = getdate(self.crushing_day)
		self.company = self.company or cfg.company
		self.season = season_for(self.crushing_day)
		self.from_time, self.to_time = day_window(self.crushing_day, cfg)
		if self.docstatus == 0:
			self.set("items", [])
			rows = day_cprs(self.crushing_day, self.name if not self.is_new() else None)
			for r in rows:
				self.append("items", {"cpr": r.name, "grower": r.grower, "grower_name": r.grower_name, "payable_kg": r.payable_kg,
					"warehouse": r.warehouse or cfg.warehouse, "govt_value": r.govt_value, "journal_entry": r.journal_entry})
			self.cpr_count = len(rows)
			self.total_payable_kg = sum(cint(r.payable_kg) for r in rows)
			self.total_payable_maund = flt(self.total_payable_kg / cfg.maund_kg, 3)
			self.total_govt_value = flt(sum(flt(r.govt_value) for r in rows), 2)
			self.total_tpt = flt(sum(flt(r.tpt_amount) for r in rows), 2)
			self.total_payable = flt(sum(flt(r.payable_cpr) for r in rows), 2)
			self.status = "Draft"

	def before_submit(self):
		from sugarcane.depot_purchase.depot import day_movements, pending_before

		mv = day_movements(self.crushing_day)
		if not self.items and not (mv["out"] or mv["in"]):
			frappe.throw(_("Nothing to close on crushing day {0}: no CPRs and no depot dispatches").format(
				frappe.utils.formatdate(self.crushing_day)))
		earlier = pending_before(self.crushing_day, self.season)
		if earlier:
			frappe.throw(_("Close the earlier crushing day(s) first: {0}").format(", ".join(earlier)), title=_("Days close in order"))
		if now_datetime() < self.to_time and not (self.flags.force_close or frappe.flags.in_test or cint(self.is_demo)):
			frappe.throw(_("Crushing day {0} ends at {1}. Close it after that.").format(frappe.utils.formatdate(self.crushing_day),
				frappe.utils.format_datetime(self.to_time, "dd MMM HH:mm")), title=_("Day not over"))
		open_tokens = frappe.db.count("Cane Token", {"crushing_day": self.crushing_day, "docstatus": 1, "status": ["in", ["Issued", "Gross"]]})
		if open_tokens and not self.flags.force_close:
			self.remarks = _("{0} token(s) of this day were still in the yard at closing; their CPRs fall on the day they are tared.").format(open_tokens)

	def on_submit(self):
		from sugarcane.cane_procurement.procurement import make_purchase_invoice, reconcile_day

		from sugarcane.depot_purchase.depot import post_day

		pi, ok = None, True
		if self.items:
			pi = make_purchase_invoice(self)
			ok = reconcile_day(self, pi)
			self.append("postings", {"kind": "Purchase Invoice", "voucher": pi, "description": _("Cane bought, {0} CPRs").format(len(self.items)),
				"amount": self.total_govt_value}).db_insert()
		for row in post_day(self):
			self.append("postings", row).db_insert()
		self.db_set({"purchase_invoice": pi, "reconciled": 1 if ok else 0, "status": "Invoiced"})
		for it in self.items:
			frappe.db.set_value("Cane Purchase Receipt", it.cpr, "daily_purchase", self.name, update_modified=False)

	def before_cancel(self):
		later = frappe.db.get_value("Daily Cane Purchase", {"season": self.season, "docstatus": 1, "crushing_day": [">", self.crushing_day]},
			"name", order_by="crushing_day desc")
		if later:
			frappe.throw(_("Cancel the later closed day {0} first (days reopen from the latest)").format(later))
		self.ignore_linked_doctypes = ("Purchase Invoice", "Cane Purchase Receipt", "GL Entry", "Stock Ledger Entry", "Payment Ledger Entry")

	def on_cancel(self):
		from erpnext.accounts.utils import unlink_ref_doc_from_payment_entries

		from sugarcane.depot_purchase.depot import unpost_day

		unpost_day(self)
		if self.purchase_invoice and frappe.db.get_value("Purchase Invoice", self.purchase_invoice, "docstatus") == 1:
			pi = frappe.get_doc("Purchase Invoice", self.purchase_invoice)
			unlink_ref_doc_from_payment_entries(pi)
			pi.reload()
			pi.flags.ignore_permissions = True
			pi.flags.ignore_links = True
			pi.cancel()
		for it in self.items:
			frappe.db.set_value("Cane Purchase Receipt", it.cpr, "daily_purchase", None, update_modified=False)
		self.db_set({"status": "Cancelled", "reconciled": 0})
