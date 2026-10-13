import frappe

from sugarcane.setup.roles import ensure_roles


def before_install():
	ensure_roles()


def after_install():
	after_migrate()


def after_migrate():
	ensure_roles()
	ensure_party_type()
	company = frappe.db.get_single_value("Sugar Settings", "company")
	if company and frappe.db.exists("Company", company):
		from sugarcane.setup.accounts import setup_company

		setup_company(company)


def ensure_party_type():
	"""Grower as an ERPNext Party Type (also a fixture). Payable, so Journal / Payment Entries treat a grower like a
	supplier: party ledgers, Payment Ledger Entries and outstanding all work."""
	if not frappe.db.exists("Party Type", "Grower"):
		frappe.get_doc({"doctype": "Party Type", "party_type": "Grower", "account_type": "Payable"}).insert(
			ignore_permissions=True)
