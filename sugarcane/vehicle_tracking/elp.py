"""ELP — Electronic Loading Point: vehicles loaded with cane are registered at a loading point or depot (phone app),
travel to the mill, and are accepted or rejected at the gate after their snapshots are compared.

Rules (all checked here, on the server, whatever the phone did):
- the user must be assigned to the point (Loading Point → Users / Cane Depot → Users), managers may use any point;
- the registration and its photos must be taken inside the point's geofence (boundary, else radius around its pin);
- photos must be sharp, not too dark / bright, not faded — and every required view must be present;
- the indent must be authorized / printed, valid on the day, for the point's circle, and not already on another load;
- a blacklisted vehicle, or one already in transit, is refused.
"""

from __future__ import annotations

import base64
import io

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, get_datetime, getdate, now_datetime

from sugarcane.calc import geo

MANAGERS = {"System Manager", "Cane Manager", "Cane Admin"}
GATE_ROLES = MANAGERS | {"Token Clerk", "Yard Supervisor"}
OPEN = ("In Transit", "Arrived")


# ---------------------------------------------------------------- settings
def settings() -> frappe._dict:
	s = frappe.get_cached_doc("Sugar Settings")
	views = [v.strip() for v in (s.get("elp_required_views") or "Number Plate\nIndent\nDriver\nBody Left").splitlines() if v.strip()]
	return frappe._dict(min_sharpness=flt(s.get("elp_min_sharpness") or 60), min_brightness=flt(s.get("elp_min_brightness") or 40),
		max_brightness=flt(s.get("elp_max_brightness") or 225), min_contrast=flt(s.get("elp_min_contrast") or 20),
		required_views=views, buffer_m=cint(s.get("elp_geofence_buffer_m") if s.get("elp_geofence_buffer_m") is not None else 30),
		require_indent=cint(s.get("elp_require_indent") if s.get("elp_require_indent") is not None else 1),
		overdue_grace_min=cint(s.get("elp_overdue_grace_min") or 60))


# ---------------------------------------------------------------- photo quality
def image_quality(content: bytes, cfg=None) -> dict:
	"""Sharpness (variance of the Laplacian on a 256-px grey copy — the same measure the phone uses), mean brightness
	and contrast (standard deviation of grey levels). Problems name what is wrong; ok = no problems."""
	import numpy as np
	from PIL import Image, ImageOps

	cfg = cfg or settings()
	try:
		img = ImageOps.exif_transpose(Image.open(io.BytesIO(content))).convert("L")
	except Exception:
		return {"ok": False, "sharpness": 0, "brightness": 0, "contrast": 0, "problems": [_("not a readable image")]}
	img.thumbnail((256, 256))
	g = np.asarray(img, dtype=np.float64)
	if g.shape[0] < 3 or g.shape[1] < 3:
		return {"ok": False, "sharpness": 0, "brightness": 0, "contrast": 0, "problems": [_("image too small")]}
	lap = g[1:-1, :-2] + g[1:-1, 2:] + g[:-2, 1:-1] + g[2:, 1:-1] - 4 * g[1:-1, 1:-1]
	sharp, bright, contrast = float(lap.var()), float(g.mean()), float(g.std())
	problems = []
	if sharp < cfg.min_sharpness:
		problems.append(_("blurred"))
	if bright < cfg.min_brightness:
		problems.append(_("too dark"))
	if bright > cfg.max_brightness:
		problems.append(_("too bright"))
	if contrast < cfg.min_contrast:
		problems.append(_("faded / unclear"))
	return {"ok": not problems, "sharpness": round(sharp, 1), "brightness": round(bright, 1), "contrast": round(contrast, 1),
		"problems": problems}


