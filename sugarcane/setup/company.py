"""Company for a new site: MicroMax Sugar Mills Ltd. (Pakistan, PKR, Asia/Karachi, fiscal year July–June)."""

import frappe
from frappe.utils import add_days, add_months, getdate, nowdate

COMPANY = "MicroMax Sugar Mills Ltd."
ABBR = "MSML"


def ensure_company(company=COMPANY, abbr=ABBR):
	if not frappe.db.exists("Company", company):
		if frappe.db.get_single_value("System Settings", "setup_complete"):
			frappe.get_doc({"doctype": "Company", "company_name": company, "abbr": abbr, "country": "Pakistan",
				"default_currency": "PKR", "chart_of_accounts": "Standard"}).insert(ignore_permissions=True)
		else:
			from frappe.desk.page.setup_wizard.setup_wizard import setup_complete

			today = getdate(nowdate())
			fy_start = f"{today.year if today.month >= 7 else today.year - 1}-07-01"
			setup_complete({
				"language": "English", "country": "Pakistan", "timezone": "Asia/Karachi", "currency": "PKR",
				"company_name": company, "company_abbr": abbr, "chart_of_accounts": "Standard",
				"company_tagline": "Sugar, molasses and bagasse",
				"fy_start_date": fy_start, "fy_end_date": str(add_days(add_months(fy_start, 12), -1)),
				"full_name": "Administrator", "email": "admin@micromaxsugar.example", "password": None, "setup_demo": 0,
			})
		frappe.db.commit()
	settings = frappe.get_single("Sugar Settings")
	if not settings.company:
		settings.company = company
		settings.flags.ignore_permissions = True
		settings.save()
	from sugarcane.setup.accounts import setup_company

	setup_company(company)
	_payment_modes()
	frappe.db.commit()
	return company


def _payment_modes():
	for mode, kind in (("Cash", "Cash"), ("Bank Transfer", "Bank"), ("Cheque", "Bank")):
		if not frappe.db.exists("Mode of Payment", mode):
			frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": mode, "type": kind, "enabled": 1}).insert(
				ignore_permissions=True)
