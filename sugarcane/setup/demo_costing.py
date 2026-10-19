# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Production & costing demo: the processing costs a costing run reads, and the runs themselves.

- off-season (Jul–Oct before a season): the overhaul and the off-season salaries, on the Off-season cost centre
- each month of the season: salaries by cost centre, purchased power, depreciation (Depreciation Entry), repairs and
  factory overheads; chemicals, fuel and spares issued from the stores every Monday
- a Costing Run per month (full cost carried into sugar stock), the last one a Season Close (off-season remainder,
  by-product variance)
Amounts are sized for the demo mill (~350 t of cane a day): about Rs 3,600 of processing per ton of cane."""
from datetime import date

import frappe
from frappe.utils import add_days, flt, get_last_day, getdate

TAG = "DEMO-SEASON"
SALARIES = {"Mill House": 3.2, "Boiling House": 2.0, "Process House": 1.6, "Centrifugal and Packing": 1.4, "Boiler House": 2.2,
	"Power House": 1.5, "Laboratory": 0.8, "Workshop": 1.6, "Stores": 0.5, "Administration": 2.4, "Cane Yard": 1.0}  # Rs million / month
DEPRECIATION = {"Mill House": 4.2, "Boiler House": 2.1, "Power House": 2.0, "Administration": 0.6}
STORES = [  # item, weekly qty, cost centre, receipt qty, rate
	("CH-LIME", 2500, "Process House", 60000, 42), ("CH-SULPHUR", 700, "Process House", 16000, 118), ("CH-PHOS", 150, "Process House", 3200, 610),
	("CH-FLOC", 40, "Process House", 900, 1350), ("FL-DIESEL", 1500, "Boiler House", 32000, 265), ("FL-GREASE", 50, "Mill House", 1100, 940),
	("ST-BRG-6205", 10, "Mill House", 220, 1400), ("ST-CHN-MILL", 4, "Mill House", 90, 9000), ("ST-VLV-4IN", 1, "Boiling House", 22, 18000),
	("TL-WELD", 20, "Workshop", 420, 2350)]


def _acc(name, abbr):
	return f"{name} - {abbr}" if frappe.db.exists("Account", f"{name} - {abbr}") else None


def _je(company, day, remark, lines, voucher_type="Journal Entry"):
	if frappe.db.exists("Journal Entry", {"user_remark": f"{remark} ({TAG})", "docstatus": 1}):
		return
	je = frappe.get_doc({"doctype": "Journal Entry", "company": company, "posting_date": day, "voucher_type": voucher_type,
		"user_remark": f"{remark} ({TAG})", "accounts": lines})
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()


def _split(total_m, by: dict, account, abbr, credit_account):
	lines = [{"account": account, "debit_in_account_currency": round(v * 1_000_000, 0), "cost_center": f"{cc} - {abbr}"}
		for cc, v in by.items() if frappe.db.exists("Cost Center", f"{cc} - {abbr}")]
	total = sum(l["debit_in_account_currency"] for l in lines)
	cc = lines[0]["cost_center"] if lines else None
	return lines + [{"account": credit_account, "credit_in_account_currency": total, "cost_center": cc}]


def off_season(company, abbr, start: date, end: date):
	"""Overhaul and off-season salaries before the season, on the Off-season cost centre."""
	off = f"Off-season - {abbr}"
	bank, payroll = f"Cane Payments Bank - {abbr}", f"Payroll Payable - {abbr}"
	repair = _acc("Office Maintenance Expenses", abbr) or _acc("Miscellaneous Expenses", abbr)
	salaries = _acc("Salaries and Wages", abbr)
	d = start
	while d <= end:
		last = min(get_last_day(d), end)
		_je(company, last, f"Off-season salaries {d.strftime('%b %Y')}", [{"account": salaries, "debit_in_account_currency": 4_000_000, "cost_center": off},
			{"account": payroll, "credit_in_account_currency": 4_000_000, "cost_center": off}])
		_je(company, last, f"Overhaul — mill rollers, boiler tubes, pans {d.strftime('%b %Y')}", [{"account": repair, "debit_in_account_currency": 7_500_000,
			"cost_center": off}, {"account": bank, "credit_in_account_currency": 7_500_000, "cost_center": off}])
		d = add_days(last, 1)


def month(company, abbr, first: date, last: date):
	"""A season month's processing costs."""
	bank, payroll = f"Cane Payments Bank - {abbr}", f"Payroll Payable - {abbr}"
	label = first.strftime("%b %Y")
	_je(company, last, f"Salaries {label}", _split(0, SALARIES, _acc("Salaries and Wages", abbr), abbr, payroll))
	_je(company, last, f"Depreciation {label}", _split(0, DEPRECIATION, _acc("Depreciation", abbr), abbr, _acc("Accumulated Depreciation", abbr)),
		voucher_type="Depreciation Entry")
	_je(company, last, f"WAPDA / MEPCO power {label}", [{"account": _acc("Utility Expenses", abbr), "debit_in_account_currency": 2_400_000,
		"cost_center": f"Power House - {abbr}"}, {"account": bank, "credit_in_account_currency": 2_400_000, "cost_center": f"Power House - {abbr}"}])
	_je(company, last, f"Repairs and outside services {label}", [{"account": _acc("Office Maintenance Expenses", abbr), "debit_in_account_currency": 1_500_000,
		"cost_center": f"Workshop - {abbr}"}, {"account": bank, "credit_in_account_currency": 1_500_000, "cost_center": f"Workshop - {abbr}"}])
	_je(company, last, f"Insurance, security and admin {label}", [{"account": _acc("Miscellaneous Expenses", abbr), "debit_in_account_currency": 2_000_000,
		"cost_center": f"Administration - {abbr}"}, {"account": bank, "credit_in_account_currency": 2_000_000, "cost_center": f"Administration - {abbr}"}])


