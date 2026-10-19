"""Phase 7 — the standard ERPNext / HRMS modules configured for a sugar mill (configure, don't rebuild).

`configure(company)` is idempotent: run on every migrate. It never changes a record someone already edited, except the
5-level chart-of-accounts step, which moves the sugar ledgers under their control groups (the money stays where it is).

Sections: chart of accounts · cost centres · item groups, UOMs, warehouses, stock entry types · purchase (naming, QI
templates) · taxes (GST, withholding) · banks and cheque templates · voucher series · sales (groups, territories,
agents, rate list) · fixed assets · HR (departments, shifts, leaves, salary components, tax slabs, gratuity).
"""
import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.utils import add_days, cint, flt, getdate

YEAR_START = "2026-07-01"  # Pakistani fiscal year (Jul–Jun)


def ensure(doctype, name, values, key=None):
	"""Create a record unless it exists (by name, or by `key` filters). Returns the name."""
	existing = frappe.db.get_value(doctype, key, "name") if key else (name if name and frappe.db.exists(doctype, name) else None)
	if existing:
		return existing
	doc = frappe.get_doc({"doctype": doctype, **values})
	doc.flags.ignore_permissions = True
	doc.flags.ignore_mandatory = values.pop("_ignore_mandatory", False) if "_ignore_mandatory" in values else False
	doc.insert()
	return doc.name


def configure(company: str | None = None) -> dict:
	company = company or frappe.db.get_single_value("Sugar Settings", "company")
	if not company or not frappe.db.exists("Company", company):
		return {}
	abbr = frappe.get_cached_value("Company", company, "abbr")
	out = {}
	for step in (custom_fields, chart_of_accounts, cost_centres, stock_setup, purchase_setup, taxes, banks, sales_setup,
			fixed_assets, hr_setup, production_costing):
		out[step.__name__] = step(company, abbr)
	return out


# ---------------------------------------------------------------- custom fields on standard doctypes
CUSTOM_FIELDS = {
	"Purchase Invoice": [
		{"fieldname": "invoice_category", "label": "Invoice Category", "fieldtype": "Select", "options": "Local\nSite\nImport\nService",
			"default": "Local", "insert_after": "supplier", "in_standard_filter": 1, "in_list_view": 1,
			"description": "Local purchase, site (mill site works), import, or a service bill"},
	],
	"Delivery Note": [
		{"fieldname": "sugar_dispatch_section", "label": "Mill Dispatch", "fieldtype": "Section Break", "insert_after": "items", "collapsible": 1},
		{"fieldname": "delivery_order_no", "label": "Delivery Order No.", "fieldtype": "Data", "insert_after": "sugar_dispatch_section",
			"description": "The DO issued to the buyer / agent; lifting is against it"},
		{"fieldname": "dispatch_vehicle_no", "label": "Vehicle No.", "fieldtype": "Data", "insert_after": "delivery_order_no"},
		{"fieldname": "dispatch_cb", "fieldtype": "Column Break", "insert_after": "dispatch_vehicle_no"},
		{"fieldname": "sales_weighment", "label": "Sales Weighment", "fieldtype": "Link", "options": "Sales Weighment", "read_only": 1,
			"insert_after": "dispatch_cb"},
		{"fieldname": "gate_pass", "label": "Gate Pass", "fieldtype": "Link", "options": "Gate Pass", "read_only": 1, "insert_after": "sales_weighment"},
	],
	"Employee": [
		{"fieldname": "pk_ids_section", "label": "Pakistan IDs", "fieldtype": "Section Break", "insert_after": "attendance_device_id", "collapsible": 1},
		{"fieldname": "employee_cnic", "label": "CNIC", "fieldtype": "Data", "insert_after": "pk_ids_section"},
		{"fieldname": "eobi_no", "label": "EOBI No.", "fieldtype": "Data", "insert_after": "employee_cnic"},
		{"fieldname": "pk_ids_cb", "fieldtype": "Column Break", "insert_after": "eobi_no"},
		{"fieldname": "social_security_no", "label": "Social Security (PESSI) No.", "fieldtype": "Data", "insert_after": "pk_ids_cb"},
		{"fieldname": "is_seasonal", "label": "Seasonal (crushing season only)", "fieldtype": "Check", "insert_after": "social_security_no"},
	],
	"Journal Entry": [
		{"fieldname": "voucher_code", "label": "Voucher", "fieldtype": "Select", "options": "\nJV\nBPV\nBRV\nCPV\nCRV", "read_only": 1,
			"insert_after": "voucher_type", "in_list_view": 1, "in_standard_filter": 1,
			"description": "Bank / cash payment or receipt voucher, set from the accounts when the voucher is saved"},
	],
}


def custom_fields(company, abbr):
	create_custom_fields(CUSTOM_FIELDS, update=True)
	return sum(len(v) for v in CUSTOM_FIELDS.values())


# ---------------------------------------------------------------- 5-level chart of accounts
def _acc(company, abbr, name, parent, is_group=0, account_type="", root_type=None):
	full = f"{name} - {abbr}"
	if frappe.db.exists("Account", full):
		return full
	if not parent or not frappe.db.exists("Account", parent):
		return None
	doc = frappe.get_doc({"doctype": "Account", "account_name": name, "company": company, "parent_account": parent,
		"is_group": is_group, "account_type": account_type})
	doc.flags.ignore_permissions = True
	doc.insert()
	return doc.name


