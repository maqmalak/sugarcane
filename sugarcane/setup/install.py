import frappe

from sugarcane.setup.roles import ensure_roles


def before_install():
	ensure_roles()


def after_install():
	after_migrate()


def after_migrate():
	ensure_roles()
	ensure_party_type()
	ensure_journey_defaults()
	ensure_elp_defaults()
	company = frappe.db.get_single_value("Sugar Settings", "company")
	if company and frappe.db.exists("Company", company):
		from sugarcane.setup.accounts import setup_company

		setup_company(company)


def ensure_journey_defaults():
	"""Journey standards get their defaults on sites created before they existed. A road factor of 0 is never valid,
	so it means the standards were never set (a settings save stores 0 for fields it does not know yet)."""
	from sugarcane.journey import DEFAULTS

	if not frappe.db.get_single_value("Sugar Settings", "road_factor"):
		for field, value in DEFAULTS.items():
			frappe.db.set_single_value("Sugar Settings", field, value)


ELP_DEFAULTS = {"elp_min_sharpness": 60, "elp_min_brightness": 40, "elp_max_brightness": 225, "elp_min_contrast": 20,
	"elp_required_views": "Number Plate\nIndent\nDriver\nBody Left", "elp_geofence_buffer_m": 30, "elp_require_indent": 1,
	"elp_overdue_grace_min": 60, "elp_gate_buffer_m": 500, "elp_not_arrived_hours": 48}


def ensure_elp_defaults():
	"""ELP settings get their defaults on sites created before they existed (an existing value is kept)."""
	for field, value in ELP_DEFAULTS.items():
		if not frappe.db.get_single_value("Sugar Settings", field):
			frappe.db.set_single_value("Sugar Settings", field, value)


def ensure_party_type():
	"""Grower as an ERPNext Party Type (also a fixture). Payable, so Journal / Payment Entries treat a grower like a
	supplier: party ledgers, Payment Ledger Entries and outstanding all work."""
	if not frappe.db.exists("Party Type", "Grower"):
		frappe.get_doc({"doctype": "Party Type", "party_type": "Grower", "account_type": "Payable"}).insert(
			ignore_permissions=True)
