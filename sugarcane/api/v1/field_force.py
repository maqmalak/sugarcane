"""Field force management for the web portal: surveyors and circle officers, their circles, devices, targets and
today's attendance. Managing users needs Cane Manager / Cane Admin / System Manager; Circle Officers can view."""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime, nowdate

MANAGERS = {"System Manager", "Cane Manager", "Cane Admin"}
VIEWERS = MANAGERS | {"Circle Officer"}
FIELD_ROLES = ("Surveyor", "Circle Officer")


def _require(roles):
	if not roles & set(frappe.get_roles()):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _circles_of(user):
	return frappe.get_all("User Permission", filters={"user": user, "allow": "Cane Circle"}, pluck="for_value", order_by="for_value")


@frappe.whitelist(methods=["GET"])
def overview() -> dict:
	_require(VIEWERS)
	season = frappe.db.get_single_value("Sugar Settings", "active_season")
	today = getdate(nowdate())
	users = {}
	for role in FIELD_ROLES:
		for u in frappe.get_all("Has Role", filters={"role": role, "parenttype": "User"}, pluck="parent"):
			if u not in ("Administrator", "Guest"):
				users.setdefault(u, set()).add(role)
	mine = set(_circles_of(frappe.session.user)) if not MANAGERS & set(frappe.get_roles()) else None
	info = {u.name: u for u in frappe.get_all("User", filters={"name": ["in", list(users) or [""]]},
		fields=["name", "full_name", "enabled", "mobile_no", "last_active"])}
	attendance = {a.surveyor: a for a in frappe.get_all("Surveyor Attendance", filters={"attendance_date": today, "docstatus": 1},
		fields=["name", "surveyor", "status", "time_in", "time_out", "inside_geofence_in", "distance_km"])}
	targets = {}
	for t in frappe.get_all("Surveyor Target", filters={"season": season}, fields=["surveyor", "target_acres", "target_surveys"]):
		agg = targets.setdefault(t.surveyor, [0.0, 0])
		agg[0] += flt(t.target_acres)
		agg[1] += t.target_surveys or 0
	done = {}
	for s in frappe.get_all("Cane Survey", filters={"season": season, "docstatus": 1, "survey_for": "Company"},
			fields=["surveyor", "calc_area_acres"]):
		agg = done.setdefault(s.surveyor, [0.0, 0])
		agg[0] += flt(s.calc_area_acres)
		agg[1] += 1
	last_point = dict(frappe.db.sql("""select surveyor, max(logged_at) from `tabSurveyor Location Log`
		where logged_at >= %s group by surveyor""", (f"{today} 00:00:00",)))
	devices = frappe.get_all("Survey Device", fields=["name", "android_id", "device_name", "app", "status", "assigned_user",
		"app_version", "os_version", "registered_on", "last_sync"], order_by="modified desc")
	devices.sort(key=lambda x: {"Pending": 0, "Approved": 1, "Blocked": 2}.get(x.status, 3))  # stable: newest first per status
	rows = []
	for user, roles in sorted(users.items()):
		circles = _circles_of(user)
		if mine is not None and not (set(circles) & mine):
			continue
		u = info.get(user) or frappe._dict(full_name=user, enabled=1)
		a = attendance.get(user)
		t = targets.get(user, [0.0, 0])
		d = done.get(user, [0.0, 0])
		rows.append({
			"user": user, "full_name": u.full_name, "enabled": u.enabled, "mobile": u.mobile_no, "roles": sorted(roles),
			"circles": circles, "devices": [x.name for x in devices if x.assigned_user == user],
			"today": {"status": a.status, "time_in": str(a.time_in), "time_out": str(a.time_out) if a.time_out else None,
				"inside": a.inside_geofence_in, "km": a.distance_km, "attendance": a.name} if a else None,
			"last_point": str(last_point[user]) if user in last_point else None,
			"target_acres": t[0], "target_surveys": t[1], "done_acres": round(d[0], 2), "done_surveys": d[1],
		})
	if mine is not None:
		allowed = {r["user"] for r in rows}
		devices = [x for x in devices if x.assigned_user in allowed]
	return {
		"season": season, "users": rows, "devices": devices,
		"circles": frappe.get_all("Cane Circle", fields=["name", "circle_code"], order_by="circle_code"),
		"can_manage": bool(MANAGERS & set(frappe.get_roles())),
		"counts": {"field_users": len(rows), "present": sum(1 for r in rows if r["today"]),
			"pending_devices": sum(1 for x in devices if x.status == "Pending")},
	}