def _move(account, parent):
	"""Re-parent a ledger under its control group (allowed with entries: same company and root type)."""
	if account and parent and frappe.db.exists("Account", account) and frappe.db.get_value("Account", account, "parent_account") != parent:
		doc = frappe.get_doc("Account", account)
		doc.parent_account = parent
		doc.flags.ignore_permissions = True
		doc.save()
		return True
	return False


COA = {  # level-3 parent (standard) -> level-4 control group -> level-5 ledgers [(name, account_type)]
	"Accounts Payable": {
		"Cane Growers": [("Grower Payable", None), ("Cane Purchase Clearing", None)],
		"Trade Creditors": [("Creditors", None), ("Creditors - Import", "Payable"), ("Creditors - Services", "Payable")],
	},
	"Duties and Taxes": {
		"Sales Tax": [("Output Sales Tax (GST)", "Tax"), ("Further Sales Tax", "Tax"), ("Input Sales Tax (GST)", "Tax")],
		"Income Tax Withheld": [("WHT Payable - 153 Goods", "Tax"), ("WHT Payable - 153 Services", "Tax"), ("WHT Payable - 149 Salaries", "Tax"),
			("WHT Payable - 236G-H Sales", "Tax")],
		"Government Levies": [("Road Cess Payable - Govt", None)],
	},
	"Current Liabilities": {
		"Payroll Liabilities": [("Payroll Payable", "Payable"), ("EOBI Payable", None), ("Social Security (PESSI) Payable", None),
			("Provident Fund Payable", None), ("Gratuity Payable", None)],
		"Statutory Funds": [("WPPF Payable", None), ("WWF Payable", None)],
		"Cane Transport": [("TPT-Bilty Payable", None)],
	},
	"Loans and Advances (Assets)": {
		"Grower Loans": [("Grower Loan Receivable", None)],
		"Staff Advances": [("Employee Advances", None)],
	},
	"Bank Accounts": {
		"Current Accounts": [("Cane Payments Bank", None)],
	},
	"Cash In Hand": {
		"Cash Counters": [("Cash", None), ("Cash Counter - Cane", None)],
	},
	"Direct Income": {
		"Sugar Sales": [("Sugar Sales - Local", "Income Account"), ("Sugar Sales - Export", "Income Account")],
		"By-product Sales": [("Molasses Sales", "Income Account"), ("Bagasse Sales", "Income Account"), ("Press Mud Sales", "Income Account")],
	},
	"Indirect Expenses": {
		"Salaries and Benefits": [("Salaries and Wages", None), ("Overtime", None), ("EOBI - Employer", None), ("Social Security - Employer", None),
			("Gratuity Expense", None), ("Bonus", None), ("Group Insurance", None)],
		"Statutory Charges": [("WPPF Expense", None), ("WWF Expense", None)],
	},
}


def chart_of_accounts(company, abbr):
	"""Standard chart is 4 levels (root > group > sub-group > ledger). The mill's is 5: a control group sits between the
	sub-group and its ledgers — Liabilities > Current Liabilities > Duties and Taxes > Sales Tax > Output Sales Tax (GST)."""
	moved = 0
	for parent_name, groups in COA.items():
		parent = frappe.db.get_value("Account", {"company": company, "account_name": parent_name, "is_group": 1}, "name")
		if not parent:
			continue
		for group, ledgers in groups.items():
			g = _acc(company, abbr, group, parent, is_group=1)
			for name, account_type in ledgers:
				existing = f"{name} - {abbr}"
				if frappe.db.exists("Account", existing):
					if not frappe.db.get_value("Account", existing, "is_group") and _move(existing, g):
						moved += 1
				else:
					_acc(company, abbr, name, g, account_type=account_type or "")
	# the cane cost ledgers already have their own group (Cane Cost of Sales) under Direct Expenses — 5 levels
	return {"moved": moved, "depth": _depth(company)}


def _depth(company):
	return cint(frappe.db.sql("""select max(d) from (select (select count(*) from tabAccount p where p.company = a.company and p.lft < a.lft
		and p.rgt > a.rgt) d from tabAccount a where a.company = %s) x""", company)[0][0]) + 1


# ---------------------------------------------------------------- cost centres
DEPARTMENTS = ("Cane", "Mill House", "Boiler House", "Power House", "Process House", "Laboratory", "Workshop", "Stores", "Sales", "Administration")


def cost_centres(company, abbr):
	root = frappe.db.get_value("Cost Center", {"company": company, "is_group": 1, "parent_cost_center": ["in", ["", None]]}, "name")
	for d in DEPARTMENTS:
		ensure("Cost Center", f"{d} - {abbr}", {"cost_center_name": d, "parent_cost_center": root, "company": company, "is_group": 0})
	for t in ("Mill Overhaul", "Plant Expansion", "Civil Works"):
		ensure("Project Type", t, {"project_type": t})
	return len(DEPARTMENTS)


