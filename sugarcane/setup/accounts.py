"""Per-company setup: cane ledgers, Cane Yard warehouse, Sugarcane item, Maund UOM, internal supplier.

Accounts are company-specific, so they are created here rather than shipped as fixtures. Idempotent: existing
records are reused and Sugar Settings fields already filled in are never overwritten.
"""

import frappe
from frappe import _

CANE_ITEM = "SUGARCANE"
DAILY_SUPPLIER = "Daily Cane Purchase"
CONTRACTOR_GROUP = "Cane Contractor"
INTERNAL_GROUP = "Cane Internal"


def _group(company, *names, root_type=None):
	for name in names:
		acc = frappe.db.get_value("Account", {"company": company, "account_name": name, "is_group": 1}, "name")
		if acc:
			return acc
	if root_type:
		return frappe.db.get_value("Account", {"company": company, "root_type": root_type, "is_group": 1,
			"parent_account": ["in", ["", None]]}, "name")
	return None


def _parent_of(account):
	return frappe.db.get_value("Account", account, "parent_account") if account else None


def _account(company, abbr, account_name, parent, account_type="", is_group=0):
	name = f"{account_name} - {abbr}"
	if frappe.db.exists("Account", name):
		return name
	if not parent:
		frappe.throw(_("Couldn't find a parent account for {0} in {1}").format(account_name, company))
	acc = frappe.get_doc({
		"doctype": "Account", "account_name": account_name, "company": company, "parent_account": parent,
		"account_type": account_type, "is_group": is_group,
	})
	acc.flags.ignore_permissions = True
	acc.insert()
	return acc.name


def setup_company(company: str) -> dict:
	abbr = frappe.get_cached_value("Company", company, "abbr")
	co = frappe.get_cached_doc("Company", company)

	payables = _parent_of(co.default_payable_account) or _group(company, "Accounts Payable", root_type="Liability")
	current_liab = _group(company, "Current Liabilities", root_type="Liability")
	duties = _group(company, "Duties and Taxes") or current_liab
	cash = _parent_of(co.default_cash_account) or _group(company, "Cash In Hand", root_type="Asset")
	loans = _group(company, "Loans and Advances (Assets)", "Current Assets", root_type="Asset")
	direct = _group(company, "Direct Expenses", root_type="Expense")

	cost_of_sales = _account(company, abbr, "Cane Cost of Sales", direct, is_group=1)
	accounts = {
		"grower_payable_account": _account(company, abbr, "Grower Payable", payables, "Payable"),
		"cane_purchase_clearing_account": _account(company, abbr, "Cane Purchase Clearing", payables, "Payable"),
		"tpt_payable_account": _account(company, abbr, "TPT-Bilty Payable", current_liab),
		"road_cess_payable_account": _account(company, abbr, "Road Cess Payable - Govt", duties, "Tax"),
		# party type Grower is Payable, and ERPNext only lets a party sit on an account of its party type's kind: so the loan
		# ledger is a Payable-type account under the assets (a debit balance per grower)
		"grower_loan_account": _account(company, abbr, "Grower Loan Receivable", loans, "Payable"),
		"cash_counter_account": _account(company, abbr, "Cash Counter - Cane", cash, "Cash"),
		"cane_purchase_govt_account": _account(company, abbr, "Cane Purchase A-c (Govt)", cost_of_sales),
		"subsidy_purchase_account": _account(company, abbr, "Subsidy Purchase", cost_of_sales),
		"additional_subsidy_account": _account(company, abbr, "Additional Subsidy", cost_of_sales),
		"road_cess_expense_account": _account(company, abbr, "Road Cess - Mill Share", cost_of_sales),
		"freight_account": _account(company, abbr, "Cane Freight - Depots", cost_of_sales),
		"contract_labour_account": _account(company, abbr, "Cane Loading and Unloading", cost_of_sales),
		"depot_commission_account": _account(company, abbr, "Depot Commission", cost_of_sales),
		"transit_shortage_account": _account(company, abbr, "Cane Transit Shortage", cost_of_sales),
		"cane_bank_account": _account(company, abbr, "Cane Payments Bank", _group(company, "Bank Accounts", root_type="Asset"), "Bank"),
		"jazzcash_account": _account(company, abbr, "JazzCash Wallet - TPT", _group(company, "Bank Accounts", root_type="Asset"), "Bank"),
		"markup_income_account": _account(company, abbr, "Loan Markup Income", _group(company, "Indirect Income", "Direct Income",
			root_type="Income"), "Income Account"),
	}

	warehouse = _warehouse(company, abbr)
	transit = _warehouse(company, abbr, "Cane In Transit")
	_maund_uom()
	item = _cane_item(company, warehouse, accounts["cane_purchase_govt_account"])
	contractor_group = _supplier_group(CONTRACTOR_GROUP)
	_supplier_group(INTERNAL_GROUP)
	supplier = _daily_supplier(company, accounts["cane_purchase_clearing_account"])

	settings = frappe.get_single("Sugar Settings")
	values = {**accounts, "company": company, "cane_yard_warehouse": warehouse, "transit_warehouse": transit, "cane_item": item,
		"daily_purchase_supplier": supplier, "contractor_supplier_group": contractor_group,
		"cost_center": co.cost_center}
	for field, value in values.items():
		if not settings.get(field):
			settings.set(field, value)
	settings.flags.ignore_permissions = True
	settings.save()
	from sugarcane.setup.production import setup as setup_production

	setup_production(company)
	loan_acc = accounts["grower_loan_account"]
	if frappe.db.get_value("Account", loan_acc, "account_type") != "Payable" and not frappe.db.exists("GL Entry", {"account": loan_acc}):
		frappe.db.set_value("Account", loan_acc, "account_type", "Payable")
	for depot in frappe.get_all("Cane Depot", filters={"warehouse": ["is", "not set"]}, pluck="name"):
		frappe.db.set_value("Cane Depot", depot, "warehouse", depot_warehouse(depot, company), update_modified=False)
	return values


