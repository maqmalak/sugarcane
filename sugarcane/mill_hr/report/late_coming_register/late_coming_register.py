# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, add_months, cint, date_diff, flt, getdate, nowdate

from sugarcane.cane_procurement.report_utils import col


def _range(f, back=90):
	end = getdate(f.to_date or nowdate())
	return getdate(f.from_date or add_days(end, -back)), end


def execute(filters=None):
	"""Late marks per employee for a month, the days to deduct (every N late marks = one day) and whether the penalty is made."""
	from frappe.utils import get_last_day

	from sugarcane.mill_hr.hr import COMPONENT, late_marks

	f = frappe._dict(filters or {})
	month = f.month or nowdate()[:7]
	per = cint(frappe.db.get_single_value("Sugar Settings", "late_marks_per_day")) or 3
	pay_date = get_last_day(getdate(f"{month}-01"))
	rows = late_marks(month)
	for r in rows:
		r.days = cint(r.late) // per
		r.penalty = frappe.db.get_value("Additional Salary", {"employee": r.employee, "salary_component": COMPONENT, "payroll_date": pay_date,
			"docstatus": ["<", 2]}, "amount")
	cols = [col("employee", "Employee", "Link", "Employee", 120), col("employee_name", "Name", width=180), col("department", "Department", width=150),
		col("late", "Late Marks", "Int", width=90), col("days", "Days to Deduct", "Int", width=110), col("penalty", "Penalty Made", "Currency", width=120)]
	return cols, rows
