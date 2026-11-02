# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Demo: a mill trading all year (July 2025 → November 2026), so the dashboards show monthly trends and a positive margin.

Each month, in order: store buying (purchase order → bill with stock → supplier payment), store issues to the mill
departments, by-product sales (molasses from the tank, press mud and bagasse), and sugar sales from the reserve godown —
sized so the month closes at a 6–15 % net margin. Off-season overheads for April–October 2026 are posted like the 2025
off-season, opening carry-over stock (sugar, molasses) is placed in separate warehouses on 1 July 2025 so the season's
own costing is untouched, and older customer invoices are collected.

Everything carries DEMO-TRADE in its remarks so reset() can remove it.
    bench --site sugarcane.local execute sugarcane.setup.demo_trade.run
    bench --site sugarcane.local execute sugarcane.setup.demo_trade.reset
"""
import math
import random

import frappe
from frappe.utils import add_days, add_months, flt, get_last_day, getdate

TAG = "DEMO-TRADE"
SEED = 4242
COMPANY = "MicroMax Sugar Mills Ltd."
AB = "MSML"
START, END = getdate("2025-07-01"), getdate("2026-11-06")
SUGAR, MOLASSES, BAGASSE, PRESS_MUD = "SUGAR-50KG", "MOLASSES", "BAGASSE", "PRESS-MUD"
RESERVE, TANK, BYPROD = f"Reserve Godown - {AB}", f"Molasses Tank - {AB}", f"By-products Store - {AB}"
SUGAR_COST, MOLASSES_COST = 5450.0, 30.0
BANK = f"Cane Payments Bank - {AB}"
DEALERS = ["Madina Sugar Dealers", "Al-Rehman Trading Co.", "Multan Sugar Agency", "Karachi Commodities (Pvt) Ltd",
	"Shezan Foods (Pvt) Ltd", "Ghulam Rasool Kiryana"]
STORE = [  # item, warehouse, qty range per purchase, cost centre that uses it
	("CH-LIME", "Chemical Store", (6000, 14000), "Process House"), ("CH-SULPHUR", "Chemical Store", (1500, 3500), "Process House"),
	("CH-PHOS", "Chemical Store", (150, 400), "Process House"), ("CH-FLOC", "Chemical Store", (40, 120), "Process House"),
	("FL-DIESEL", "Fuel Store", (3000, 8000), "Boiler House"), ("FL-GREASE", "Fuel Store", (120, 300), "Mill House"),
	("ST-BRG-6205", "Mechanical Store", (20, 60), "Mill House"), ("ST-CHN-MILL", "Mechanical Store", (6, 20), "Mill House"),
	("ST-VLV-4IN", "Mechanical Store", (2, 8), "Workshop"), ("ST-CBL-4C16", "Electrical Store", (100, 400), "Power House"),
	("TL-WELD", "Tools Store", (10, 40), "Workshop"), ("SF-HELMET", "Tools Store", (20, 60), "Administration"),
]
SUPPLIER_FOR = {"CH": ["Punjab Chemicals (Pvt) Ltd", "Lahore Lime Industries", "Indus Sulphur Traders"],
	"FL": ["Shell Pakistan Lubricants", "Punjab Chemicals (Pvt) Ltd"], "ST": ["Al-Hamd Bearing House", "Faisal Engineering Works", "Pak Electric Motors"],
	"TL": ["Faisal Engineering Works", "Al-Hamd Bearing House"], "SF": ["Al-Hamd Bearing House"]}


def _remark(text):
	return f"{text} ({TAG})"


def _save(doc, submit=True):
	doc.flags.ignore_permissions = True
	doc.insert()
	if submit:
		doc.submit()
	return doc


def _month_pl(first, last):
	r = frappe.db.sql("""select coalesce(sum(case when a.root_type='Income' then g.credit-g.debit end),0),
		coalesce(sum(case when a.root_type='Expense' then g.debit-g.credit end),0)
		from `tabGL Entry` g join `tabAccount` a on a.name = g.account
		where g.is_cancelled = 0 and g.company = %s and g.posting_date between %s and %s""", (COMPANY, first, last))[0]
	return flt(r[0]), flt(r[1])


def _qty(item, wh, on):
	"""Stock on a day: the running balance of the last ledger entry (an opening reconciliation has no quantity change)."""
	r = frappe.db.sql("""select qty_after_transaction from `tabStock Ledger Entry` where is_cancelled=0 and item_code=%s and warehouse=%s
		and posting_date <= %s order by posting_date desc, posting_time desc, creation desc limit 1""", (item, wh, on))
	return flt(r[0][0]) if r else 0.0


def _days(first, last, n, rnd):
	span = (getdate(last) - getdate(first)).days
	return sorted(add_days(first, rnd.randint(0, max(span, 0))) for _ in range(n))


# ---------------------------------------------------------------- masters
def masters():
	for wh in ("Reserve Godown", "Molasses Tank"):
		if not frappe.db.exists("Warehouse", f"{wh} - {AB}"):
			_save(frappe.get_doc({"doctype": "Warehouse", "warehouse_name": wh, "company": COMPANY, "parent_warehouse": f"All Warehouses - {AB}"}), submit=False)
	if not frappe.db.exists("Account", f"Stores and Spares Consumed - {AB}"):
		_save(frappe.get_doc({"doctype": "Account", "account_name": "Stores and Spares Consumed", "company": COMPANY,
			"parent_account": f"Direct Expenses - {AB}", "root_type": "Expense", "report_type": "Profit and Loss"}), submit=False)
	if not frappe.db.exists("Supplier", "Shell Pakistan Lubricants"):
		_save(frappe.get_doc({"doctype": "Supplier", "supplier_name": "Shell Pakistan Lubricants", "supplier_group": "Mill Stores Vendor",
			"country": "Pakistan", "tax_id": "0451236-7"}), submit=False)


def _opening_names():
	"""Stock Reconciliation has no remarks field: the opening is the one that stocks the reserve godown."""
	return frappe.get_all("Stock Reconciliation Item", filters={"warehouse": RESERVE, "docstatus": ["<", 2]}, pluck="parent", distinct=True)


def opening():
	if _opening_names():
		return
	sr = frappe.get_doc({"doctype": "Stock Reconciliation", "company": COMPANY, "purpose": "Opening Stock", "posting_date": "2025-07-01",
		"posting_time": "00:05:00", "set_posting_time": 1, "expense_account": f"Temporary Opening - {AB}", "cost_center": f"Main - {AB}",
		"remarks": _remark("Carry-over stock from season 2024-25"),
		"items": [{"item_code": SUGAR, "warehouse": RESERVE, "qty": 185000, "valuation_rate": SUGAR_COST},
			{"item_code": MOLASSES, "warehouse": TANK, "qty": 5200000, "valuation_rate": MOLASSES_COST}]})
	_save(sr)


def reclassify():
	"""The season demo received the mill's opening store stock in October 2025 against Stock Adjustment (a P&L gain);
	move it to the opening balance so October isn't shown as a 35 M "profit"."""
	if frappe.db.exists("Journal Entry", {"user_remark": ["like", f"%Opening stores reclassified%{TAG}%"], "docstatus": 1}):
		return
	gain = flt(frappe.db.sql("""select sum(g.credit - g.debit) from `tabGL Entry` g join `tabStock Entry` se on se.name = g.voucher_no
		where g.is_cancelled = 0 and g.account = %s and se.remarks like %s and g.posting_date between '2025-10-01' and '2025-10-31'""",
		(f"Stock Adjustment - {AB}", "%Season stores stock%"))[0][0])
	if gain <= 0:
		return
	_save(frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": COMPANY, "posting_date": "2025-10-31",
		"user_remark": _remark("Opening stores reclassified from Stock Adjustment to the opening balance"),
		"accounts": [{"account": f"Stock Adjustment - {AB}", "debit_in_account_currency": gain, "cost_center": f"Stores - {AB}"},
			{"account": f"Temporary Opening - {AB}", "credit_in_account_currency": gain}]}))


