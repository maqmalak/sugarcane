# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Mill HR on top of HRMS: the late-coming penalty (every N late marks in a month = one day's pay, as an Additional
Salary deduction) and the biometric punch endpoint (fingerprint / RFID / face devices → Employee Checkin)."""
import hmac

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, flt, get_datetime, get_last_day, getdate

COMPONENT = "Late Coming Penalty"


def late_marks(month: str) -> list[dict]:
	"""Late marks per employee for a month (YYYY-MM): submitted Attendance with late entry."""
	start = getdate(f"{month}-01")
	end = get_last_day(start)
	return frappe.db.sql("""select a.employee, a.employee_name, e.department, count(*) late from `tabAttendance` a
		join `tabEmployee` e on e.name = a.employee where a.docstatus = 1 and a.late_entry = 1 and a.attendance_date between %s and %s
		group by a.employee, a.employee_name, e.department order by late desc""", (start, end), as_dict=True)


def _base(employee, on):
	return flt(frappe.db.get_value("Salary Structure Assignment", {"employee": employee, "docstatus": 1, "from_date": ["<=", on]},
		"base", order_by="from_date desc"))


@frappe.whitelist(methods=["POST"])
def late_penalties(month: str, submit: int = 1) -> dict:
	"""Make (once) the month's penalty for each employee with at least N late marks: (late // N) days × base / 30."""
	if not {"System Manager", "HR Manager"} & set(frappe.get_roles()):
		frappe.throw(_("Only an HR Manager applies late penalties"), frappe.PermissionError)
	per = cint(frappe.db.get_single_value("Sugar Settings", "late_marks_per_day")) or 3
	company = frappe.db.get_single_value("Sugar Settings", "company")
	pay_date = get_last_day(getdate(f"{month}-01"))
	made, skipped = [], []
	for r in late_marks(month):
		days = cint(r.late) // per
		if not days:
			continue
		if frappe.db.exists("Additional Salary", {"employee": r.employee, "salary_component": COMPONENT, "payroll_date": pay_date, "docstatus": ["<", 2]}):
			skipped.append(r.employee)
			continue
		base = _base(r.employee, pay_date)
		if not base:
			skipped.append(r.employee)
			continue
		doc = frappe.get_doc({"doctype": "Additional Salary", "employee": r.employee, "company": company, "salary_component": COMPONENT,
			"amount": round(days * base / 30, 0), "payroll_date": pay_date, "overwrite_salary_structure_amount": 1,
			"remarks": _("{0} late marks in {1}: {2} day(s)").format(r.late, month, days)} if frappe.get_meta("Additional Salary").has_field("remarks")
			else {"doctype": "Additional Salary", "employee": r.employee, "company": company, "salary_component": COMPONENT,
				"amount": round(days * base / 30, 0), "payroll_date": pay_date, "overwrite_salary_structure_amount": 1})
		doc.insert()
		if cint(submit):
			doc.submit()
		made.append({"employee": r.employee, "late": r.late, "days": days, "amount": doc.amount, "name": doc.name})
	return {"month": month, "per_day": per, "made": made, "skipped": skipped}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=600, seconds=60)  # a shift change at the gate clocks
def punch(token: str, device_id: str, user_id: str, timestamp: str, log_type: str | None = None) -> dict:
	"""A biometric device (or its middleware) posts each punch. `user_id` is the employee's Attendance Device ID;
	the shared token is Sugar Settings → Biometric Token. Duplicate punches are ignored."""
	secret = frappe.get_cached_doc("Sugar Settings").get_password("biometric_token", raise_exception=False)
	if not secret or not hmac.compare_digest(str(token or ""), str(secret)):
		frappe.throw(_("Not allowed"), frappe.PermissionError)
	emp = frappe.db.get_value("Employee", {"attendance_device_id": user_id, "status": "Active"}, ["name", "employee_name"], as_dict=True)
	if not emp:
		frappe.throw(_("No active employee has device ID {0}").format(user_id))
	at = get_datetime(timestamp)
	existing = frappe.db.get_value("Employee Checkin", {"employee": emp.name, "time": at}, "name")
	if existing:
		return {"name": existing, "duplicate": 1}
	doc = frappe.get_doc({"doctype": "Employee Checkin", "employee": emp.name, "time": at, "device_id": device_id,
		"log_type": log_type if log_type in ("IN", "OUT") else None})
	doc.insert(ignore_permissions=True)
	return {"name": doc.name, "employee": emp.name, "employee_name": emp.employee_name}