# ---------------------------------------------------------------- stores
ITEM_TREE = {  # 4 levels: All Item Groups > level 2 > level 3 > level 4
	"Mill Products": {"Sugar": ["Refined Sugar", "Brown Sugar"], "By-products": ["Molasses", "Bagasse", "Press Mud"]},
	"Raw and Packing Material": {"Cane": ["Sugarcane"], "Packing": ["PP Bags", "Jute Bags", "Stitching Thread"]},
	"Stores and Spares": {
		"Mechanical": ["Bearings", "Gears and Chains", "Pumps and Valves", "Mill Rollers", "Fasteners"],
		"Electrical": ["Motors", "Cables", "Switchgear", "Lighting"],
		"Instruments": ["Gauges", "Sensors", "Lab Glassware"],
	},
	"Chemicals and Fuel": {"Process Chemicals": ["Lime", "Sulphur", "Phosphoric Acid", "Flocculant", "Biocide"], "Fuel and Lubricants": ["Diesel", "Furnace Oil", "Lubricants", "Grease"]},
	"Tools and Equipment": {"Hand Tools": ["Spanners", "Welding"], "Safety": ["PPE"]},
	"Services": {"Repair Services": ["Mechanical Repair", "Electrical Repair"], "Transport Services": ["Freight"]},
}
WAREHOUSES = ("Mechanical Store", "Electrical Store", "Chemical Store", "Fuel Store", "Tools Store", "Scrap Yard")
STOCK_ENTRY_TYPES = {"Store Issue": "Material Issue", "Store Return": "Material Receipt", "Store Transfer": "Material Transfer",
	"Tools Issue": "Material Transfer", "Tools Return": "Material Transfer", "Job Issue (BOM)": "Material Transfer for Manufacture",
	"Opening Stock": "Material Receipt", "Consumption Voucher": "Material Consumption for Manufacture"}
ITEM_REGROUP = {"SUGAR-50KG": "Refined Sugar", "MOLASSES": "Molasses", "BAGASSE": "Bagasse", "PRESS-MUD": "Press Mud",
	"SUGARCANE": "Sugarcane", "PACKING-BAG": "PP Bags"}


def stock_setup(company, abbr):
	for uom in ("Ton", "Maund", "Drum", "Roll", "Kg", "Litre", "Nos", "Bag"):
		ensure("UOM", uom, {"uom_name": uom})
	n = 0
	for l2, subs in ITEM_TREE.items():
		ensure("Item Group", l2, {"item_group_name": l2, "parent_item_group": "All Item Groups", "is_group": 1})
		for l3, leaves in subs.items():
			ensure("Item Group", l3, {"item_group_name": l3, "parent_item_group": l2, "is_group": 1})
			for l4 in leaves:
				ensure("Item Group", l4, {"item_group_name": l4, "parent_item_group": l3, "is_group": 0})
				n += 1
	for item, group in ITEM_REGROUP.items():
		if frappe.db.exists("Item", item) and frappe.db.get_value("Item", item, "item_group") in ("Products", "Raw Material", "Consumable"):
			frappe.db.set_value("Item", item, "item_group", group)
	parent = frappe.db.get_value("Warehouse", {"company": company, "is_group": 1, "parent_warehouse": ["in", ["", None]]}, "name")
	for w in WAREHOUSES:
		ensure("Warehouse", f"{w} - {abbr}", {"warehouse_name": w, "parent_warehouse": parent, "company": company})
	for name, purpose in STOCK_ENTRY_TYPES.items():
		ensure("Stock Entry Type", name, {"name": name, "purpose": purpose})
	return {"item_groups": n, "warehouses": len(WAREHOUSES), "entry_types": len(STOCK_ENTRY_TYPES)}


# ---------------------------------------------------------------- purchase
QI_TEMPLATES = {
	"Quick Lime": [("CaO %", 1, 85, 100), ("Moisture %", 1, 0, 2), ("Grit %", 1, 0, 5)],
	"Sulphur": [("Purity %", 1, 99.5, 100), ("Ash %", 1, 0, 0.1), ("Moisture %", 1, 0, 0.5)],
	"PP Bags 50 kg": [("Weight g", 1, 95, 110), ("Width cm", 1, 60, 62), ("Length cm", 1, 92, 95), ("Print quality", 0, None, None)],
	"Diesel": [("Density kg/l", 1, 0.82, 0.86), ("Flash point C", 1, 55, 100)],
}
SERIES = {  # doctype -> naming series options (first = default)
	"Material Request": ["PD-.YY.-.#####"],  # Purchase Demand
	"Request for Quotation": ["INQ-.YY.-.#####"],  # Inquiry
	"Supplier Quotation": ["SQ-.YY.-.#####"],
	"Purchase Order": ["PO-.YY.-.#####", "IPO-.YY.-.#####"],  # local, import
	"Purchase Receipt": ["GRN-.YY.-.#####"],
	"Purchase Invoice": ["PI-.YY.-.#####", "IPI-.YY.-.#####", "SPI-.YY.-.#####"],
	"Sales Order": ["SC-.YY.-.#####"],  # sales contract
	"Delivery Note": ["DO-.YY.-.#####"],
	"Sales Invoice": ["SI-.YY.-.#####", "EXP-.YY.-.#####"],
	"Payment Entry": ["PAY-.YY.-.#####", "REC-.YY.-.#####"],
	"Journal Entry": ["JV-.YY.-.#####", "BPV-.YY.-.#####", "BRV-.YY.-.#####", "CPV-.YY.-.#####", "CRV-.YY.-.#####", "ACC-JV-.YYYY.-"],
}