def overheads(rnd):
	"""Off-season months with no overheads posted (April–October 2026): office and salaries like the 2025 off-season."""
	m = getdate("2026-04-01")
	while m <= getdate("2026-10-01"):
		last = get_last_day(m)
		if not frappe.db.exists("Journal Entry", {"posting_date": last, "user_remark": ["like", f"%{TAG}%"]}):
			office, sal = round(7.5e6 * rnd.uniform(0.96, 1.08), -3), round(4.0e6 * rnd.uniform(0.98, 1.05), -3)
			_save(frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Bank Entry", "company": COMPANY, "posting_date": last,
				"cheque_no": f"OH-{m.strftime('%y%m')}", "cheque_date": last, "user_remark": _remark(f"Office and colony upkeep {m.strftime('%b %Y')}"),
				"accounts": [{"account": f"Office Maintenance Expenses - {AB}", "debit_in_account_currency": office, "cost_center": f"Administration - {AB}"},
					{"account": BANK, "credit_in_account_currency": office}]}))
			_save(frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": COMPANY, "posting_date": last,
				"user_remark": _remark(f"Off-season staff salaries {m.strftime('%b %Y')}"),
				"accounts": [{"account": f"Salaries and Wages - {AB}", "debit_in_account_currency": sal, "cost_center": f"Off-season - {AB}"},
					{"account": f"Payroll Payable - {AB}", "credit_in_account_currency": sal}]}))
		m = add_months(m, 1)