# ---------------------------------------------------------------- points
def point(point_type: str, name: str) -> frappe._dict:
	if point_type not in ("Loading Point", "Cane Depot"):
		frappe.throw(_("Point type must be Loading Point or Cane Depot"))
	title = "loading_point_name" if point_type == "Loading Point" else "depot_name"
	users_field = "lp_users" if point_type == "Loading Point" else "depot_users"
	d = frappe.get_doc(point_type, name)
	return frappe._dict(type=point_type, name=d.name, title=d.get(title) or d.name, circle=d.circle, source=d.source,
		latitude=flt(d.latitude), longitude=flt(d.longitude), radius_m=cint(d.geofence_radius_m) or 0, geofence=d.geofence,
		journey_min=cint(d.get("journey_to_mill_min")), active=cint(d.is_active),
		users={u.user for u in d.get(users_field) or []})


def can_use(p, user=None) -> bool:
	user = user or frappe.session.user
	return bool(MANAGERS & set(frappe.get_roles(user))) or user in p.users


def user_points(user=None) -> list[frappe._dict]:
	user = user or frappe.session.user
	manager = bool(MANAGERS & set(frappe.get_roles(user)))
	out = []
	for dt, child in (("Loading Point", "lp_users"), ("Cane Depot", "depot_users")):
		names = frappe.get_all(dt, filters={"is_active": 1}, pluck="name") if manager else frappe.get_all("Cane Depot User",
			filters={"parenttype": dt, "parentfield": child, "user": user}, pluck="parent", distinct=True)
		out += [point(dt, n) for n in names]
	return out


def geofence(p, lat, lng, buffer_m) -> tuple[bool, float | None]:
	"""(inside, metres from the point's pin). Boundary first; else the radius around the pin."""
	if not (lat and lng):
		return False, None
	dist = geo.distance_m(lat, lng, p.latitude, p.longitude) if p.latitude and p.longitude else None
	if p.geofence:
		try:
			poly = geo.polygon_of(p.geofence)
		except Exception:
			poly = None
		if poly is not None:
			return geo.contains_point(poly, lat, lng, buffer_m), dist
	if dist is not None and p.radius_m:
		return dist <= p.radius_m + buffer_m, dist
	return False, dist


def has_fence(p) -> bool:
	return bool(p.geofence or (p.latitude and p.longitude and p.radius_m))


def normalize_vehicle(no: str) -> str:
	"""Upper case, spaces as hyphens: "lea 1234" → LEA-1234."""
	import re

	return re.sub(r"-+", "-", re.sub(r"[^A-Z0-9-]", "-", (no or "").upper().strip())).strip("-")


def canon(no: str) -> str:
	"""Letters and digits only — how vehicle numbers are compared (LEA-1234 = LEA 1234 = LEA1234)."""
	return "".join(ch for ch in (no or "").upper() if ch.isalnum())


def _same_vehicle_sql(column: str) -> str:
	return f"replace(replace(upper({column}), '-', ''), ' ', '') = %(v)s"


# ---------------------------------------------------------------- validation (controller)
def validate_registration(doc):
	cfg = settings()
	p = point(doc.point_type, doc.loading_point if doc.point_type == "Loading Point" else doc.depot)
	doc.point_name, doc.circle, doc.source = p.title, p.circle, p.source
	doc.point_latitude, doc.point_longitude = p.latitude or None, p.longitude or None
	doc.vehicle_no = normalize_vehicle(doc.vehicle_no)
	if not doc.vehicle_no:
		frappe.throw(_("Vehicle number is missing"))
	if doc.is_new():
		if not p.active:
			frappe.throw(_("{0} is not active").format(p.title))
		if not can_use(p, doc.registered_by or frappe.session.user):
			frappe.throw(_("You are not assigned to {0}").format(p.title), frappe.PermissionError)
		if not has_fence(p):
			frappe.throw(_("{0} has no location / geofence yet — set it before vehicles can be registered there").format(p.title))
		inside, dist = geofence(p, flt(doc.latitude), flt(doc.longitude), cfg.buffer_m)
		doc.inside_geofence, doc.distance_from_point_m = cint(inside), dist
		if not inside:
			frappe.throw(_("Registration is allowed only at {0}: this phone was {1} m away").format(p.title,
				int(dist) if dist is not None else "?"), title=_("Outside the loading point"))
		_check_vehicle(doc)
		_check_indent(doc, p, cfg)
		_check_photos(doc, p, cfg, stage="Loading Point")
	if p.journey_min and doc.registered_at:
		doc.expected_arrival = add_to_date(get_datetime(doc.registered_at), minutes=p.journey_min)