def _warehouse(company, abbr, warehouse_name="Cane Yard"):
	name = f"{warehouse_name} - {abbr}"
	if frappe.db.exists("Warehouse", name):
		return name
	parent = frappe.db.get_value("Warehouse", {"company": company, "is_group": 1, "parent_warehouse": ["in", ["", None]]}, "name")
	wh = frappe.get_doc({"doctype": "Warehouse", "warehouse_name": warehouse_name, "company": company, "parent_warehouse": parent})
	wh.insert(ignore_permissions=True)
	return wh.name


def depot_warehouse(depot: str, company: str | None = None) -> str:
	"""Each depot holds the cane bought there in its own warehouse until it is dispatched to the mill."""
	company = company or frappe.db.get_single_value("Sugar Settings", "company")
	abbr = frappe.get_cached_value("Company", company, "abbr")
	label = depot if depot.lower().startswith("depot") else f"Depot {depot}"
	return _warehouse(company, abbr, label)


def _maund_uom():
	if not frappe.db.exists("UOM", "Maund"):
		frappe.get_doc({"doctype": "UOM", "uom_name": "Maund", "must_be_whole_number": 0}).insert(ignore_permissions=True)
	if not frappe.db.exists("UOM", "Kg"):
		frappe.get_doc({"doctype": "UOM", "uom_name": "Kg"}).insert(ignore_permissions=True)
	if not frappe.db.exists("UOM Conversion Factor", {"from_uom": "Maund", "to_uom": "Kg"}):
		category = frappe.db.get_value("UOM Category", "Mass") or frappe.get_doc(
			{"doctype": "UOM Category", "category_name": "Mass"}).insert(ignore_permissions=True).name
		frappe.get_doc({"doctype": "UOM Conversion Factor", "category": category, "from_uom": "Maund", "to_uom": "Kg",
			"value": 40}).insert(ignore_permissions=True)


def _cane_item(company, warehouse, expense_account):
	if frappe.db.exists("Item", CANE_ITEM):
		return CANE_ITEM
	group = frappe.db.get_value("Item Group", "Raw Material") or frappe.db.get_value("Item Group", {"is_group": 0}, "name")
	item = frappe.get_doc({
		"doctype": "Item", "item_code": CANE_ITEM, "item_name": "Sugarcane", "item_group": group, "stock_uom": "Kg",
		"is_stock_item": 1, "include_item_in_manufacturing": 1, "is_purchase_item": 1, "is_sales_item": 0,
		"description": "Sugarcane received at the mill (weighbridge payable weight)",
		"uoms": [{"uom": "Kg", "conversion_factor": 1}, {"uom": "Maund", "conversion_factor": 40}],
		"item_defaults": [{"company": company, "default_warehouse": warehouse, "expense_account": expense_account}],
	})
	item.insert(ignore_permissions=True)
	return item.name


def _supplier_group(name):
	if not frappe.db.exists("Supplier Group", name):
		parent = frappe.db.get_value("Supplier Group", {"is_group": 1, "parent_supplier_group": ["in", ["", None]]}, "name")
		frappe.get_doc({"doctype": "Supplier Group", "supplier_group_name": name, "parent_supplier_group": parent}).insert(
			ignore_permissions=True)
	return name


def _daily_supplier(company, clearing_account):
	name = frappe.db.get_value("Supplier", {"supplier_name": DAILY_SUPPLIER}, "name")
	if name:
		return name
	sup = frappe.get_doc({
		"doctype": "Supplier", "supplier_name": DAILY_SUPPLIER, "supplier_group": INTERNAL_GROUP,
		"supplier_type": "Company", "country": "Pakistan",
		"accounts": [{"company": company, "account": clearing_account}],
	})
	sup.insert(ignore_permissions=True)
	return sup.name
