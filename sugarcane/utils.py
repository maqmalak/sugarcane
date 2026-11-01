import frappe
from frappe import _

from sugarcane.calc.identity import FormatError, normalize_cnic, normalize_code, normalize_mobile


def check_app_permission():
	"""Show the Sugar Mills tile on the Apps screen to desk users who can read growers."""
	if frappe.session.user == "Administrator":
		return True
	if frappe.get_cached_value("User", frappe.session.user, "user_type") == "Website User":
		return False
	return bool(frappe.has_permission("Grower", ptype="read"))


def settings():
	return frappe.get_cached_doc("Sugar Settings")


def clean_cnic(value, label="CNIC", required=True):
	"""Normalised CNIC or a ValidationError the user can read."""
	if not value:
		if required:
			frappe.throw(_("{0} is required").format(label))
		return None
	try:
		return normalize_cnic(value)
	except FormatError:
		frappe.throw(_("{0} {1} is not valid. Use the format #####-#######-# (13 digits).").format(label, frappe.bold(value)))


def clean_mobile(value, label="Mobile"):
	"""Normalised Pakistani mobile (03XXXXXXXXX) or a ValidationError the user can read; blank stays blank."""
	try:
		return normalize_mobile(value)
	except FormatError:
		frappe.throw(_("{0} {1} is not valid. Use 11 digits starting 03, e.g. 03007212058.").format(label, frappe.bold(value)))


def clean_code(value, length, label):
	try:
		return normalize_code(value, length, label)
	except FormatError as e:
		frappe.throw(_(str(e)))
