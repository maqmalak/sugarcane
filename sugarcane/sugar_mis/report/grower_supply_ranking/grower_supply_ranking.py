# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import cint, flt

from sugarcane.cane_procurement.procurement import settings
from sugarcane.cane_procurement.report_utils import col


def execute(filters=None):
	"""Growers by cane supplied this season, with what their survey expected, loads, payable, paid and loan outstanding."""
	f = frappe._dict(filters or {})
	season = f.season or settings().season
	cond = {"s": season, "c": f.circle or ""}
	rows = frappe.db.sql("""select c.grower, max(c.grower_name) grower_name, max(c.circle) circle, max(c.village_name) village,
		count(*) loads, sum(c.payable_maund) maund, sum(c.payable_cpr) payable,
		sum(case when c.payment_status = 'Paid' then c.payable_cpr else 0 end) paid, sum(c.loan_deduction) loan_recovered,
		min(c.posting_date) first_day, max(c.posting_date) last_day
		from `tabCane Purchase Receipt` c where c.docstatus = 1 and c.season = %(s)s and (%(c)s = '' or c.circle = %(c)s)
		group by c.grower order by maund desc limit %(n)s""", {**cond, "n": cint(f.top) or 100}, as_dict=True)
	growers = [r.grower for r in rows] or [""]
	exp = dict(frappe.db.sql("""select grower, sum(expected_production_maund) from `tabCane Survey` where docstatus = 1 and season = %s
		and grower in %s group by grower""", (season, growers)))
	loan = dict(frappe.db.sql("""select grower, sum(outstanding) from `tabGrower Loan` where docstatus = 1 and status = 'Disbursed'
		and grower in %s group by grower""", (growers,)))
	for i, r in enumerate(rows, 1):
		r.rank = i
		r.expected = flt(exp.get(r.grower))
		r.pct_survey = round(100 * flt(r.maund) / r.expected, 1) if r.expected else None
		r.unpaid = flt(r.payable) - flt(r.paid)
		r.loan = flt(loan.get(r.grower))
	cols = [col("rank", "#", "Int", width=50), col("grower", "Grower", "Link", "Grower", 115), col("grower_name", "Name", width=170),
		col("circle", "Circle", "Link", "Cane Circle", 110), col("village", "Village", width=110), col("loads", "Loads", "Int", width=65),
		col("maund", "Maund", "Float", width=95), col("expected", "Survey Expected", "Float", width=115), col("pct_survey", "% of Survey", "Percent", width=90),
		col("payable", "Payable", "Currency", width=115), col("paid", "Paid", "Currency", width=110), col("unpaid", "Unpaid", "Currency", width=110),
		col("loan_recovered", "Loan Recovered", "Currency", width=115), col("loan", "Loan Outstanding", "Currency", width=120),
		col("first_day", "First", "Date", width=90), col("last_day", "Last", "Date", width=90)]
	return cols, rows
