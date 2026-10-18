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
	ensure_purchase_rate_precision()
	ensure_season_production_defaults()
	from sugarcane.setup.lab_setup import ensure as ensure_lab_masters

	ensure_lab_masters()
	ensure_sms_keywords()
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
	"elp_overdue_grace_min": 60, "elp_gate_buffer_m": 500, "elp_not_arrived_hours": 48,
	"tpt_requires_elp": 1, "weight_fresh_seconds": 10, "min_weight_kg": 200, "max_yard_hours": 12,
	"ccs_recovery_factor": 0.95, "mill_capacity_tcd": 12000.0, "recover_loans_at_cpr": 1, "payable_days": 15,
	"unloading_rate": 1.5, "idle_rate_per_hour": 1500.0, "idle_min_minutes": 30, "idle_categories": "Mechanical\nElectrical\nProcess\nPower\nNo Cane",
	"sms_enabled": 1, "sms_gateway": "Mock", "sms_sender": "MICROMAX", "sms_language": "English", "sms_quiet_from": 22, "sms_quiet_to": 7,
	"sms_daily_cap": 10}


def ensure_elp_defaults():
	"""ELP and gate settings get their defaults on sites created before they existed. Only a field never stored is set,
	so a check box someone turned off stays off."""
	stored = set(frappe.db.sql_list("select field from tabSingles where doctype = 'Sugar Settings'"))
	for field, value in ELP_DEFAULTS.items():
		if field not in stored or (not isinstance(value, int) and not frappe.db.get_single_value("Sugar Settings", field)):
			frappe.db.set_single_value("Sugar Settings", field, value)


def ensure_season_production_defaults():
	"""Expected by-products for seasons made before the fields existed (0 would leave the bag BOM without by-products)."""
	for field, value in (("expected_molasses_pct", 4.5), ("expected_bagasse_pct", 30), ("expected_mud_pct", 3.5)):
		frappe.db.sql(f"update `tabCrushing Season` set {field} = %s where ifnull({field}, 0) = 0", value)


def ensure_purchase_rate_precision():
	"""The Daily Cane Purchase invoice has one line: the day's payable kg at (Σ govt value ÷ kg). With the default 2-decimal
	rate the line amount would miss Σ govt value by rupees, and the clearing account would not come back to 0. A 9-decimal
	rate keeps qty × rate within half a paisa of the total for any day's intake."""
	for field in ("rate", "net_rate", "base_rate", "base_net_rate", "price_list_rate", "base_price_list_rate"):
		if frappe.db.get_value("Property Setter", {"doc_type": "Purchase Invoice Item", "field_name": field,
				"property": "precision"}, "value") == "9":
			continue
		frappe.make_property_setter({"doctype": "Purchase Invoice Item", "fieldname": field, "property": "precision",
			"value": "9", "property_type": "Select"}, validate_fields_for_doctype=False)


def ensure_party_type():
	"""Grower as an ERPNext Party Type (also a fixture). Payable, so Journal / Payment Entries treat a grower like a
	supplier: party ledgers, Payment Ledger Entries and outstanding all work."""
	if not frappe.db.exists("Party Type", "Grower"):
		frappe.get_doc({"doctype": "Party Type", "party_type": "Grower", "account_type": "Payable"}).insert(
			ignore_permissions=True)


SMS_KEYWORDS = (("BAL", "Balance", "Unpaid CPR amount and loan outstanding"), ("CPR", "Last CPR", "The last CPR: day, maund, amount, paid or not"),
	("IND", "Indent", "Open indents with their validity"), ("LOAN", "Loan", "Outstanding of each open loan"),
	("PAY", "Payment", "The last payment made to the grower"), ("HELP", "Help", "The list of keywords"))


def ensure_sms_keywords():
	for kw, action, desc in SMS_KEYWORDS:
		if not frappe.db.exists("SMS Keyword", kw):
			frappe.get_doc({"doctype": "SMS Keyword", "keyword": kw, "action": action, "description": desc, "is_active": 1}).insert(
				ignore_permissions=True)