def stores_receipt(company, abbr, day):
	if frappe.db.exists("Stock Entry", {"remarks": f"Season stores stock ({TAG})", "docstatus": 1}):
		return
	rows = []
	for item, _w, _cc, qty, rate in STORES:
		wh = frappe.db.get_value("Item Default", {"parent": item, "company": company}, "default_warehouse")
		if wh:
			rows.append({"item_code": item, "qty": qty, "t_warehouse": wh, "basic_rate": rate})
	if not rows:
		return
	se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "company": company, "posting_date": day,
		"set_posting_time": 1, "posting_time": "10:00:00", "remarks": f"Season stores stock ({TAG})", "items": rows})
	se.flags.ignore_permissions = True
	se.insert()
	se.submit()


def stores_issue(company, abbr, day):
	if frappe.db.exists("Stock Entry", {"remarks": f"Weekly store issue ({TAG})", "posting_date": day, "docstatus": 1}):
		return
	expense = frappe.db.get_value("Company", company, "default_expense_account")
	rows = []
	for item, qty, cc, _r, _rate in STORES:
		wh = frappe.db.get_value("Item Default", {"parent": item, "company": company}, "default_warehouse")
		if wh:
			rows.append({"item_code": item, "qty": qty, "s_warehouse": wh, "expense_account": expense, "cost_center": f"{cc} - {abbr}"})
	if not rows:
		return
	se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Store Issue" if frappe.db.exists("Stock Entry Type", "Store Issue") else "Material Issue",
		"company": company, "posting_date": day, "set_posting_time": 1, "posting_time": "08:30:00", "remarks": f"Weekly store issue ({TAG})", "items": rows})
	se.flags.ignore_permissions = True
	se.insert()
	se.submit()


def costing_run(company, season, first, last, close=False):
	if frappe.db.exists("Costing Run", {"season": season, "from_date": first, "to_date": last, "docstatus": 1}):
		return None
	frappe.set_user("Administrator")
	run = frappe.get_doc({"doctype": "Costing Run", "company": company, "season": season, "run_type": "Season Close" if close else "Monthly",
		"from_date": first, "to_date": last, "capitalise": 1, "is_demo": 1, "remarks": TAG})
	run.flags.ignore_permissions = True
	run.insert()
	run.submit()
	return run.name


def backfill(season="2025-26"):
	"""Add the processing costs and the costing runs to a season already generated (all back-dated, idempotent)."""
	frappe.set_user("Administrator")
	frappe.flags.mute_emails = True
	company = frappe.db.get_single_value("Sugar Settings", "company")
	abbr = frappe.get_cached_value("Company", company, "abbr")
	sea = frappe.db.get_value("Crushing Season", season, ["start_date", "end_date"], as_dict=True)
	start, end = getdate(sea.start_date), getdate(sea.end_date)
	frappe.db.set_value("Crushing Season", season, "budget_processing_per_ton", 3600)
	off_season(company, abbr, date(start.year, 7, 1), add_days(start, -1))
	stores_receipt(company, abbr, add_days(start, -12))
	frappe.db.commit()
	d = start
	while d <= end:
		if d.weekday() == 0:
			stores_issue(company, abbr, d)
		d = add_days(d, 1)
	frappe.db.commit()
	first = start
	runs = []
	while first <= end:
		last = min(get_last_day(first), end)
		month(company, abbr, first, last)
		frappe.db.commit()
		runs.append(costing_run(company, season, first, last, close=last == end))
		frappe.db.commit()
		print(first, "→", last, runs[-1], flush=True)
		first = add_days(last, 1)
	return runs