def _check_vehicle(doc):
	hit = frappe.db.sql(f"select name from `tabSugar Vehicle` where {_same_vehicle_sql('registration_no')} limit 1",
		{"v": canon(doc.vehicle_no)})
	v = frappe.db.get_value("Sugar Vehicle", hit[0][0], ["name", "registration_no", "is_blacklisted", "blacklist_reason",
		"vehicle_type", "driver_name", "driver_cnic", "driver_mobile"], as_dict=True) if hit else None
	if v:
		if v.is_blacklisted:
			frappe.throw(_("Vehicle {0} is blacklisted: {1}").format(doc.vehicle_no, v.blacklist_reason or ""))
		doc.vehicle, doc.vehicle_no = v.name, v.registration_no
		for f in ("vehicle_type", "driver_name", "driver_cnic", "driver_mobile"):
			if not doc.get(f) and v.get(f):
				doc.set(f, v.get(f))
	busy = frappe.db.sql(f"""select name from `tabLP Vehicle Registration` where {_same_vehicle_sql('vehicle_no')}
		and status in ('In Transit', 'Arrived') and name != %(n)s limit 1""", {"v": canon(doc.vehicle_no), "n": doc.name or ""})
	busy = busy[0][0] if busy else None
	if busy:
		frappe.throw(_("Vehicle {0} is already on its way with registration {1}").format(doc.vehicle_no, busy))


def _check_indent(doc, p, cfg):
	if not doc.indent:
		if cfg.require_indent:
			frappe.throw(_("Choose the grower's indent for this load"))
		return
	i = frappe.db.get_value("Cane Indent", doc.indent, ["name", "docstatus", "status", "valid_from", "valid_to", "circle", "grower",
		"grower_name", "season"], as_dict=True)
	if not i:
		frappe.throw(_("Indent {0} not found").format(doc.indent))
	day = getdate(doc.registered_at)
	if i.docstatus != 1 or i.status not in ("Authorized", "Printed"):
		frappe.throw(_("Indent {0} can't be loaded: it is {1}").format(i.name, _(i.status)))
	if not getdate(i.valid_from) <= day <= getdate(i.valid_to):
		frappe.throw(_("Indent {0} is valid {1} – {2}, not on {3}").format(i.name, frappe.utils.formatdate(i.valid_from),
			frappe.utils.formatdate(i.valid_to), frappe.utils.formatdate(day)))
	if p.circle and i.circle != p.circle:
		frappe.throw(_("Indent {0} is for circle {1}; {2} loads for {3}").format(i.name, i.circle, p.title, p.circle))
	busy = frappe.db.get_value("LP Vehicle Registration", {"indent": i.name, "status": ["in", OPEN + ("Accepted",)],
		"name": ["!=", doc.name or ""]}, "name")
	if busy:
		frappe.throw(_("Indent {0} is already on load {1}").format(i.name, busy))
	doc.grower, doc.grower_name, doc.season = i.grower, i.grower_name, i.season


def _check_photos(doc, p, cfg, stage):
	rows = [r for r in doc.get("photos") or [] if r.stage == stage]
	bad = [f"{r.view}: {', '.join(r.get('problems') or [_('poor quality')])}" for r in rows if not cint(r.quality_ok)]
	if bad:
		frappe.throw(_("Retake these photos: {0}").format("; ".join(bad)), title=_("Photo quality"))
	if stage == "Loading Point":
		missing = [v for v in cfg.required_views if v not in {r.view for r in rows}]
		if missing:
			frappe.throw(_("Photos missing: {0}").format(", ".join(missing)))
		for r in rows:
			if r.latitude and r.longitude:
				inside, dist = geofence(p, flt(r.latitude), flt(r.longitude), cfg.buffer_m)
				if not inside:
					frappe.throw(_("The {0} photo was taken {1} m from {2} — photos are allowed only inside it").format(
						r.view, int(dist or 0), p.title))