# ---------------------------------------------------------------- buying and stores
def buy(first, last, season, rnd, k):
	from erpnext.buying.doctype.purchase_order.purchase_order import make_purchase_invoice

	picks = rnd.sample(STORE, 7 if season else 5)
	groups = {}
	for row in picks:
		groups.setdefault(row[0].split("-")[0], []).append(row)
	bills = []
	for prefix, rows in groups.items():
		day = _days(first, add_days(last, -3), 1, rnd)[0]
		supplier = rnd.choice(SUPPLIER_FOR[prefix])
		items = []
		for code, wh, (lo, hi), _cc in rows:
			rate = flt(frappe.db.get_value("Item", code, "valuation_rate") or frappe.db.get_value("Item Price", {"item_code": code}, "price_list_rate") or 1000)
			qty = rnd.randint(lo, hi) * (2 if season else 1)
			items.append({"item_code": code, "qty": qty, "rate": round(rate * rnd.uniform(0.97, 1.06), 2), "warehouse": f"{wh} - {AB}",
				"schedule_date": add_days(day, 5), "cost_center": f"Stores - {AB}"})
		po = _save(frappe.get_doc({"doctype": "Purchase Order", "supplier": supplier, "company": COMPANY, "transaction_date": day,
			"schedule_date": add_days(day, 5), "set_posting_time": 1, "items": items}))
		pi = make_purchase_invoice(po.name)
		bill_day = min(add_days(day, rnd.randint(2, 6)), add_days(last, -1))
		pi.posting_date, pi.set_posting_time, pi.bill_no, pi.bill_date = bill_day, 1, f"INV-{k:03d}{len(bills)}", bill_day
		pi.update_stock, pi.apply_tds, pi.due_date = 1, 0, add_days(bill_day, 30)
		pi.set("payment_schedule", [])
		pi.remarks = _remark(f"Store purchase against {po.name}")
		pi.flags.ignore_permissions = True
		pi.insert()
		_inspect(pi, bill_day)
		pi.reload()
		pi.submit()
		bills.append(pi)
	return bills


