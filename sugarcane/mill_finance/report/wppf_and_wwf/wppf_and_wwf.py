# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, add_months, cint, date_diff, flt, getdate, nowdate

from sugarcane.cane_procurement.report_utils import col


def _range(f, back=90):
	end = getdate(f.to_date or nowdate())
	return getdate(f.from_date or add_days(end, -back)), end


def profit(company, start, end):
	r = frappe.db.sql("""select a.root_type, sum(g.credit - g.debit) amt from `tabGL Entry` g join `tabAccount` a on a.name = g.account
		where g.company = %s and g.is_cancelled = 0 and g.posting_date between %s and %s and a.root_type in ('Income', 'Expense')
		group by a.root_type""", (company, start, end), as_dict=True)
	v = {x.root_type: flt(x.amt) for x in r}
	return v.get("Income", 0), -v.get("Expense", 0)


def tax_and_funds(company, start, end):
	"""Income tax and WPPF / WWF already booked as expenses (by ledger name), so profit before them can be shown."""
	r = frappe.db.sql("""select a.account_name, sum(g.debit - g.credit) amt from `tabGL Entry` g join `tabAccount` a on a.name = g.account
		where g.company = %s and g.is_cancelled = 0 and g.posting_date between %s and %s and a.root_type = 'Expense'
		and (a.account_name like '%%Income Tax%%' or a.account_name like 'WPPF%%' or a.account_name like 'WWF%%') group by a.account_name""",
		(company, start, end), as_dict=True)
	return {x.account_name: flt(x.amt) for x in r}


def execute(filters=None):
	"""Workers' Profit Participation Fund (5 % of profit before tax, Companies Profits (Workers' Participation) Act 1968) and
	Workers' Welfare Fund (2 % of profit before tax, Punjab WWF Act 2019 — WWF is worked out after WPPF). Rates are in Sugar Settings."""
	f = frappe._dict(filters or {})
	company = frappe.db.get_single_value("Sugar Settings", "company")
	s = frappe.get_cached_doc("Sugar Settings")
	wppf_pct, wwf_pct = flt(s.get("wppf_pct")) or 5, flt(s.get("wwf_pct")) or 2
	start, end = getdate(f.from_date or "2026-07-01"), getdate(f.to_date or nowdate())
	inc, exp = profit(company, start, end)
	booked = tax_and_funds(company, start, end)
	pbt = inc - exp + sum(booked.values())  # add back tax, WPPF and WWF already expensed
	wppf = max(0, round(pbt * wppf_pct / 100, 0))
	wwf = max(0, round((pbt - wppf) * wwf_pct / 100, 0))
	rows = [{"line": "Income", "amount": inc}, {"line": "Expenses", "amount": -exp},
		{"line": "Add back: income tax, WPPF and WWF already booked", "amount": sum(booked.values())},
		{"line": "Profit before tax, WPPF and WWF", "amount": pbt, "bold": 1},
		{"line": f"WPPF @ {wppf_pct:g}%", "amount": wppf, "bold": 1},
		{"line": f"WWF @ {wwf_pct:g}% of profit after WPPF", "amount": wwf, "bold": 1},
		{"line": "Booked so far: WPPF", "amount": sum(v for k, v in booked.items() if k.startswith("WPPF"))},
		{"line": "Booked so far: WWF", "amount": sum(v for k, v in booked.items() if k.startswith("WWF"))}]
	for r in rows:
		r["amount"] = round(flt(r["amount"]), 2)
	return [col("line", "", width=380), col("amount", "Amount (Rs)", "Currency", width=160)], rows
