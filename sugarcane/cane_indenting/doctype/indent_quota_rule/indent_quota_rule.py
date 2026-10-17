# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate


class IndentQuotaRule(Document):
	def validate(self):
		if not 0 <= flt(self.quota_pct) <= 200:
			frappe.throw(_("Quota % must be between 0 and 200"))
		start, end = frappe.db.get_value("Crushing Season", self.season, ["start_date", "end_date"])
		if self.from_date and self.to_date and getdate(self.to_date) < getdate(self.from_date):
			frappe.throw(_("Supply To is before Supply From"))
		for f in ("from_date", "to_date"):
			if self.get(f) and not getdate(start) <= getdate(self.get(f)) <= getdate(end):
				frappe.throw(_("{0} must fall inside season {1} ({2} – {3})").format(_(self.meta.get_label(f)), self.season,
					frappe.utils.formatdate(start), frappe.utils.formatdate(end)))
