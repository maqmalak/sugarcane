# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, nowdate


class UnloadingContract(Document):
	def validate(self):
		if getdate(self.valid_to) < getdate(self.valid_from):
			frappe.throw(_("The contract ends before it starts"))
		clash = frappe.db.sql("""select name from `tabUnloading Contract` where name != %s and status = 'Active' and valid_from <= %s
			and valid_to >= %s limit 1""", (self.name or "", self.valid_to, self.valid_from))
		if clash and self.status != "Terminated":
			frappe.throw(_("Contract {0} already covers part of this period").format(clash[0][0]))
		seen = set()
		for r in self.rates:
			if r.vehicle_type in seen:
				frappe.throw(_("{0} has two rates").format(r.vehicle_type))
			seen.add(r.vehicle_type)
		if self.status != "Terminated":
			self.status = "Expired" if getdate(self.valid_to) < getdate(nowdate()) else "Active"
