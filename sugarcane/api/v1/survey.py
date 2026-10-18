"""EagleEye Android app API (offline-first sync).

Sign-in:   POST sugarcane.api.v1.survey.login  {usr, pwd, android_id, device_name, app_version, os_version}
           → {status: Approved, api_key, api_secret, user, …} or {status: Pending|Blocked, message}
Then every call sends `Authorization: token <api_key>:<api_secret>` and `X-Device-Id: <android_id>`.

Masters:   GET  sugarcane.api.v1.survey.masters?since=<server_time of the last pull>   (delta by `modified`)
Upload:    POST sugarcane.api.v1.survey.upload  {surveys: [...], attendance: [...], locations: [...]}
           Every record carries a client UUID; sending the same record again returns the existing name instead of a copy.
"""

import base64
import json

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, flt, get_datetime, now_datetime

from sugarcane.geo import as_feature_collection

FIELD_ROLES = {"Surveyor", "Circle Officer", "LP Operator", "Depot User", "Cane Manager", "Cane Admin", "System Manager"}
SURVEY_FIELDS = ("season", "survey_date", "survey_for", "competitor_mill", "grower_category", "np_cnic", "np_grower_name",
	"np_father_name", "np_mobile", "grower", "circle", "village", "murabba_no",
	"killa_no", "total_acres", "empty_land_acres", "crop_land_acres", "variety", "crop_type", "ratoon_no", "sowing_date",
	"crop_condition", "disease", "disease_pct", "expected_yield", "gps_accuracy_m", "remarks")
MAX_BATCH = 200


# ---------------------------------------------------------------- device binding
def _device_doc(android_id):
	name = frappe.db.get_value("Survey Device", {"android_id": android_id}, "name")
	return frappe.get_doc("Survey Device", name) if name else None


def current_device(app="EagleEye"):
	"""The approved device in the X-Device-Id header, bound to the session user — or a PermissionError."""
	android_id = (frappe.get_request_header("X-Device-Id") or "").strip()
	if not android_id:
		frappe.throw(_("Missing device id"), frappe.PermissionError)
	device = _device_doc(android_id)
	if not device or device.status != "Approved":
		frappe.throw(_("This device is not approved"), frappe.PermissionError)
	if device.assigned_user and device.assigned_user != frappe.session.user:
		frappe.throw(_("This device is registered to another user"), frappe.PermissionError)
	frappe.db.set_value("Survey Device", device.name, {"last_sync": now_datetime(), "last_ip": frappe.local.request_ip},
		update_modified=False)
	return device


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=60)
def login(usr: str, pwd: str, android_id: str, device_name: str | None = None, app_version: str | None = None,
		os_version: str | None = None, app: str = "EagleEye") -> dict:
	from frappe.auth import LoginManager

	android_id = (android_id or "").strip()
	if not android_id:
		frappe.throw(_("Missing device id"))
	# Frappe's own credential check (lock-out trackers, authentication log) without starting a web session
	manager = object.__new__(LoginManager)
	manager.user = None
	manager.authenticate(user=usr, pwd=pwd)  # raises AuthenticationError on a wrong password
	user = manager.user
	if not FIELD_ROLES & set(frappe.get_roles(user)):
		frappe.throw(_("{0} has no field role (Surveyor or Circle Officer)").format(user), frappe.PermissionError)

	device = _device_doc(android_id)
	auto = cint(frappe.db.get_single_value("Sugar Settings", "auto_approve_devices"))
	if not device:
		device = frappe.get_doc({"doctype": "Survey Device", "android_id": android_id, "device_name": device_name,
			"app": app, "assigned_user": user, "status": "Approved" if auto else "Pending",
			"registered_on": now_datetime(), "app_version": app_version, "os_version": os_version})
		device.insert(ignore_permissions=True)
	else:
		device.db_set({"app_version": app_version, "os_version": os_version, "last_ip": frappe.local.request_ip},
			update_modified=False)
	if device.assigned_user and device.assigned_user != user:
		return {"status": "Blocked", "message": _("This phone is registered to another user")}
	if not device.assigned_user:
		device.db_set("assigned_user", user)
	if device.status != "Approved":
		return {"status": device.status, "device": device.name,
			"message": _("Ask the Cane Manager to approve device {0}").format(device.name)
			if device.status == "Pending" else _("This device is blocked")}

	# a fresh secret on every sign-in: the previous phone's token stops working
	user_doc = frappe.get_doc("User", user)
	api_key = user_doc.api_key or frappe.generate_hash(length=15)
	api_secret = frappe.generate_hash(length=15)
	user_doc.api_key = api_key
	user_doc.api_secret = api_secret
	user_doc.flags.ignore_permissions = True
	user_doc.save()
	return {"status": "Approved", "device": device.name, "user": user, "full_name": user_doc.full_name,
		"api_key": api_key, "api_secret": api_secret, "roles": frappe.get_roles(user)}


