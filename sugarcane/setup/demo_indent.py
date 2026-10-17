"""Phase 2 demo: indent ranges per circle, quota rules (ratoon and early cane first, a reduced quota for non-passbook
growers, a circle-specific rule), and the first week of the season generated — most batches authorized, some printed,
two left waiting for authorization. Everything is flagged is_demo."""

import frappe
from frappe.utils import add_days, getdate

SEASON = "2026-27"
RULES = (  # name, quota %, from, to, priority, conditions
	("Ratoon cane first", 100, "2026-11-01", "2027-01-15", 10, {"crop_type": "Ratoon"}),
	("Early varieties", 100, "2026-11-01", "2027-01-31", 0, {"maturity": "Early"}),
	("Mid-season varieties", 100, "2026-12-01", "2027-02-28", 0, {"maturity": "Mid"}),
	("Late varieties", 100, "2027-01-01", "2027-03-31", 0, {"maturity": "Late"}),
	("Non-passbook growers (80 %)", 80, None, None, 20, {"grower_category": "Non-Passbook Grower"}),
	("Kot Momin — affiliated circle (90 %)", 90, None, None, 0, {"circle": "Kot Momin"}),
)
FIRST_WEEK = ("2026-11-01", "2026-11-07")
LEAVE_DRAFT = 2   # batches left for the Approvals inbox
PRINT = 4         # authorized batches printed


def ranges():
	for c in frappe.get_all("Cane Circle", fields=["name", "circle_code"], order_by="circle_code asc"):
		if frappe.db.exists("Indent Range", {"season": SEASON, "circle": c.name}):
			continue
		frappe.get_doc({"doctype": "Indent Range", "season": SEASON, "circle": c.name, "prefix": f"26-{c.circle_code}-", "digits": 6,
			"from_no": 100001, "to_no": 102000, "is_demo": 1}).insert(ignore_permissions=True)
	if not frappe.db.exists("Indent Range", {"season": SEASON, "circle": ["is", "not set"]}):
		frappe.get_doc({"doctype": "Indent Range", "season": SEASON, "prefix": "26-000-", "digits": 6, "from_no": 900001,
			"to_no": 909999, "is_demo": 1}).insert(ignore_permissions=True)


def rules():
	for name, pct, start, end, priority, cond in RULES:
		if frappe.db.exists("Indent Quota Rule", {"season": SEASON, "rule_name": name}):
			continue
		if "circle" in cond and not frappe.db.exists("Cane Circle", cond["circle"]):
			continue
		frappe.get_doc({"doctype": "Indent Quota Rule", "season": SEASON, "rule_name": name, "quota_pct": pct, "from_date": start,
			"to_date": end, "priority": priority, "enabled": 1, "is_demo": 1, **cond}).insert(ignore_permissions=True)


def first_week():
	from sugarcane.cane_indenting import generator
	from sugarcane.cane_indenting.printing import print_indents

	if frappe.db.exists("Indent Batch", {"season": SEASON, "from_date": FIRST_WEEK[0]}):
		return
	out = generator.generate(SEASON, *FIRST_WEEK, today=getdate(FIRST_WEEK[0]), remarks="Demo: first week of the season")
	names = [b["name"] for b in out["batches"]]
	for b in names:
		frappe.db.set_value("Indent Batch", b, "is_demo", 1)
		frappe.db.set_value("Cane Indent", {"batch": b}, "is_demo", 1)
	for name in names[LEAVE_DRAFT:]:
		frappe.get_doc("Indent Batch", name).submit()
	for name in names[LEAVE_DRAFT:LEAVE_DRAFT + PRINT]:
		indents = frappe.get_all("Cane Indent", filters={"batch": name, "docstatus": 1}, pluck="name")
		print_indents(indents)
	return out


def run():
	frappe.flags.mute_emails = True
	ranges()
	rules()
	out = first_week()
	frappe.db.commit()
	return out


def reset():
	from sugarcane.setup.demo import _purge

	for dt in ("Cane Indent", "Indent Batch", "Indent Quota Rule", "Indent Range"):
		_purge(dt, frappe.get_all(dt, filters={"is_demo": 1}, pluck="name"))
	frappe.db.commit()