# ---------------------------------------------------------------- photos
def add_photo(doc, stage: str, view: str, content: bytes, latitude=None, longitude=None, taken_at=None, cfg=None) -> dict:
	"""Score a photo, store it privately on the registration and add the row (the caller saves the document)."""
	cfg = cfg or settings()
	q = image_quality(content, cfg)
	max_mb = flt(frappe.db.get_single_value("Sugar Settings", "max_photo_mb")) or 5
	if len(content) > max_mb * 1024 * 1024:
		frappe.throw(_("Photo larger than {0} MB").format(max_mb))
	url = None
	if doc.name and not doc.is_new():
		f = frappe.get_doc({"doctype": "File", "file_name": f"{doc.name}-{stage[:4].lower()}-{frappe.scrub(view)}-{frappe.generate_hash(length=6)}.jpg",
			"content": content, "attached_to_doctype": doc.doctype, "attached_to_name": doc.name, "is_private": 1})
		f.insert(ignore_permissions=True)
		url = f.file_url
	row = doc.append("photos", {"stage": stage, "view": view, "photo": url, "sharpness": q["sharpness"], "brightness": q["brightness"],
		"contrast": q["contrast"], "quality_ok": cint(q["ok"]), "latitude": latitude, "longitude": longitude,
		"taken_at": get_datetime(taken_at) if taken_at else now_datetime()})
	row.problems = q["problems"]
	row._content = content
	return q


def _attach_pending(doc):
	"""Photos added before the document had a name: store their files now."""
	for r in doc.get("photos") or []:
		content = getattr(r, "_content", None)
		if content and not r.photo:
			f = frappe.get_doc({"doctype": "File", "file_name": f"{doc.name}-{r.stage[:4].lower()}-{frappe.scrub(r.view)}-{frappe.generate_hash(length=6)}.jpg",
				"content": content, "attached_to_doctype": doc.doctype, "attached_to_name": doc.name, "is_private": 1})
			f.insert(ignore_permissions=True)
			r.db_set("photo", f.file_url)


# ---------------------------------------------------------------- register (phone)
def register(item: dict, device=None) -> tuple[str, str]:
	"""Create a registration from the phone's record (idempotent on its uuid). Returns (name, status)."""
	existing = frappe.db.get_value("LP Vehicle Registration", {"registration_uuid": item["uuid"]}, "name")
	if existing:
		return existing, "duplicate"
	cfg = settings()
	doc = frappe.new_doc("LP Vehicle Registration")
	doc.update({k: item.get(k) for k in ("point_type", "loading_point", "depot", "indent", "vehicle_no", "vehicle_type", "driver_name",
		"driver_cnic", "driver_mobile", "latitude", "longitude", "gps_accuracy_m", "remarks", "serial_no", "cell_id") if item.get(k) not in (None, "")})
	doc.season = item.get("season") or frappe.db.get_single_value("Sugar Settings", "active_season")
	doc.registered_at = get_datetime(item.get("registered_at")) if item.get("registered_at") else now_datetime()
	doc.registration_uuid = item["uuid"]
	doc.registered_by = frappe.session.user
	doc.device = device.name if device else None
	doc.synced_at = now_datetime()
	for ph in item.get("photos") or []:
		add_photo(doc, "Loading Point", ph.get("view") or "Other", base64.b64decode(ph["data"]), ph.get("latitude"), ph.get("longitude"),
			ph.get("taken_at"), cfg)
	doc.insert()
	_attach_pending(doc)
	log("Registered", doc, _("{0} photos · indent {1}").format(len(doc.photos), doc.indent or "—"), doc.latitude, doc.longitude, doc.device)
	return doc.name, "created"