# ---------------------------------------------------------------- masters
def _since_filter(since):
	return {"modified": [">", get_datetime(since)]} if since else {}


@frappe.whitelist(methods=["GET"])
def masters(since: str | None = None) -> dict:
	current_device()
	server_time = str(now_datetime())
	f = _since_filter(since)
	settings = frappe.get_cached_doc("Sugar Settings")
	season = settings.active_season
	user = frappe.session.user

	def rows(doctype, fields, extra=None):
		return frappe.get_list(doctype, filters={**f, **(extra or {})}, fields=fields, limit_page_length=0)

	return {
		"server_time": server_time,
		"full": not since,
		"settings": {
			"season": season, "maund_kg": settings.maund_kg, "overlap_tolerance_pct": settings.overlap_tolerance_pct,
			"geofence_radius_m": settings.geofence_radius_m, "tracking_interval_s": settings.tracking_interval_s,
			"min_gps_accuracy_m": settings.min_gps_accuracy_m, "max_photo_mb": settings.max_photo_mb or 5,
			"company": settings.company, "mill_latitude": settings.mill_latitude, "mill_longitude": settings.mill_longitude,
		},
		"competitor_mills": rows("Competitor Mill", ["name", "short_name", "latitude", "longitude", "is_active", "modified"]),
		"circles": rows("Cane Circle", ["name", "circle_code", "zone", "latitude", "longitude", "polygon", "is_active",
			"modified"]),
		"sectors": rows("Cane Sector", ["name", "sector_name", "circle", "is_active", "modified"]),
		"villages": rows("Cane Village", ["name", "village_name", "village_code", "circle", "sector", "latitude",
			"longitude", "polygon", "is_active", "modified"]),
		"varieties": rows("Cane Variety", ["name", "variety_code", "maturity", "expected_yield", "map_color", "is_active",
			"modified"]),
		"diseases": rows("Crop Disease", ["name", "severity", "map_color", "modified"]),
		"growers": rows("Grower", ["name", "grower_name", "father_name", "cnic", "passbook_no", "mobile", "circle",
			"village", "disabled", "grower_photo", "modified"]),
		"targets": frappe.get_all("Surveyor Target", filters={"surveyor": user, "season": season},
			fields=["name", "circle", "from_date", "to_date", "target_acres", "target_surveys"]),
		"my_surveys": frappe.get_all("Cane Survey", filters={"surveyor": user, "season": season, "docstatus": 1, **f},
			fields=["name", "survey_uuid", "grower_name", "village", "variety", "calc_area_acres", "overlap_status",
				"survey_date"], limit_page_length=0),
	}


# ---------------------------------------------------------------- upload
@frappe.whitelist(methods=["POST"])
def upload(surveys: str | list | None = None, attendance: str | list | None = None,
		locations: str | list | None = None) -> dict:
	device = current_device()
	parse = lambda v: (json.loads(v) if isinstance(v, str) else v) or []  # noqa: E731
	surveys, attendance, locations = parse(surveys), parse(attendance), parse(locations)
	if len(surveys) + len(attendance) > MAX_BATCH:
		frappe.throw(_("Send at most {0} surveys + attendance records per batch").format(MAX_BATCH))
	return {
		"surveys": [_one(save_survey, item, device) for item in surveys],
		"attendance": [_one(save_attendance, item, device) for item in attendance],
		"locations": save_locations(locations, device),
		"server_time": str(now_datetime()),
	}


def _one(fn, item, device):
	uuid = (item or {}).get("uuid")
	if not uuid:
		return {"uuid": None, "status": "error", "message": "uuid missing"}
	frappe.db.savepoint("sync_item")
	try:
		name, status = fn(item, device)
		return {"uuid": uuid, "status": status, "name": name}
	except Exception as e:
		frappe.db.rollback(save_point="sync_item")
		message = frappe.utils.strip_html(str(getattr(e, "message", None) or e)) or e.__class__.__name__
		frappe.clear_messages()
		return {"uuid": uuid, "status": "error", "message": message}


def _save_file(content_b64, filename, doctype, name):
	max_mb = flt(frappe.db.get_single_value("Sugar Settings", "max_photo_mb")) or 5
	content = base64.b64decode(content_b64)
	if len(content) > max_mb * 1024 * 1024:
		frappe.throw(_("Photo {0} is larger than {1} MB").format(filename, max_mb))
	file = frappe.get_doc({"doctype": "File", "file_name": filename, "content": content, "attached_to_doctype": doctype,
		"attached_to_name": name, "is_private": 1})
	file.insert(ignore_permissions=True)
	return file.file_url


