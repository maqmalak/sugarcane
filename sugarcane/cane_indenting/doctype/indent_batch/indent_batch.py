# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class IndentBatch(Document):
	def indents(self, **filters):
		return frappe.get_all("Cane Indent", filters={"batch": self.name, **filters}, pluck="name", order_by="name asc")

	def validate(self):
		if self.docstatus == 0:
			self.status = "Draft"

	def before_submit(self):
		if not self.indents(docstatus=0):
			frappe.throw(_("This batch has no draft indents to authorize"))
		self.status = "Authorized"
		self.authorized_by = frappe.session.user
		self.authorized_on = now_datetime()

	def on_submit(self):
		"""Authorizing the batch authorizes every indent in it."""
		for name in self.indents(docstatus=0):
			doc = frappe.get_doc("Cane Indent", name)
			doc.flags.ignore_permissions = True  # the batch's own submit permission was checked
			doc.submit()
		from sugarcane.notify import indent_batch_authorized

		indent_batch_authorized(self)

	def before_cancel(self):
		# its indents link here; used ones stay submitted, the rest are cancelled in on_cancel
		self.ignore_linked_doctypes = ("Cane Indent",)

	def on_cancel(self):
		"""Cancelling the batch cancels its indents that were not used yet; used ones stay."""
		skipped = 0
		for name in self.indents(docstatus=1):
			doc = frappe.get_doc("Cane Indent", name)
			if doc.status == "Used":
				skipped += 1
				continue
			doc.flags.ignore_permissions = True
			doc.cancel_reason = doc.cancel_reason or _("Batch {0} cancelled").format(self.name)
			doc.cancel()
		self.db_set("status", "Cancelled")
		if skipped:
			frappe.msgprint(_("{0} indent(s) were already used and stay as they are").format(skipped))

	def on_trash(self):
		"""Deleting a draft batch (rejecting it) deletes its draft indents; their numbers stay unused."""
		for name in self.indents(docstatus=0):
			frappe.delete_doc("Cane Indent", name, ignore_permissions=True, force=True)
