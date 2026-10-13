# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

from sugarcane.eagleeye_survey import overlaps

DECIDERS = ("System Manager", "Cane Manager", "Cane Admin", "Circle Officer")


class SurveyOverlapReview(Document):
	def validate(self):
		if self.survey == self.other_survey:
			frappe.throw(_("A survey can't overlap itself"))
		before = self.get_doc_before_save()
		if before and before.status != "Open" and self.status != before.status:
			frappe.throw(_("This review is already decided ({0})").format(before.status))
		if self.status != "Open" and (not before or before.status == "Open"):
			if not set(frappe.get_roles()) & set(DECIDERS):
				frappe.throw(_("Only a Circle Officer or Cane Manager can decide an overlap"), frappe.PermissionError)
			self.reviewed_by = frappe.session.user
			self.reviewed_on = now_datetime()

	def on_update(self):
		before = self.get_doc_before_save()
		if self.status == "Open" or (before and before.status == self.status):
			return
		rejected = {"Rejected Survey": self.survey, "Rejected Other Survey": self.other_survey}.get(self.status)
		if rejected and frappe.db.get_value("Cane Survey", rejected, "docstatus") == 1:
			survey = frappe.get_doc("Cane Survey", rejected)
			survey.flags.ignore_permissions = True
			survey.add_comment("Comment", _("Cancelled by overlap review {0}").format(self.name))
			survey.cancel()
		for name in (self.survey, self.other_survey):
			overlaps.refresh_status(name)
