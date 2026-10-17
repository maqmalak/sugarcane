# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, cint, flt, getdate, now_datetime


class CaneIndent(Document):
	def autoname(self):
		from sugarcane.cane_indenting.numbering import allocate

		self.indent_no = self.name = allocate(self.season, self.circle)

	def validate(self):
		if flt(self.load_maund) <= 0:
			frappe.throw(_("The load must be more than 0 maund"))
		start, end, validity = frappe.db.get_value("Crushing Season", self.season, ["start_date", "end_date", "indent_validity_days"])
		if not getdate(start) <= getdate(self.indent_date) <= getdate(end):
			frappe.throw(_("Supply date {0} is outside season {1}").format(frappe.utils.formatdate(self.indent_date), self.season))
		self.valid_from = self.indent_date
		self.valid_to = add_days(self.indent_date, max(cint(validity) or 3, 1) - 1)
		if self.grower and self.circle and frappe.db.get_value("Grower", self.grower, "circle") not in (self.circle, None):
			frappe.throw(_("Grower {0} belongs to another circle").format(self.grower))
		if self.docstatus == 0:
			self.status = "Draft"

	def before_submit(self):
		self.status = "Authorized"
		self.authorized_by = frappe.session.user
		self.authorized_on = now_datetime()

	def before_cancel(self):
		if self.status == "Used":
			frappe.throw(_("Indent {0} was already used by token {1} and can't be cancelled").format(self.name, self.token))

	def on_cancel(self):
		self.db_set("status", "Cancelled")

	def on_trash(self):
		if self.docstatus == 0 and self.batch and frappe.db.get_value("Indent Batch", self.batch, "docstatus") == 1:
			frappe.throw(_("This indent belongs to an authorized batch"))