def save_survey(item, device):
	existing = frappe.db.get_value("Cane Survey", {"survey_uuid": item["uuid"]}, ["name", "docstatus"], as_dict=True)
	if existing:
		return existing.name, "duplicate"
	doc = frappe.new_doc("Cane Survey")
	doc.update({k: item.get(k) for k in SURVEY_FIELDS if item.get(k) not in (None, "")})
	doc.surveyor = frappe.session.user
	doc.device = device.name
	doc.survey_uuid = item["uuid"]
	doc.captured_at = get_datetime(item.get("captured_at")) if item.get("captured_at") else now_datetime()
	doc.synced_at = now_datetime()
	doc.polygon = as_feature_collection(item.get("polygon"))
	doc.insert()
	gp = item.get("grower_photo")
	if gp and gp.get("data"):
		doc.grower_photo = _save_file(gp["data"], gp.get("filename") or f"{item['uuid']}-grower.jpg", "Cane Survey", doc.name)
		doc.grower_photo_latitude, doc.grower_photo_longitude = gp.get("latitude"), gp.get("longitude")
		doc.grower_photo_taken_at = get_datetime(gp["taken_at"]) if gp.get("taken_at") else None
	for p in item.get("photos") or []:
		url = _save_file(p["data"], p.get("filename") or f"{p.get('uuid', 'photo')}.jpg", "Cane Survey", doc.name)
		doc.append("photos", {"photo": url, "caption": p.get("caption"), "latitude": p.get("latitude"),
			"longitude": p.get("longitude"), "taken_at": get_datetime(p["taken_at"]) if p.get("taken_at") else None,
			"photo_uuid": p.get("uuid")})
	if doc.photos or doc.grower_photo:
		doc.save()
	if item.get("submit", True):
		doc.submit()
	return doc.name, "created"


def save_attendance(item, device):
	name = frappe.db.get_value("Surveyor Attendance", {"attendance_uuid": item["uuid"]}, "name")
	if name:
		doc = frappe.get_doc("Surveyor Attendance", name)
		if item.get("time_out") and not doc.time_out:
			doc.time_out = get_datetime(item["time_out"])
			doc.latitude_out, doc.longitude_out = item.get("latitude_out"), item.get("longitude_out")
			doc.accuracy_out = item.get("accuracy_out")
			if item.get("selfie_out"):
				doc.selfie_out = _save_file(item["selfie_out"], f"{item['uuid']}-out.jpg", doc.doctype, doc.name)
			doc.save()
			return doc.name, "updated"
		return doc.name, "duplicate"
	doc = frappe.get_doc({
		"doctype": "Surveyor Attendance", "surveyor": frappe.session.user, "device": device.name,
		"attendance_uuid": item["uuid"], "time_in": get_datetime(item["time_in"]),
		"latitude_in": item.get("latitude_in"), "longitude_in": item.get("longitude_in"),
		"accuracy_in": item.get("accuracy_in"),
		"time_out": get_datetime(item["time_out"]) if item.get("time_out") else None,
		"latitude_out": item.get("latitude_out"), "longitude_out": item.get("longitude_out"),
		"accuracy_out": item.get("accuracy_out"), "remarks": item.get("remarks"),
	})
	doc.insert()
	if item.get("selfie_in"):
		doc.selfie_in = _save_file(item["selfie_in"], f"{item['uuid']}-in.jpg", doc.doctype, doc.name)
	if item.get("selfie_out"):
		doc.selfie_out = _save_file(item["selfie_out"], f"{item['uuid']}-out.jpg", doc.doctype, doc.name)
	doc.submit()
	return doc.name, "created"


def save_locations(items, device) -> dict:
	"""Bulk insert of GPS points; points already received (same uuid) are skipped."""
	items = [i for i in items if i.get("uuid") and i.get("latitude") is not None and i.get("longitude") is not None]
	if not items:
		return {"received": 0, "inserted": 0}
	known = set(frappe.get_all("Surveyor Location Log", filters={"log_uuid": ["in", [i["uuid"] for i in items]]},
		pluck="log_uuid"))
	now, user = now_datetime(), frappe.session.user
	fields = ["name", "surveyor", "logged_at", "latitude", "longitude", "accuracy_m", "speed_mps", "battery_pct",
		"device", "log_uuid", "owner", "modified_by", "creation", "modified", "docstatus", "is_demo"]
	values, seen = [], set()
	for i in items:
		if i["uuid"] in known or i["uuid"] in seen:
			continue
		seen.add(i["uuid"])
		values.append((frappe.generate_hash(length=12), user, get_datetime(i["logged_at"]), flt(i["latitude"]),
			flt(i["longitude"]), flt(i.get("accuracy")), flt(i.get("speed")), cint(i.get("battery")), device.name,
			i["uuid"], user, user, now, now, 0, 0))
	if values:
		frappe.db.bulk_insert("Surveyor Location Log", fields, values)
	return {"received": len(items), "inserted": len(values)}