# ---------------------------------------------------------------- log
def log(event: str, doc=None, details: str | None = None, latitude=None, longitude=None, device=None, vehicle_no=None, point_name=None):
	"""Insert-only audit trail of every ELP step (also refusals, which leave no other record)."""
	frappe.get_doc({"doctype": "ELP Event Log", "event": event, "event_time": now_datetime(),
		"registration": doc.name if doc is not None and doc.get("name") and frappe.db.exists("LP Vehicle Registration", doc.name) else None,
		"vehicle_no": (doc.get("vehicle_no") if doc is not None else None) or vehicle_no,
		"point_name": (doc.get("point_name") if doc is not None else None) or point_name, "user": frappe.session.user,
		"device": device, "latitude": latitude, "longitude": longitude, "ip": getattr(frappe.local, "request_ip", None),
		"details": (details or "")[:1000]}).insert(ignore_permissions=True)


# ---------------------------------------------------------------- gate (arrival) and audit (verification)
AUDIT_ROLES = MANAGERS | {"ELP Auditor"}


def _gate_check():
	if not GATE_ROLES & set(frappe.get_roles()):
		frappe.throw(_("Only gate staff (Token Clerk / Yard Supervisor) or a Cane Manager can record arrivals"), frappe.PermissionError)


def _audit_check():
	if not AUDIT_ROLES & set(frappe.get_roles()):
		frappe.throw(_("Only the ELP audit team or a Cane Manager can accept or reject a load"), frappe.PermissionError)


def at_mill(lat, lng, cfg=None) -> tuple[bool, float | None]:
	"""Is a phone at the mill gate? Inside the premises (Sugar Settings → mill boundary) or near the mill pin."""
	s = frappe.get_cached_doc("Sugar Settings")
	buffer_m = cint(s.get("elp_gate_buffer_m") or 500)
	if not (lat and lng):
		return False, None
	dist = geo.distance_m(lat, lng, flt(s.mill_latitude), flt(s.mill_longitude)) if s.mill_latitude and s.mill_longitude else None
	if s.mill_boundary:
		try:
			poly = geo.polygon_of(s.mill_boundary)
			if poly is not None and geo.contains_point(poly, lat, lng, buffer_m):
				return True, dist
		except Exception:
			pass
	return (dist is not None and dist <= buffer_m), dist


def average_minutes(doc) -> int | None:
	"""Average journey of accepted loads from the same point over the last 90 days."""
	f = {"status": "Accepted", "transit_minutes": [">", 0], "name": ["!=", doc.name],
		"registered_at": [">=", frappe.utils.add_days(frappe.utils.nowdate(), -90)]}
	f["loading_point" if doc.point_type == "Loading Point" else "depot"] = doc.loading_point or doc.depot
	vals = frappe.get_all("LP Vehicle Registration", filters=f, pluck="transit_minutes", limit_page_length=500)
	return round(sum(vals) / len(vals)) if vals else None