def _inspect(pi, day):
	"""Incoming quality inspection (accepted) for items that need one before receipt — lime, sulphur, diesel."""
	for i in pi.items:
		tpl = frappe.db.get_value("Item", i.item_code, "quality_inspection_template")
		if not tpl:
			continue
		qi = frappe.get_doc({"doctype": "Quality Inspection", "inspection_type": "Incoming", "reference_type": "Purchase Invoice",
			"reference_name": pi.name, "item_code": i.item_code, "sample_size": 1, "inspected_by": "Administrator", "report_date": day,
			"quality_inspection_template": tpl, "child_row_reference": i.name, "remarks": _remark("Store receipt")})
		if hasattr(qi, "get_item_specification_details"):
			qi.get_item_specification_details()
		for r in qi.readings:
			if r.numeric and r.min_value is not None and r.max_value is not None:
				r.reading_1 = str(round((flt(r.min_value) + flt(r.max_value)) / 2, 2))
			elif not r.numeric:
				r.reading_value = "OK"
		qi.status = "Accepted"
		_save(qi)


def issue(first, last, bills, rnd):
	"""Issue most of what was bought this month to the departments that use it (the month's stores cost)."""
	rows = {}
	for pi in bills:
		for i in pi.items:
			share = rnd.uniform(0.55, 0.85)
			cc = next(r[3] for r in STORE if r[0] == i.item_code)
			rows.setdefault(cc, []).append({"item_code": i.item_code, "qty": max(1, math.floor(i.qty * share)), "s_warehouse": i.warehouse,
				"expense_account": f"Stores and Spares Consumed - {AB}", "cost_center": f"{cc} - {AB}"})
	after = max(getdate(pi.posting_date) for pi in bills)  # issue only after the stock has come in
	for cc, items in rows.items():
		day = _days(min(add_days(after, 1), last), last, 1, rnd)[0]
		_save(frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Store Issue", "purpose": "Material Issue", "company": COMPANY,
			"posting_date": day, "set_posting_time": 1, "posting_time": "10:00:00", "remarks": _remark(f"Issued to {cc}"), "items": items}))


# ---------------------------------------------------------------- selling
def _invoice(customer, item, qty, rate, wh, day, tax):
	from erpnext.controllers.accounts_controller import get_taxes_and_charges

	si = frappe.get_doc({"doctype": "Sales Invoice", "customer": customer, "company": COMPANY, "posting_date": day, "set_posting_time": 1,
		"due_date": add_days(day, 20), "update_stock": 1, "set_warehouse": wh, "taxes_and_charges": tax, "remarks": _remark(f"{item} sale"),
		"items": [{"item_code": item, "qty": qty, "rate": rate, "warehouse": wh, "cost_center": f"Sales - {AB}"}]})
	si.set("taxes", get_taxes_and_charges("Sales Taxes and Charges Template", tax))
	return _save(si)