def _series(doctype, options):
	current = (frappe.get_meta(doctype).get_field("naming_series").options or "").split("\n")
	merged = options + [o for o in current if o and o not in options]
	make_property_setter(doctype, "naming_series", "options", "\n".join(merged), "Text", validate_fields_for_doctype=False)
	make_property_setter(doctype, "naming_series", "default", options[0], "Text", validate_fields_for_doctype=False)


def purchase_setup(company, abbr):
	for dt, opts in SERIES.items():
		_series(dt, opts)
	for name, params in QI_TEMPLATES.items():
		for p in params:
			ensure("Quality Inspection Parameter", p[0], {"parameter": p[0]})
		ensure("Quality Inspection Template", name, {"quality_inspection_template_name": name, "item_quality_inspection_parameter": [
			{"specification": p[0], "numeric": p[1], "min_value": p[2], "max_value": p[3]} for p in params]})
	for g in ("Mill Stores Vendor", "Chemical Supplier", "Import Supplier", "Service Contractor"):
		ensure("Supplier Group", g, {"supplier_group_name": g, "parent_supplier_group": "All Supplier Groups"})
	return {"series": len(SERIES), "qi_templates": len(QI_TEMPLATES)}


# ---------------------------------------------------------------- taxes (rates: confirm with the mill's tax adviser)
WHT = [  # (category, basis, rate filer, account, threshold)
	("153(1)(a) Supply of Goods - Company", "Net Total", 5.0, "WHT Payable - 153 Goods", 75000),
	("153(1)(a) Supply of Goods - Non-company", "Net Total", 5.5, "WHT Payable - 153 Goods", 75000),
	("153(1)(b) Services - Company", "Net Total", 9.0, "WHT Payable - 153 Services", 30000),
	("153(1)(b) Services - Non-company", "Net Total", 11.0, "WHT Payable - 153 Services", 30000),
	("153(1)(c) Contracts - Company", "Net Total", 7.5, "WHT Payable - 153 Services", 30000),
]


def taxes(company, abbr):
	acc = lambda n: f"{n} - {abbr}" if frappe.db.exists("Account", f"{n} - {abbr}") else None  # noqa: E731
	out_gst, further, in_gst = acc("Output Sales Tax (GST)"), acc("Further Sales Tax"), acc("Input Sales Tax (GST)")
	if out_gst:
		ensure("Sales Taxes and Charges Template", f"Pakistan GST 18% - {abbr}", {"title": "Pakistan GST 18%", "company": company,
			"is_default": 1, "taxes": [{"charge_type": "On Net Total", "account_head": out_gst, "rate": 18, "description": "Sales Tax 18%"}]})
		if further:
			ensure("Sales Taxes and Charges Template", f"GST 18% + Further Tax 4% - {abbr}", {"title": "GST 18% + Further Tax 4%",
				"company": company, "taxes": [
					{"charge_type": "On Net Total", "account_head": out_gst, "rate": 18, "description": "Sales Tax 18%"},
					{"charge_type": "On Net Total", "account_head": further, "rate": 4, "description": "Further Tax 4% (unregistered buyer)"}]})
		ensure("Sales Taxes and Charges Template", f"Export - Zero Rated - {abbr}", {"title": "Export - Zero Rated", "company": company,
			"taxes": [{"charge_type": "On Net Total", "account_head": out_gst, "rate": 0, "description": "Zero-rated export"}]})
	if in_gst:
		ensure("Purchase Taxes and Charges Template", f"Input GST 18% - {abbr}", {"title": "Input GST 18%", "company": company,
			"taxes": [{"charge_type": "On Net Total", "account_head": in_gst, "rate": 18, "description": "Input Sales Tax 18%",
				"category": "Total", "add_deduct_tax": "Add"}]})
	n = 0
	for name, basis, rate, account, threshold in WHT:
		if not acc(account):
			continue
		ensure("Tax Withholding Category", name, {"name": name, "category_name": name, "tax_deduction_basis": basis,
			"rates": [{"from_date": YEAR_START, "to_date": "2027-06-30", "tax_withholding_rate": rate, "single_threshold": threshold}],
			"accounts": [{"company": company, "account": acc(account)}]})
		n += 1
	return {"withholding": n}


# ---------------------------------------------------------------- banks and cheques
# positions (cm from the top / left edge) of a standard Pakistani personal / corporate cheque leaf; fine-tune per bank after a test print
CHEQUE = {"cheque_size": "Regular", "starting_position_from_top_edge": 0, "cheque_width": 20.3, "cheque_height": 8.9,
	"date_dist_from_top_edge": 1.1, "date_dist_from_left_edge": 15.6, "payer_name_from_top_edge": 2.4, "payer_name_from_left_edge": 2.3,
	"amt_in_words_from_top_edge": 3.3, "amt_in_words_from_left_edge": 3.0, "amt_in_word_width": 12.5, "amt_in_words_line_spacing": 0.7,
	"amt_in_figures_from_top_edge": 3.6, "amt_in_figures_from_left_edge": 16.3, "acc_no_dist_from_top_edge": 5.0,
	"acc_no_dist_from_left_edge": 2.3, "signatory_from_top_edge": 6.3, "signatory_from_left_edge": 14.5, "is_account_payable": 1,
	"acc_pay_dist_from_top_edge": 0.6, "acc_pay_dist_from_left_edge": 1.0, "message_to_show": "A/C Payee Only"}
