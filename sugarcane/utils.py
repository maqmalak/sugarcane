import frappe
from frappe import _

from sugarcane.calc.identity import FormatError, normalize_cnic, normalize_code


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


def clean_code(value, length, label):
	try:
		return normalize_code(value, length, label)
	except FormatError as e:
		frappe.throw(_(str(e)))
