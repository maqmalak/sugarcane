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
	"""Basic EPS = profit after tax ÷ ordinary shares outstanding (Sugar Settings), month by month and for the period."""
	f = frappe._dict(filters or {})
	company = frappe.db.get_single_value("Sugar Settings", "company")
	shares = flt(frappe.db.get_single_value("Sugar Settings", "shares_outstanding")) or 1
	start = getdate(f.from_date or "2026-07-01")
	end = getdate(f.to_date or nowdate())
	rows, d = [], start
	while d <= end:
		m_end = min(add_days(add_months(d, 1), -1), end)
		inc, exp = profit(company, d, m_end)
		rows.append({"period": d.strftime("%b %Y"), "income": round(inc, 2), "expense": round(exp, 2), "profit": round(inc - exp, 2),
			"eps": round((inc - exp) / shares, 4)})
		d = add_months(d, 1)
	inc, exp = profit(company, start, end)
	rows.append({"period": "Period", "income": round(inc, 2), "expense": round(exp, 2), "profit": round(inc - exp, 2), "eps": round((inc - exp) / shares, 4), "bold": 1})
	cols = [col("period", "Period", width=110), col("income", "Income", "Currency", width=140), col("expense", "Expenses (incl. tax)", "Currency", width=150),
		col("profit", "Profit After Tax", "Currency", width=140), col("eps", "EPS (Rs per share)", "Float", width=130)]
	summary = [{"label": "Shares", "value": shares, "datatype": "Float"}, {"label": "EPS for the period", "value": round((inc - exp) / shares, 4),
		"datatype": "Float", "indicator": "green" if inc >= exp else "red"}]
	return cols, rows, None, None, summary