BANKS = ("HBL", "MCB Bank", "UBL", "Allied Bank", "National Bank of Pakistan", "Meezan Bank", "Bank Alfalah")


def banks(company, abbr):
	for b in BANKS:
		ensure("Bank", b, {"bank_name": b})
		ensure("Cheque Print Template", b, {"bank_name": b, **CHEQUE})
	return len(BANKS)


# ---------------------------------------------------------------- sales
REGIONS = {"Punjab": ["Lahore Region", "Faisalabad Region", "Multan Region", "Sargodha Region"], "Sindh": ["Karachi Region", "Hyderabad Region"],
	"Khyber Pakhtunkhwa": ["Peshawar Region"], "Export": ["Afghanistan", "Middle East", "Central Asia"]}
CUSTOMER_GROUPS = ("Sugar Dealer", "Industrial Buyer", "Commission Agent Account", "Exporter", "Government (TCP / USC)", "By-product Buyer")


def sales_setup(company, abbr):
	for g in CUSTOMER_GROUPS:
		ensure("Customer Group", g, {"customer_group_name": g, "parent_customer_group": "All Customer Groups"})
	for parent, regions in REGIONS.items():
		ensure("Territory", parent, {"territory_name": parent, "parent_territory": "Pakistan" if parent != "Export" else "Rest Of The World", "is_group": 1})
		for r in regions:
			ensure("Territory", r, {"territory_name": r, "parent_territory": parent, "is_group": 0})
	for t in ("Commission Agent", "Broker"):
		ensure("Sales Partner Type", t, {"sales_partner_type": t})
	ensure("Price List", "Sugar Rate List", {"price_list_name": "Sugar Rate List", "currency": "PKR", "selling": 1, "enabled": 1})
	for item, rate in (("SUGAR-50KG", 7250), ("MOLASSES", 38), ("BAGASSE", 9), ("PRESS-MUD", 2)):
		if frappe.db.exists("Item", item):
			ensure("Item Price", None, {"item_code": item, "price_list": "Sugar Rate List", "price_list_rate": rate},
				key={"item_code": item, "price_list": "Sugar Rate List"})
			frappe.db.set_value("Item", item, "is_sales_item", 1)
	return {"territories": sum(len(r) for r in REGIONS.values())}


# ---------------------------------------------------------------- fixed assets (two books: accounting and tax — Third Schedule rates)
ASSET_CATEGORIES = [  # (name, accounting WDV %, tax WDV %, fixed asset account)
	("Plant and Machinery", 10, 15, "Plants and Machineries"),
	("Buildings", 5, 10, "Buildings"),
	("Vehicles", 20, 15, "Office Equipment"),
	("Computers", 30, 30, "Electronic Equipment"),
	("Furniture and Fixtures", 10, 15, "Furniture and Fixtures"),
]


def fixed_assets(company, abbr):
	ensure("Finance Book", "Tax", {"finance_book_name": "Tax"})
	ensure("Finance Book", "Accounting", {"finance_book_name": "Accounting"})
	fa_parent = frappe.db.get_value("Account", {"company": company, "account_name": "Fixed Assets", "is_group": 1}, "name")
	acc_dep = frappe.db.get_value("Account", {"company": company, "account_type": "Accumulated Depreciation", "is_group": 0}, "name")
	dep = frappe.db.get_value("Account", {"company": company, "account_type": "Depreciation", "is_group": 0}, "name")
	n = 0
	for name, book_rate, tax_rate, account_name in ASSET_CATEGORIES:
		fa = frappe.db.get_value("Account", {"company": company, "account_name": account_name, "is_group": 0}, "name") or (
			_acc(company, abbr, account_name, fa_parent, account_type="Fixed Asset") if fa_parent else None)
		if not (fa and acc_dep and dep):
			continue
		if frappe.db.get_value("Account", fa, "account_type") != "Fixed Asset":
			frappe.db.set_value("Account", fa, "account_type", "Fixed Asset")
		ensure("Asset Category", name, {"asset_category_name": name,
			"finance_books": [
				{"finance_book": "Accounting", "depreciation_method": "Written Down Value", "frequency_of_depreciation": 12,
					"total_number_of_depreciations": 10, "rate_of_depreciation": book_rate},
				{"finance_book": "Tax", "depreciation_method": "Written Down Value", "frequency_of_depreciation": 12,
					"total_number_of_depreciations": 10, "rate_of_depreciation": tax_rate}],
			"accounts": [{"company_name": company, "fixed_asset_account": fa, "accumulated_depreciation_account": acc_dep,
				"depreciation_expense_account": dep}]})
		n += 1
	return n


# ---------------------------------------------------------------- HR (Factories Act 1934, Punjab; EOBI Act; Finance Act 2025)
SHIFTS = [("Shift A", "06:00:00", "14:00:00"), ("Shift B", "14:00:00", "22:00:00"), ("Shift C", "22:00:00", "06:00:00"),
	("General", "09:00:00", "17:00:00")]