@frappe.whitelist(methods=["POST"])
def set_device_status(name: str, status: str, assigned_user: str | None = None) -> dict:
	_require(MANAGERS)
	if status not in ("Pending", "Approved", "Blocked"):
		frappe.throw(_("Unknown status"))
	doc = frappe.get_doc("Survey Device", name)
	doc.status = status
	if assigned_user is not None:
		doc.assigned_user = assigned_user or None
	doc.save()
	return {"name": doc.name, "status": doc.status, "assigned_user": doc.assigned_user}


@frappe.whitelist(methods=["POST"])
def set_circles(user: str, circles: str | list) -> list:
	"""Replace the user's Cane Circle User Permissions (their data scope and attendance geofence)."""
	_require(MANAGERS)
	wanted = set(frappe.parse_json(circles) if isinstance(circles, str) else circles)
	unknown = wanted - set(frappe.get_all("Cane Circle", pluck="name"))
	if unknown:
		frappe.throw(_("Unknown circles: {0}").format(", ".join(sorted(unknown))))
	current = {p.for_value: p.name for p in frappe.get_all("User Permission", filters={"user": user, "allow": "Cane Circle"},
		fields=["name", "for_value"])}
	for circle, perm in current.items():
		if circle not in wanted:
			frappe.delete_doc("User Permission", perm, ignore_permissions=True)
	for circle in wanted - set(current):
		frappe.get_doc({"doctype": "User Permission", "user": user, "allow": "Cane Circle", "for_value": circle,
			"apply_to_all_doctypes": 1}).insert(ignore_permissions=True)
	return _circles_of(user)


@frappe.whitelist(methods=["POST"])
def set_enabled(user: str, enabled: int) -> dict:
	_require(MANAGERS)
	if user in ("Administrator", "Guest") or user == frappe.session.user:
		frappe.throw(_("You can't disable this user here"))
	frappe.db.set_value("User", user, "enabled", cint(enabled))
	if not cint(enabled):
		for d in frappe.get_all("Survey Device", filters={"assigned_user": user, "status": "Approved"}, pluck="name"):
			frappe.db.set_value("Survey Device", d, "status", "Blocked")
	return {"user": user, "enabled": cint(enabled)}


@frappe.whitelist(methods=["POST"])
def create_field_user(email: str, first_name: str, role: str = "Surveyor", last_name: str | None = None,
		mobile: str | None = None, circles: str | list | None = None, password: str | None = None) -> dict:
	"""A surveyor / circle officer login. Without a password, Frappe emails a set-password link."""
	_require(MANAGERS)
	if role not in FIELD_ROLES:
		frappe.throw(_("Role must be Surveyor or Circle Officer"))
	email = (email or "").strip().lower()
	if frappe.db.exists("User", email):
		frappe.throw(_("{0} already exists").format(email))
	user = frappe.get_doc({"doctype": "User", "email": email, "first_name": first_name.strip(), "last_name": last_name,
		"mobile_no": mobile, "user_type": "System User", "send_welcome_email": 0 if password else 1,
		"time_zone": "Asia/Karachi"})
	user.insert(ignore_permissions=True)
	user.add_roles(role)
	if password:
		from frappe.utils.password import update_password

		update_password(email, password)
	if circles:
		set_circles(email, circles)
	user.add_comment("Comment", _("Created from the Field Force page by {0} on {1}").format(frappe.session.user, now_datetime()))
	return {"user": email, "circles": _circles_of(email)}
