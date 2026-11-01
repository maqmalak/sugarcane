# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from sugarcane.utils import clean_cnic, clean_mobile


class CaneDriver(Document):
	def validate(self):
		self.driver_name = (self.driver_name or "").strip()
		self.father_name = (self.father_name or "").strip() or None
		self.cnic = clean_cnic(self.cnic, _("Driver CNIC"))
		if self.mobile:
			self.mobile = clean_mobile(self.mobile, _("Driver mobile"))
		other = frappe.db.get_value("Cane Driver", {"cnic": self.cnic, "name": ("!=", self.name)})
		if other:
			frappe.throw(_("CNIC {0} is already registered as driver {1}").format(frappe.bold(self.cnic), frappe.bold(other)),
				title=_("Duplicate driver"))