LEAVES = [  # (name, days a year, extra)
	("Casual Leave", 10, {}), ("Sick Leave", 8, {}), ("Annual Leave", 14, {"allow_encashment": 1, "is_carry_forward": 1, "maximum_carry_forwarded_leaves": 28}),
	("Compensatory Leave (CPL)", 0, {"is_compensatory": 1}), ("Leave Without Pay", 0, {"is_lwp": 1}),
]
COMPONENTS = [  # (name, abbr, type, extras)
	("Basic Salary", "BS", "Earning", {"depends_on_payment_days": 1, "is_tax_applicable": 1}),
	("House Rent Allowance", "HRA", "Earning", {"depends_on_payment_days": 1, "is_tax_applicable": 1}),
	("Medical Allowance", "MA", "Earning", {"depends_on_payment_days": 1, "is_tax_applicable": 0}),  # exempt up to 10% of basic
	("Conveyance Allowance", "CA", "Earning", {"depends_on_payment_days": 1, "is_tax_applicable": 1}),
	("Seasonal Allowance", "SEA", "Earning", {"is_tax_applicable": 1}),
	("Overtime Pay", "OT", "Earning", {"is_tax_applicable": 1, "depends_on_payment_days": 0}),
	("Production Bonus", "PB", "Earning", {"is_tax_applicable": 1, "depends_on_payment_days": 0}),
	("EOBI - Employee", "EOBI", "Deduction", {"depends_on_payment_days": 0}),
	("Provident Fund - Employee", "PF", "Deduction", {"depends_on_payment_days": 0}),
	("Group Insurance", "GI", "Deduction", {"depends_on_payment_days": 0}),
	("Late Coming Penalty", "LCP", "Deduction", {"depends_on_payment_days": 0}),
	("Income Tax", "IT", "Deduction", {"variable_based_on_taxable_salary": 1, "is_income_tax_component": 1, "depends_on_payment_days": 0}),
	("EOBI - Employer", "EOBIE", "Earning", {"statistical_component": 1}),
	("Social Security - Employer", "PESSI", "Earning", {"statistical_component": 1}),
]
# Finance Act 2025 (tax year 2026) salaried individuals: annual taxable income → tax
TAX_SLABS = [(0, 600000, 0, None), (600000, 1200000, 1, None), (1200000, 2200000, 11, None), (2200000, 3200000, 23, None),
	(3200000, 4100000, 30, None), (4100000, 0, 35, None)]
MIN_WAGE = 40000  # Punjab minimum wage 2025-26, the EOBI basis


