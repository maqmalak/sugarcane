# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint


class IndentRange(Document):
	def validate(self):
		self.from_no, self.to_no, self.digits = cint(self.from_no), cint(self.to_no), cint(self.digits) or 6
		if self.from_no <= 0 or self.to_no < self.from_no:
			frappe.throw(_("The range must run from a positive number up to a number at least as large"))
		if len(str(self.to_no)) > self.digits:
			frappe.throw(_("{0} does not fit in {1} digits").format(self.to_no, self.digits))
		if self.is_new() or not self.next_no:
			self.next_no = self.from_no
		if not self.from_no <= cint(self.next_no) <= self.to_no + 1:
			frappe.throw(_("Next number {0} is outside the range").format(self.next_no))
		self.remaining = self.to_no - cint(self.next_no) + 1
		if self.remaining <= 0 and self.status == "Active":
			self.status = "Exhausted"
		clash = frappe.db.sql("""select name from `tabIndent Range` where name != %s and ifnull(prefix, '') = %s
			and from_no <= %s and to_no >= %s""", (self.name or "", self.prefix or "", self.to_no, self.from_no))
		if clash:
			frappe.throw(_("Numbers {0}{1}–{0}{2} overlap range {3}").format(self.prefix or "", self.from_no, self.to_no, clash[0][0]))
		if not self.is_new():
			before = self.get_doc_before_save()
			if before and cint(before.next_no) > self.from_no and (before.from_no != self.from_no or (before.prefix or "") != (self.prefix or "")):
				frappe.throw(_("Numbers from this range are already used — its start and prefix can no longer change"))
