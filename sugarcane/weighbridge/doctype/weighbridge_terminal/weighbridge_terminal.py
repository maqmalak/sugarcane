# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import ipaddress

import frappe
from frappe import _
from frappe.model.document import Document


class WeighbridgeTerminal(Document):
	def validate(self):
		try:
			self.ip_address = str(ipaddress.ip_address((self.ip_address or "").strip()))
		except ValueError:
			frappe.throw(_("{0} is not a valid IP address").format(frappe.bold(self.ip_address)))
		if self.is_active:
			other = frappe.db.get_value("Weighbridge Terminal",
				{"ip_address": self.ip_address, "is_active": 1, "name": ["!=", self.name]}, "name")
			if other:
				frappe.throw(_("IP {0} is already used by terminal {1}").format(self.ip_address, frappe.bold(other)))


def terminal_for_request(operation: str | None = None):
	"""The active terminal registered for the caller's IP, or a PermissionError. Weighment APIs (Phase 3) call this
	before accepting a reading. Sugar Settings → weighbridge_ip_check off skips the IP match (development only)."""
	settings = frappe.get_cached_doc("Sugar Settings")
	ip = frappe.local.request_ip if getattr(frappe.local, "request_ip", None) else None
	filters = {"is_active": 1}
	if settings.weighbridge_ip_check:
		if not ip:
			frappe.throw(_("Weighbridge readings must come from a registered terminal"), frappe.PermissionError)
		filters["ip_address"] = ip
	terminal = frappe.db.get_value("Weighbridge Terminal", filters,
		["name", "allowed_operations", "api_user"], as_dict=True)
	if not terminal:
		frappe.throw(_("This PC ({0}) is not a registered weighbridge terminal").format(ip or "?"), frappe.PermissionError)
	if terminal.api_user and frappe.session.user not in (terminal.api_user, "Administrator"):
		frappe.throw(_("Terminal {0} only accepts readings from its agent user").format(terminal.name), frappe.PermissionError)
	if operation and terminal.allowed_operations not in ("All", operation) and not (
		terminal.allowed_operations == "Gross and Tare" and operation in ("Gross", "Tare")):
		frappe.throw(_("Terminal {0} is not allowed to record {1} weights").format(terminal.name, operation), frappe.PermissionError)
	return terminal