def hr_setup(company, abbr):
	if not frappe.db.exists("DocType", "Salary Component"):
		return "hrms not installed"
	for d in ("Cane", "Mill House", "Boiler House", "Power House", "Process House", "Laboratory", "Workshop", "Stores", "Security", "Accounts",
			"Administration", "Sales"):
		ensure("Department", f"{d} - {abbr}", {"department_name": d, "company": company, "parent_department": "All Departments"})
	for d in ("General Manager", "Cane Manager", "Chief Engineer", "Chief Chemist", "Shift Engineer", "Shift Chemist", "Fitter",
			"Electrician", "Boiler Operator", "Mill Operator", "Pan Man", "Lab Assistant", "Store Keeper", "Weighbridge Operator", "Clerk",
			"Accountant", "Security Guard", "Helper", "Driver"):
		ensure("Designation", d, {"designation_name": d})
	ensure("Employment Type", "Seasonal", {"employee_type_name": "Seasonal"})
	hl = "Mill Holidays 2026-27"
	if not frappe.db.exists("Holiday List", hl):
		holidays = [("2026-08-14", "Independence Day"), ("2026-09-05", "Eid Milad-un-Nabi (approx.)"), ("2026-11-09", "Iqbal Day"),
			("2026-12-25", "Quaid-e-Azam Day"), ("2027-02-05", "Kashmir Day"), ("2027-03-10", "Eid-ul-Fitr (approx.)"),
			("2027-03-23", "Pakistan Day"), ("2027-05-01", "Labour Day"), ("2027-05-17", "Eid-ul-Adha (approx.)")]
		ensure("Holiday List", hl, {"holiday_list_name": hl, "from_date": YEAR_START, "to_date": "2027-06-30",
			"holidays": [{"holiday_date": d, "description": t} for d, t in holidays]})
	frappe.db.set_value("Company", company, "default_holiday_list", frappe.db.get_value("Company", company, "default_holiday_list") or hl)
	if frappe.db.exists("DocType", "Holiday List Assignment") and not frappe.db.exists("Holiday List Assignment",
			{"applicable_for": "Company", "assigned_to": company, "docstatus": 1}):
		doc = frappe.get_doc({"doctype": "Holiday List Assignment", "applicable_for": "Company", "assigned_to": company, "holiday_list": hl,
			"from_date": YEAR_START})
		doc.flags.ignore_permissions = True
		doc.insert()
		doc.submit()
	for name, start, end in SHIFTS:
		ensure("Shift Type", name, {"name": name, "start_time": start, "end_time": end, "holiday_list": hl, "enable_auto_attendance": 1,
			"enable_late_entry_marking": 1, "late_entry_grace_period": 10, "enable_early_exit_marking": 1, "early_exit_grace_period": 10,
			"determine_check_in_and_check_out": "Alternating entries as IN and OUT during the same shift",
			"working_hours_calculation_based_on": "First Check-in and Last Check-out", "begin_check_in_before_shift_start_time": 60,
			"allow_check_out_after_shift_end_time": 120, "working_hours_threshold_for_half_day": 4, "working_hours_threshold_for_absent": 2,
			"process_attendance_after": "2026-07-01"})
	for name, days, extra in LEAVES:
		ensure("Leave Type", name, {"leave_type_name": name, "max_leaves_allowed": days, **extra})
	for name, ab, typ, extra in COMPONENTS:
		ensure("Salary Component", name, {"salary_component": name, "salary_component_abbr": ab, "type": typ, **extra})
	# the standard Income Tax component exists before this setup: it must be the one worked out from the tax slab
	frappe.db.set_value("Salary Component", "Income Tax", {"variable_based_on_taxable_salary": 1, "is_income_tax_component": 1,
		"depends_on_payment_days": 0})
	try:
		from hrms.payroll.doctype.salary_slip.salary_slip import TAX_COMPONENTS_BY_COMPANY

		frappe.cache().delete_value(TAX_COMPONENTS_BY_COMPANY)  # HRMS caches which components are income tax
	except ImportError:
		pass
	if frappe.db.exists("DocType", "Payroll Period") and not frappe.db.exists("Payroll Period", {"company": company, "start_date": YEAR_START}):
		doc = frappe.get_doc({"doctype": "Payroll Period", "name": "2026-27", "company": company, "start_date": YEAR_START, "end_date": "2027-06-30"})
		doc.flags.ignore_permissions = True
		doc.insert(set_name=f"Tax Year 2026-27 - {abbr}")
	slab = "Pakistan Salaried TY2026"
	if not frappe.db.exists("Income Tax Slab", slab):
		doc = frappe.get_doc({"doctype": "Income Tax Slab", "name": slab, "__newname": slab, "effective_from": YEAR_START, "company": company,
			"currency": "PKR", "standard_tax_exemption_amount": 0, "allow_tax_exemption": 0,
			"slabs": [{"from_amount": a, "to_amount": b, "percent_deduction": p} for a, b, p, _c in TAX_SLABS]})
		doc.flags.ignore_permissions = True
		doc.insert(set_name=slab)
		doc.submit()
	structure = "Mill Staff - Monthly"
	if not frappe.db.exists("Salary Structure", structure):
		doc = frappe.get_doc({"doctype": "Salary Structure", "name": structure, "company": company, "currency": "PKR", "is_active": "Yes",
			"payroll_frequency": "Monthly",
			"earnings": [
				{"salary_component": "Basic Salary", "amount_based_on_formula": 1, "formula": "base * 0.60"},
				{"salary_component": "House Rent Allowance", "amount_based_on_formula": 1, "formula": "base * 0.27"},
				{"salary_component": "Medical Allowance", "amount_based_on_formula": 1, "formula": "base * 0.06"},
				{"salary_component": "Conveyance Allowance", "amount_based_on_formula": 1, "formula": "base * 0.07"},
				{"salary_component": "EOBI - Employer", "amount_based_on_formula": 1, "formula": f"{MIN_WAGE} * 0.05", "statistical_component": 1},
				{"salary_component": "Social Security - Employer", "amount_based_on_formula": 1, "formula": "base * 0.06 if base <= 37000 else 0",
					"statistical_component": 1}],
			"deductions": [
				{"salary_component": "EOBI - Employee", "amount_based_on_formula": 1, "formula": f"{MIN_WAGE} * 0.01"},
				{"salary_component": "Provident Fund - Employee", "amount_based_on_formula": 1, "formula": "BS * 0.0833"},
				{"salary_component": "Group Insurance", "amount": 300},
				{"salary_component": "Income Tax", "amount": 0}]})
		doc.flags.ignore_permissions = True
		doc.insert(set_name=structure)
		doc.submit()
	if frappe.db.exists("DocType", "Gratuity Rule") and not frappe.db.exists("Gratuity Rule", "Pakistan - 30 days per year"):
		doc = frappe.get_doc({"doctype": "Gratuity Rule", "name": "Pakistan - 30 days per year",
			"calculate_gratuity_amount_based_on": "Current Slab", "total_working_days_per_year": 365,
			"work_experience_calculation_function": "Round off Work Experience", "minimum_year_for_gratuity": 1,
			"applicable_earnings_component": [{"salary_component": "Basic Salary"}],
			"gratuity_rule_slabs": [{"from_year": 0, "to_year": 0, "fraction_of_applicable_earnings": 1}]})
		doc.flags.ignore_permissions = True
		doc.insert(set_name="Pakistan - 30 days per year")
	return {"shifts": len(SHIFTS), "components": len(COMPONENTS)}