def sell(first, last, i, rnd, season):
	"""By-products first, then sugar from the reserve godown sized for the month's target margin."""
	price = round(6850 + 42 * i + 160 * math.sin(i / 2.2) + rnd.uniform(-40, 40), -1)  # per 50 kg bag
	mol_price = round(36 + 0.55 * i + rnd.uniform(-0.8, 0.8), 2)  # per kg
	income, expense = _month_pl(first, last)
	extra_income = extra_cost = 0.0
	if not season:  # molasses from the tank to the distillery in the off-season
		kg = min(rnd.randint(380, 520) * 1000, _qty(MOLASSES, TANK, last))
		if kg > 0:
			_invoice("Chenab Distillery Ltd", MOLASSES, kg, mol_price, TANK, _days(first, last, 1, rnd)[0], f"Pakistan GST 18% - {AB}")
			extra_income += kg * mol_price
			extra_cost += kg * MOLASSES_COST
	if first >= getdate("2026-04-01") and first <= getdate("2026-10-31"):  # press mud to farmers, bagasse to a paper mill
		for item, kg, rate, cust in ((PRESS_MUD, rnd.randint(140, 240) * 1000, round(3.2 + rnd.uniform(-0.2, 0.3), 2), "Multan Sugar Agency"),
				(BAGASSE, rnd.randint(6, 9) * 1000, round(10.5 + rnd.uniform(-0.3, 0.5), 2), "Karachi Commodities (Pvt) Ltd")):
			cost = flt(frappe.db.get_value("Bin", {"item_code": item, "warehouse": BYPROD}, "valuation_rate"))
			if _qty(item, BYPROD, first) >= kg * 2:
				_invoice(cust, item, kg, rate, BYPROD, _days(first, last, 1, rnd)[0], f"Pakistan GST 18% - {AB}")
				extra_income += kg * rate
				extra_cost += kg * cost
	target = rnd.uniform(0.07, 0.15)
	income += extra_income
	expense += extra_cost
	c = SUGAR_COST / price
	need = (expense - income * (1 - target)) / (price * (1 - target - c))
	bags = int(max(need, rnd.randint(1200, 2600) if season else rnd.randint(3200, 5200)))  # every month has some sales
	bags = min(bags, int(_qty(SUGAR, RESERVE, last)))
	if bags > 0:
		n = max(3, min(9, bags // 1400))
		cuts = sorted(rnd.sample(range(1, bags), n - 1)) if bags > n else []
		parts = [b - a for a, b in zip([0, *cuts], [*cuts, bags])]
		for day, q, cust in zip(_days(first, last, len(parts), rnd), parts, rnd.choices(DEALERS, k=len(parts))):
			if q > 0:
				tax = f"GST 18% + Further Tax 4% - {AB}" if cust == "Ghulam Rasool Kiryana" else f"Pakistan GST 18% - {AB}"
				_invoice(cust, SUGAR, q, price, RESERVE, day, tax)
	return price, bags


# ---------------------------------------------------------------- receipts and supplier payments
def settle(rnd):
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	for dt, cutoff, lag in (("Sales Invoice", "2026-10-12", (12, 30)), ("Purchase Invoice", "2026-10-20", (15, 35))):
		filters = {"docstatus": 1, "outstanding_amount": [">", 0], "posting_date": ["<=", cutoff], "company": COMPANY}
		if dt == "Purchase Invoice":
			filters["remarks"] = ["like", f"%{TAG}%"]
		for inv in frappe.get_all(dt, filters=filters, fields=["name", "posting_date"], order_by="posting_date"):
			if dt == "Sales Invoice" and rnd.random() < 0.06:
				continue  # a few stay unpaid: the overdue tail
			pe = get_payment_entry(dt, inv.name, bank_account=BANK)
			day = min(add_days(inv.posting_date, rnd.randint(*lag)), END)
			pe.posting_date, pe.reference_no, pe.reference_date = day, f"{'RCV' if dt == 'Sales Invoice' else 'PAY'}-{inv.name[-6:]}", day
			pe.custom_remarks = 1
			pe.remarks = _remark(f"{'Receipt against' if dt == 'Sales Invoice' else 'Payment of'} {inv.name}")
			try:
				_save(pe)
			except Exception as e:  # noqa: BLE001 - keep going, report
				frappe.db.rollback()
				print("skip", dt, inv.name, str(e)[:120])


def close_opening():
	"""Temporary Opening must end at zero: close what the opening entries left there into Opening Balance Equity."""
	tmp = f"Temporary Opening - {AB}"
	bal, last = frappe.db.sql("""select sum(debit - credit), max(posting_date) from `tabGL Entry` where is_cancelled = 0 and account = %s""", tmp)[0]
	bal = flt(bal)
	if abs(bal) < 1:
		return
	row = {"account": tmp, ("debit_in_account_currency" if bal < 0 else "credit_in_account_currency"): abs(bal)}
	eq = {"account": f"Opening Balance Equity - {AB}", ("credit_in_account_currency" if bal < 0 else "debit_in_account_currency"): abs(bal)}
	_save(frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Opening Entry", "is_opening": "Yes", "company": COMPANY, "posting_date": last,
		"user_remark": _remark("Temporary Opening closed to Opening Balance Equity"), "accounts": [row, eq]}))


