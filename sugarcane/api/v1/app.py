"""React shell endpoints: session boot and the home page."""

import frappe
from frappe import _

STAFF_ROLES = {"System Manager", "Cane Manager", "Cane Admin", "Circle Officer", "Surveyor", "Indent Clerk",
	"Token Clerk", "Gross Weighman", "Tare Weighman", "Yard Supervisor", "Cane Cashier", "Lab Chemist",
	"Production Manager", "Cane Accountant", "Depot User", "MIS Viewer", "Accounts User", "Accounts Manager"}


@frappe.whitelist(allow_guest=True, methods=["GET"])
def boot() -> dict:
	"""Who is signed in, their roles, the CSRF token for POSTs, company and active season."""
	user = frappe.session.user
	if user == "Guest":
		return {"user": None}
	roles = frappe.get_roles()
	settings = frappe.get_cached_doc("Sugar Settings")
	season = None
	if settings.active_season:
		season = frappe.db.get_value("Crushing Season", settings.active_season,
			["name", "status", "start_date", "end_date", "govt_rate", "crushing_target_maund"], as_dict=True)
	return {
		"user": user,
		"full_name": frappe.utils.get_fullname(user),
		"user_image": frappe.db.get_value("User", user, "user_image"),
		"roles": roles,
		"is_staff": bool(STAFF_ROLES.intersection(roles)),
		"csrf_token": frappe.sessions.get_csrf_token(),
		"company": settings.company,
		"currency": frappe.get_cached_value("Company", settings.company, "default_currency") if settings.company else "PKR",
		"maund_kg": settings.maund_kg or 40,
		"season": season,
		"language": frappe.local.lang,
	}


def _staff():
	if not STAFF_ROLES.intersection(frappe.get_roles()):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _count(doctype, filters=None) -> int | None:
	"""Count of records the user may read (User Permissions applied), or None without read access."""
	if not frappe.has_permission(doctype, "read"):
		return None
	return len(frappe.get_list(doctype, filters=filters or {}, pluck="name", limit_page_length=0))


@frappe.whitelist(methods=["GET"])
def home() -> dict:
	_staff()
	circles = frappe.get_list("Cane Circle", fields=["name", "circle_code", "zone", "affiliation", "quota_maund"],
		order_by="circle_code", limit_page_length=0) if frappe.has_permission("Cane Circle", "read") else []
	by_circle = {}
	if frappe.has_permission("Grower", "read"):
		for row in frappe.get_list("Grower", fields=["circle"], filters={"disabled": 0}, limit_page_length=0):
			by_circle[row.circle] = by_circle.get(row.circle, 0) + 1
	return {
		"counts": {
			"growers": _count("Grower", {"disabled": 0}),
			"passbooks": _count("Grower Passbook", {"status": "Active"}),
			"circles": len(circles),
			"villages": _count("Cane Village", {"is_active": 1}),
			"vehicles": _count("Sugar Vehicle", {"is_blacklisted": 0}),
			"sources": _count("Cane Source", {"is_active": 1}),
			"loading_points": _count("Loading Point", {"is_active": 1}),
			"depots": _count("Cane Depot", {"is_active": 1}),
		},
		"circles": [{**c, "growers": by_circle.get(c.name, 0)} for c in circles],
	}