def _mark_arrived(doc, now=None):
	now = now or now_datetime()
	doc.status, doc.arrived_at, doc.arrival_by = "Arrived", now, frappe.session.user
	doc.transit_minutes = int((now - get_datetime(doc.registered_at)).total_seconds() // 60)
	doc.late_minutes = max(0, int((now - get_datetime(doc.expected_arrival)).total_seconds() // 60)) if doc.expected_arrival else 0
	doc.average_minutes = average_minutes(doc)


def arrive(name: str, photos: list[dict] | None = None, latitude=None, longitude=None, cell_id=None, serial_no=None, device=None,
		arrived_at=None, arrival_uuid=None) -> frappe.model.document.Document:
	"""Gate arrival: photos at the gate (phone at the mill, or the gate PC), the journey time against the standard."""
	_gate_check()
	doc = frappe.get_doc("LP Vehicle Registration", name)
	if arrival_uuid and doc.arrival_uuid == arrival_uuid:
		return doc
	if doc.status != "In Transit":
		frappe.throw(_("{0} is {1}, not in transit").format(name, _(doc.status)))
	if latitude and longitude:
		ok, dist = at_mill(flt(latitude), flt(longitude))
		if not ok:
			frappe.throw(_("Arrival photos must be taken at the mill gate: this phone was {0} m from the mill").format(
				int(dist) if dist is not None else "?"), title=_("Not at the mill"))
	cfg = settings()
	for ph in photos or []:
		add_photo(doc, "Gate", ph.get("view") or "Front", base64.b64decode(ph["data"]), ph.get("latitude") or latitude,
			ph.get("longitude") or longitude, ph.get("taken_at") or arrived_at, cfg)
	bad = [r for r in doc.photos if r.stage == "Gate" and not cint(r.quality_ok)]
	if bad:
		frappe.throw(_("Retake the gate photo(s): {0}").format(", ".join(f"{r.view} ({', '.join(getattr(r, 'problems', []) or [])})" for r in bad)),
			title=_("Photo quality"))
	if not any(r.stage == "Gate" for r in doc.photos):
		frappe.throw(_("Take the arrival photos at the gate"))
	_mark_arrived(doc, get_datetime(arrived_at) if arrived_at else None)
	doc.update({"arrival_latitude": latitude, "arrival_longitude": longitude, "arrival_cell_id": cell_id, "arrival_serial_no": serial_no,
		"arrival_device": device, "arrival_uuid": arrival_uuid})
	doc.save(ignore_permissions=True)
	_attach_pending(doc)
	log("Arrived", doc, _("{0} min on the road (standard {1}, average {2})").format(doc.transit_minutes,
		frappe.db.get_value(doc.point_type, doc.loading_point or doc.depot, "journey_to_mill_min") or "—", doc.average_minutes or "—"),
		latitude, longitude, device)
	return doc


def decide(name: str, accept: bool, reason: str | None = None) -> frappe.model.document.Document:
	"""The audit team's verdict after comparing loading-point and gate photos. Accepting verifies the LP (the load really
	came from that point) and marks the indent used."""
	_audit_check()
	doc = frappe.get_doc("LP Vehicle Registration", name)
	if doc.status != "Arrived":
		frappe.throw(_("{0} is {1} — only an arrived vehicle (with gate photos) can be verified").format(name, _(doc.status)))
	if not accept and not (reason or "").strip():
		frappe.throw(_("Give the reason for rejecting the load"))
	now = now_datetime()
	doc.status = "Accepted" if accept else "Rejected"
	doc.decided_at, doc.decided_by = now, frappe.session.user
	doc.lp_verified = 1 if accept else 0
	if not accept:
		doc.reject_reason = reason
	doc.save(ignore_permissions=True)
	if accept and doc.indent:
		frappe.db.set_value("Cane Indent", doc.indent, {"status": "Used", "used_on": now, "token": doc.name}, update_modified=False)
	log("Accepted" if accept else "Rejected", doc, reason)
	from sugarcane.notify import elp_decided

	elp_decided(doc)
	return doc


def cancel(name: str, reason: str) -> None:
	doc = frappe.get_doc("LP Vehicle Registration", name)
	p = point(doc.point_type, doc.loading_point or doc.depot)
	if not (can_use(p) or doc.registered_by == frappe.session.user):
		frappe.throw(_("Not allowed"), frappe.PermissionError)
	if doc.status != "In Transit":
		frappe.throw(_("Only a vehicle still in transit can be cancelled"))
	doc.status = "Cancelled"
	doc.remarks = ((doc.remarks or "") + f"\nCancelled: {reason}").strip()
	doc.save(ignore_permissions=True)
	log("Cancelled", doc, reason)


def is_overdue(row, cfg=None, now=None) -> bool:
	cfg = cfg or settings()
	now = now or now_datetime()
	return row.status == "In Transit" and bool(row.expected_arrival) and \
		now > add_to_date(get_datetime(row.expected_arrival), minutes=cfg.overdue_grace_min)