def sweep(rnd):
	"""Treasury: at each month end, surplus cash above a working balance goes into term deposits (balance sheet only)."""
	td = f"Term Deposits - {AB}"
	if not frappe.db.exists("Account", td):
		_save(frappe.get_doc({"doctype": "Account", "account_name": "Term Deposits", "company": COMPANY, "parent_account": f"Securities and Deposits - {AB}",
			"root_type": "Asset", "report_type": "Balance Sheet"}), submit=False)
	m = START
	while m <= END:
		last = min(get_last_day(m), END)
		bal = flt(frappe.db.sql("""select sum(debit - credit) from `tabGL Entry` where is_cancelled = 0 and account = %s and posting_date <= %s""",
			(BANK, last))[0][0])
		keep = rnd.uniform(140, 260) * 1e6  # working balance for scroll payments and bills
		move = round(bal - keep, -5)
		if move > 5e6 and not frappe.db.exists("Journal Entry", {"posting_date": last, "docstatus": 1, "user_remark": ["like", f"%Term deposit%{TAG}%"]}):
			_save(frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Bank Entry", "company": COMPANY, "posting_date": last,
				"cheque_no": f"TDR-{m.strftime('%y%m')}", "cheque_date": last,
				"user_remark": _remark(f"Term deposit placed with the bank — surplus cash {m.strftime('%b %Y')}"),
				"accounts": [{"account": td, "debit_in_account_currency": move}, {"account": BANK, "credit_in_account_currency": move}]}))
		m = add_months(m, 1)


# ---------------------------------------------------------------- run / reset
def run():
	frappe.set_user("Administrator")
	frappe.flags.sugar_sms_off = True
	rnd = random.Random(SEED)
	masters(); opening(); reclassify(); overheads(rnd); frappe.db.commit()
	m, i = START, 0
	while m <= END:
		first, last = m, min(get_last_day(m), END)
		season = m.month in (11, 12, 1, 2, 3)
		bills = buy(first, last, season, rnd, i)
		issue(first, last, bills, rnd)
		price, bags = sell(first, last, i, rnd, season)
		frappe.db.commit()
		inc, exp = _month_pl(first, last)
		print(f"{m.strftime('%Y-%m')}  income {inc / 1e6:8.2f}M  expense {exp / 1e6:8.2f}M  margin {(inc - exp) / inc * 100 if inc else 0:6.1f}%  sugar {bags} bags @ {price}", flush=True)
		m, i = add_months(m, 1), i + 1
	settle(rnd)
	sweep(rnd)
	close_opening()
	frappe.db.commit()
	print("done")


def reset():
	frappe.set_user("Administrator")
	like = ["like", f"%{TAG}%"]
	pos = set(frappe.get_all("Purchase Invoice Item", filters={"parent": ["in", frappe.get_all("Purchase Invoice", filters={"remarks": like}, pluck="name") or [""]]},
		pluck="purchase_order"))
	for dt, field in (("Payment Entry", "remarks"), ("Sales Invoice", "remarks"), ("Stock Entry", "remarks"), ("Quality Inspection", "remarks"), ("Purchase Invoice", "remarks"),
			("Journal Entry", "user_remark"), ("Stock Reconciliation", None)):
		names = _opening_names() if field is None else frappe.get_all(dt, filters={field: like}, pluck="name", order_by="creation desc")
		if dt == "Payment Entry":
			names = sorted(set(names) | set(frappe.db.sql_list("""select name from `tabPayment Entry` where reference_no like 'RCV-%%'
				or reference_no like 'PAY-%%'""")))
		for name in names:
			d = frappe.get_doc(dt, name)
			if d.docstatus == 1:
				d.flags.ignore_links = True
				d.cancel()
			frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
	for po in [p for p in pos if p]:
		d = frappe.get_doc("Purchase Order", po)
		if d.docstatus == 1:
			d.cancel()
		frappe.delete_doc("Purchase Order", po, force=True, ignore_permissions=True)
	frappe.db.commit()
	print("reset done")