# ---------------------------------------------------------------- production costing (cost centres, accounts, grades, rates)
CC_TREE = {  # group -> leaves (existing leaves of the same name are moved under the group)
	"Cane Procurement": ["Cane Yard", "Cane"],
	"Production": ["Mill House", "Boiling House", "Process House", "Centrifugal and Packing", "Boiler House", "Power House", "Laboratory"],
	"Service": ["Workshop", "Stores", "Administration"],
}
ALLOCATION = [  # rule, service cost centre, basis, {target: %}
	("Workshop to production", "Workshop", "Fixed %", {"Mill House": 40, "Boiler House": 30, "Power House": 20, "Boiling House": 10}),
	("Stores to production", "Stores", "Equal", {k: 0 for k in ("Mill House", "Boiling House", "Process House", "Centrifugal and Packing",
		"Boiler House", "Power House", "Laboratory")}),
	("Administration to production", "Administration", "Fixed %", {"Mill House": 30, "Boiling House": 25, "Process House": 15,
		"Centrifugal and Packing": 10, "Boiler House": 10, "Power House": 5, "Laboratory": 5}),
]
GRADES = [("A", None, 1, 1, "Plantation white, the main grade"), ("B", "SUGAR-B-50KG", 2, 0, "Second grade"),
	("Refined", "SUGAR-REF-50KG", 3, 0, "Refined sugar")]


def production_costing(company, abbr):
	root = frappe.db.get_value("Cost Center", {"company": company, "is_group": 1, "parent_cost_center": ["in", ["", None]]}, "name")
	for group, leaves in CC_TREE.items():
		g = ensure("Cost Center", f"{group} - {abbr}", {"cost_center_name": group, "parent_cost_center": root, "company": company, "is_group": 1})
		for leaf in leaves:
			name = f"{leaf} - {abbr}"
			if frappe.db.exists("Cost Center", name):
				if frappe.db.get_value("Cost Center", name, "parent_cost_center") != g and not frappe.db.get_value("Cost Center", name, "is_group"):
					doc = frappe.get_doc("Cost Center", name)
					doc.parent_cost_center = g
					doc.flags.ignore_permissions = True
					doc.save()
			else:
				ensure("Cost Center", name, {"cost_center_name": leaf, "parent_cost_center": g, "company": company, "is_group": 0})
	ensure("Cost Center", f"Off-season - {abbr}", {"cost_center_name": "Off-season", "parent_cost_center": root, "company": company, "is_group": 0})
	direct = frappe.db.get_value("Account", {"company": company, "account_name": "Direct Expenses", "is_group": 1}, "name")
	byp = frappe.db.get_value("Account", {"company": company, "account_name": "By-product Sales", "is_group": 1}, "name") or \
		frappe.db.get_value("Account", {"company": company, "account_name": "Direct Income", "is_group": 1}, "name")
	accounts = {
		"cost_absorbed_account": _acc(company, abbr, "Cost of Production Absorbed", direct),
		"power_steam_account": _acc(company, abbr, "Power and Steam - Bagasse Burnt", direct),
		"by_product_variance_account": _acc(company, abbr, "By-product Variance", byp, account_type="Income Account"),
	}
	st = frappe.get_single("Sugar Settings")
	defaults = {**accounts, "boiler_house_cost_center": f"Boiler House - {abbr}", "off_season_cost_center": f"Off-season - {abbr}"}
	for field, value in defaults.items():
		if value and not st.get(field):
			frappe.db.set_single_value("Sugar Settings", field, value)
	for rule, src, basis, targets in ALLOCATION:
		if frappe.db.exists("Cost Center", f"{src} - {abbr}"):
			ensure("Cost Allocation Rule", rule, {"rule_name": rule, "company": company, "service_cost_center": f"{src} - {abbr}", "basis": basis,
				"is_active": 1, "targets": [{"cost_center": f"{t} - {abbr}", "pct": pct} for t, pct in targets.items()
					if frappe.db.exists("Cost Center", f"{t} - {abbr}")]})
	main = st.sugar_item
	for grade, code, seq, default, desc in GRADES:
		item = code or main
		if code and not frappe.db.exists("Item", code):
			src = frappe.get_doc("Item", main) if main and frappe.db.exists("Item", main) else None
			if not src:
				continue
			ensure("Item", code, {"item_code": code, "item_name": f"Sugar Grade {grade} (50 kg bag)" if grade != "Refined" else "Refined Sugar (50 kg bag)",
				"item_group": src.item_group, "stock_uom": src.stock_uom, "is_stock_item": 1, "include_item_in_manufacturing": 1,
				"is_sales_item": 1, "valuation_rate": src.valuation_rate or 6000, "uoms": [{"uom": u.uom, "conversion_factor": u.conversion_factor} for u in src.uoms]})
		if item:
			ensure("Sugar Grade", grade, {"grade_name": grade, "item": item, "sequence": seq, "is_default": default, "is_active": 1, "description": desc})
	n = 0
	for sea in frappe.get_all("Crushing Season", fields=["name", "start_date", "molasses_nrv_per_kg", "bagasse_nrv_per_kg", "press_mud_nrv_per_kg"]):
		for item, nrv, cost in ((st.molasses_item, sea.molasses_nrv_per_kg, 1100), (st.bagasse_item, sea.bagasse_nrv_per_kg, 500),
				(st.press_mud_item, sea.press_mud_nrv_per_kg, 0)):
			if item and flt(nrv) and not frappe.db.exists("By-product Rate", {"season": sea.name, "item": item}):
				ensure("By-product Rate", None, {"season": sea.name, "item": item, "valid_from": sea.start_date, "rate_per_ton": flt(nrv) * 1000 + cost,
					"selling_cost_per_ton": cost, "is_active": 1, "remarks": "From the season's NRV (setup)"})
				n += 1
	return {"accounts": len(accounts), "by_product_rates": n}
