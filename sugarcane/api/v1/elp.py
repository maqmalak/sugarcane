"""ELP (Electronic Loading Point) API.

Phone app (same sign-in as EagleEye: sugarcane.api.v1.survey.login with app="Vehicle Tracking"):
  GET  sugarcane.api.v1.elp.masters          → the user's points (with geofence), vehicle types, vehicles, indents loadable now,
                                                photo rules
  POST sugarcane.api.v1.elp.upload           {registrations: [...]} — each with a client uuid (sent twice = stored once)
  GET  sugarcane.api.v1.elp.mine?days=3      → the user's registrations and what the gate decided (pending / arrived / rejected)
  POST sugarcane.api.v1.elp.cancel           {name, reason} — a load that did not leave after all

Gate and office (React):
  GET  lookup?q=   (registration no., indent no. or vehicle no.)     POST arrive {name, photos}     POST decide {name, accept, reason}
  GET  board?status=&point=&days=                                    GET  insights?days=
"""

import json
from collections import Counter, defaultdict

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_datetime, getdate, now_datetime, nowdate

from sugarcane.vehicle_tracking import elp

MAX_BATCH = 50
LIST_FIELDS = ["name", "status", "point_type", "loading_point", "depot", "point_name", "circle", "registered_at", "expected_arrival",
	"arrived_at", "decided_at", "indent", "grower", "grower_name", "vehicle_no", "vehicle_type", "driver_name", "reject_reason",
	"late_minutes", "transit_minutes", "registered_by", "token"]


def _parse(v):
	return (json.loads(v) if isinstance(v, str) else v) or []


# ---------------------------------------------------------------- phone
@frappe.whitelist(methods=["GET"])
def masters() -> dict:
	from sugarcane.api.v1.survey import current_device

	device = current_device()
	cfg = elp.settings()
	points = elp.user_points()
	circles = {p.circle for p in points if p.circle}
	today = getdate(nowdate())
	busy = set(frappe.get_all("LP Vehicle Registration", filters={"status": ["in", elp.OPEN + ("Accepted",)], "indent": ["is", "set"]},
		pluck="indent"))
	indents = [i for i in frappe.get_all("Cane Indent", filters={"docstatus": 1, "status": ["in", ["Authorized", "Printed"]],
		"circle": ["in", list(circles) or [""]], "valid_to": [">=", today], "valid_from": ["<=", add_days(today, 1)]},
		fields=["name", "grower", "grower_name", "father_name", "cnic", "circle", "village_name", "valid_from", "valid_to", "load_maund"],
		order_by="valid_from asc, name asc", limit_page_length=5000) if i.name not in busy]
	roles = set(frappe.get_roles())
	in_transit = []
	if elp.GATE_ROLES & roles:
		in_transit = frappe.get_all("LP Vehicle Registration", filters={"status": "In Transit"}, fields=["name", "vehicle_no", "point_name",
			"indent", "grower_name", "registered_at", "expected_arrival", "vehicle_type"], order_by="registered_at desc", limit_page_length=3000)
		for r in in_transit:
			r.registered_at, r.expected_arrival = str(r.registered_at), str(r.expected_arrival or "")
	s = frappe.get_cached_doc("Sugar Settings")
	return {
		"device": device.name, "server_time": str(now_datetime()),
		"can_register": bool(points), "can_gate": bool(elp.GATE_ROLES & roles), "in_transit": in_transit,
		"mill": {"latitude": s.mill_latitude, "longitude": s.mill_longitude, "boundary": s.mill_boundary,
			"buffer_m": cint(s.get("elp_gate_buffer_m") or 500)},
		"season": frappe.db.get_single_value("Sugar Settings", "active_season"),
		"points": [{"type": p.type, "name": p.name, "title": p.title, "circle": p.circle, "latitude": p.latitude, "longitude": p.longitude,
			"radius_m": p.radius_m, "geofence": p.geofence, "journey_min": p.journey_min} for p in points],
		"rules": {"min_sharpness": cfg.min_sharpness, "min_brightness": cfg.min_brightness, "max_brightness": cfg.max_brightness,
			"min_contrast": cfg.min_contrast, "required_views": cfg.required_views, "buffer_m": cfg.buffer_m, "require_indent": cfg.require_indent},
		"vehicle_types": frappe.get_all("Vehicle Type", filters={"is_active": 1}, pluck="name"),
		"vehicles": frappe.get_all("Sugar Vehicle", fields=["registration_no", "vehicle_type", "driver_name", "driver_cnic", "driver_mobile",
			"is_blacklisted"], limit_page_length=20000),
		"indents": [{**i, "valid_from": str(i.valid_from), "valid_to": str(i.valid_to)} for i in indents],
	}


def _logged(fn, item, device, event):
	"""Save one record; a refusal is logged (it leaves no other trace) and reported back to the phone."""
	from sugarcane.api.v1.survey import _one

	out = _one(fn, item, device)
	if out["status"] == "error":
		elp.log(event, None, out["message"], item.get("latitude"), item.get("longitude"), device.name,
			vehicle_no=elp.normalize_vehicle(item.get("vehicle_no") or ""), point_name=item.get("loading_point") or item.get("depot"))
	return out


def _arrival(item, device):
	name = item.get("registration")
	if not name:
		if item.get("indent"):
			name = frappe.db.get_value("LP Vehicle Registration", {"indent": item["indent"].upper(), "status": "In Transit"}, "name")
		if not name and item.get("vehicle_no"):
			hit = frappe.db.sql(f"""select name from `tabLP Vehicle Registration` where {elp._same_vehicle_sql('vehicle_no')}
				and status = 'In Transit' order by registered_at desc limit 1""", {"v": elp.canon(item["vehicle_no"])})
			name = hit[0][0] if hit else None
	if not name:
		dup = frappe.db.get_value("LP Vehicle Registration", {"arrival_uuid": item["uuid"]}, "name")
		if dup:
			return dup, "duplicate"
		frappe.throw(_("No vehicle in transit matches {0}").format(item.get("vehicle_no") or item.get("indent") or "?"))
	if frappe.db.get_value("LP Vehicle Registration", name, "arrival_uuid") == item["uuid"]:
		return name, "duplicate"
	doc = elp.arrive(name, item.get("photos"), item.get("latitude"), item.get("longitude"), item.get("cell_id"), item.get("serial_no"),
		device.name, item.get("arrived_at"), item["uuid"])
	return doc.name, "created"


@frappe.whitelist(methods=["POST"])
def upload(registrations: str | list | None = None, arrivals: str | list | None = None) -> dict:
	from sugarcane.api.v1.survey import current_device

	device = current_device()
	items, arr = _parse(registrations), _parse(arrivals)
	if len(items) + len(arr) > MAX_BATCH:
		frappe.throw(_("Send at most {0} records per batch").format(MAX_BATCH))
	return {"registrations": [_logged(elp.register, item, device, "Registration Refused") for item in items],
		"arrivals": [_logged(_arrival, item, device, "Arrival Refused") for item in arr],
		"server_time": str(now_datetime())}


@frappe.whitelist(methods=["GET"])
def mine(days: int = 3) -> list[dict]:
	cfg = elp.settings()
	rows = frappe.get_all("LP Vehicle Registration", filters={"registered_by": frappe.session.user,
		"registered_at": [">=", add_days(nowdate(), -max(cint(days), 1))]}, fields=LIST_FIELDS + ["registration_uuid"],
		order_by="registered_at desc", limit_page_length=500)
	for r in rows:
		r.overdue = elp.is_overdue(r, cfg)
	return rows


@frappe.whitelist(methods=["POST"])
def cancel(name: str, reason: str) -> dict:
	elp.cancel(name, reason)
	return {"name": name, "status": "Cancelled"}


# ---------------------------------------------------------------- gate / office
def _row(r, cfg, now):
	r.overdue = elp.is_overdue(r, cfg, now)
	if r.status == "In Transit" and r.expected_arrival:
		r.minutes_to_expected = int((get_datetime(r.expected_arrival) - now).total_seconds() // 60)
	return r


@frappe.whitelist(methods=["GET"])
def lookup(q: str) -> dict:
	"""A load by registration no., indent no. or vehicle no. (an open one first), with every photo for the comparison."""
	q = (q or "").strip()
	if not q:
		return {"found": False}
	name = None
	if frappe.db.exists("LP Vehicle Registration", q.upper()):
		name = q.upper()
	if not name:
		hit = frappe.get_list("LP Vehicle Registration", filters={"indent": q.upper()}, fields=["name", "status"],
			order_by="registered_at desc", limit_page_length=10)
		if not hit:
			names = [r[0] for r in frappe.db.sql(f"""select name from `tabLP Vehicle Registration` where {elp._same_vehicle_sql('vehicle_no')}
				order by registered_at desc limit 10""", {"v": elp.canon(q)})]
			hit = frappe.get_list("LP Vehicle Registration", filters={"name": ["in", names or [""]]}, fields=["name", "status"],
				order_by="registered_at desc")
		hit = sorted(hit, key=lambda h: h.status not in elp.OPEN)
		if hit:
			name = hit[0].name
	if not name:
		return {"found": False, "q": q}
	doc = frappe.get_doc("LP Vehicle Registration", name)
	doc.check_permission("read")
	cfg = elp.settings()
	row = _row(frappe._dict(doc.as_dict()), cfg, now_datetime())
	indent = frappe.db.get_value("Cane Indent", doc.indent, ["name", "status", "valid_from", "valid_to", "load_maund", "village_name"],
		as_dict=True) if doc.indent else None
	return {"found": True, "registration": row, "indent": indent,
		"photos": [{"stage": p.stage, "view": p.view, "url": p.photo, "sharpness": p.sharpness, "quality_ok": p.quality_ok,
			"latitude": p.latitude, "longitude": p.longitude, "taken_at": str(p.taken_at) if p.taken_at else None} for p in doc.photos],
		"grower_photo": frappe.db.get_value("Grower", doc.grower, "grower_photo") if doc.grower else None,
		"can_arrive": bool(elp.GATE_ROLES & set(frappe.get_roles())) and doc.status in elp.OPEN,
		"can_decide": bool(elp.AUDIT_ROLES & set(frappe.get_roles())) and doc.status == "Arrived",
		"standard_minutes": frappe.db.get_value(doc.point_type, doc.loading_point or doc.depot, "journey_to_mill_min"),
		"views": cfg.required_views}


@frappe.whitelist(methods=["POST"])
def arrive(name: str, photos: str | list | None = None) -> dict:
	doc = elp.arrive(name, _parse(photos))
	return {"name": doc.name, "status": doc.status, "late_minutes": doc.late_minutes}


@frappe.whitelist(methods=["POST"])
def add_gate_photo(name: str, view: str, data: str) -> dict:
	"""One gate snapshot (webcam or phone upload) scored and stored; a bad one is refused with the reason."""
	import base64

	elp._gate_check()
	doc = frappe.get_doc("LP Vehicle Registration", name)
	if doc.status not in elp.OPEN:
		frappe.throw(_("{0} is already {1}").format(name, _(doc.status)))
	q = elp.image_quality(base64.b64decode(data))
	if not q["ok"]:
		elp.log("Photo Refused", doc, f"Gate {view}: {', '.join(q['problems'])}")
		return {"ok": False, **q}
	elp.add_photo(doc, "Gate", view or "Front", base64.b64decode(data))
	arrived = doc.status == "In Transit"
	if arrived:
		elp._mark_arrived(doc)
	doc.save(ignore_permissions=True)
	elp._attach_pending(doc)
	elp.log("Arrived" if arrived else "Gate Photo", doc, f"Gate {view} photo from the gate PC")
	return {"ok": True, **q}


@frappe.whitelist(methods=["POST"])
def decide(name: str, accept: int | str, reason: str | None = None) -> dict:
	doc = elp.decide(name, bool(cint(accept)), reason)
	return {"name": doc.name, "status": doc.status}


@frappe.whitelist(methods=["POST"])
def verification_report(name: str):
	"""PDF: loading-point vs gate photos side by side, the two sets of details, and the audit status."""
	from sugarcane.vehicle_tracking.report_pdf import verification_pdf

	pdf = verification_pdf(name)
	frappe.local.response.filename = f"Verification {name}.pdf"
	frappe.local.response.filecontent = pdf
	frappe.local.response.type = "download"


@frappe.whitelist(methods=["GET"])
def board(status: str | None = None, point: str | None = None, days: int = 2, q: str | None = None) -> dict:
	"""Lists for the office: pending (in transit, overdue first), arrived, accepted, rejected — plus counts."""
	cfg = elp.settings()
	now = now_datetime()
	f = {"registered_at": [">=", add_days(nowdate(), -max(cint(days), 1))]}
	if point:
		f["point_name"] = point
	rows = frappe.get_list("LP Vehicle Registration", filters=f, fields=LIST_FIELDS, order_by="registered_at desc", limit_page_length=2000)
	rows = [_row(r, cfg, now) for r in rows]
	if q:
		t, c = q.strip().upper(), elp.canon(q)
		rows = [r for r in rows if (c and c in elp.canon(r.vehicle_no)) or t in (r.name or "") or t in (r.indent or "") or t in (r.grower_name or "").upper()]
	counts = Counter(r.status for r in rows)
	counts["Overdue"] = sum(1 for r in rows if r.overdue)
	if status == "Pending":
		rows = sorted([r for r in rows if r.status == "In Transit"], key=lambda r: (not r.overdue, str(r.expected_arrival or "")))
	elif status == "Overdue":
		rows = [r for r in rows if r.overdue]
	elif status:
		rows = [r for r in rows if r.status == status]
	return {"rows": rows[:500], "counts": dict(counts), "points": sorted({r.point_name for r in rows if r.point_name})}


@frappe.whitelist(methods=["GET"])
def insights(days: int = 7) -> dict:
	cfg = elp.settings()
	now = now_datetime()
	since = add_days(nowdate(), -max(cint(days), 1) + 1)
	rows = [_row(r, cfg, now) for r in frappe.get_list("LP Vehicle Registration", filters={"registered_at": [">=", since]},
		fields=LIST_FIELDS, limit_page_length=20000)]
	status = Counter(r.status for r in rows)
	by_day = defaultdict(lambda: Counter())
	for r in rows:
		by_day[str(getdate(r.registered_at))][r.status] += 1
	# the chart ends today, or on the latest load when loads are registered for later days (pre-season demo data)
	end = max([getdate(nowdate())] + [getdate(r.registered_at) for r in rows])
	start = add_days(end, -max(cint(days), 1) + 1)
	trend = [{"date": str(add_days(start, i)), **{k: by_day[str(add_days(start, i))].get(k, 0)
		for k in ("In Transit", "Arrived", "Accepted", "Rejected", "Cancelled")}} for i in range(max(cint(days), 1))]
	by_point = defaultdict(lambda: {"registered": 0, "accepted": 0, "rejected": 0, "in_transit": 0, "overdue": 0, "transit": []})
	for r in rows:
		p = by_point[r.point_name or "—"]
		p["registered"] += 1
		p["accepted"] += r.status == "Accepted"
		p["rejected"] += r.status == "Rejected"
		p["in_transit"] += r.status == "In Transit"
		p["overdue"] += bool(r.overdue)
		if r.transit_minutes:
			p["transit"].append(r.transit_minutes)
	points = [{"name": k, **{x: v[x] for x in ("registered", "accepted", "rejected", "in_transit", "overdue")},
		"avg_transit": round(sum(v["transit"]) / len(v["transit"])) if v["transit"] else None} for k, v in sorted(by_point.items())]
	reasons = Counter((r.reject_reason or "").strip().split("\n")[0][:60] for r in rows if r.status == "Rejected")
	hours = Counter(get_datetime(r.registered_at).hour for r in rows)
	decided = status.get("Accepted", 0) + status.get("Rejected", 0)
	highlights = []
	overdue = sum(1 for r in rows if r.overdue)
	if overdue:
		highlights.append({"tone": "bad", "text": _("{0} vehicle(s) are overdue at the mill").format(overdue)})
	if decided:
		rate = round(100 * status.get("Rejected", 0) / decided, 1)
		highlights.append({"tone": "warn" if rate > 5 else "good", "text": _("{0}% of loads were rejected at the gate").format(rate)})
	late = [r.late_minutes for r in rows if r.late_minutes]
	if late:
		highlights.append({"tone": "info", "text": _("{0} load(s) arrived late, on average {1} min after the standard time").format(len(late),
			round(sum(late) / len(late)))})
	today = getdate(nowdate())
	busy = set(frappe.get_all("LP Vehicle Registration", filters={"status": ["!=", "Cancelled"], "indent": ["is", "set"]}, pluck="indent"))
	pending_reg = [i for i in frappe.get_list("Cane Indent", filters={"docstatus": 1, "status": ["in", ["Authorized", "Printed"]],
		"valid_from": ["<=", today], "valid_to": [">=", today]}, pluck="name", limit_page_length=0) if i not in busy]
	not_arrived_h = cint(frappe.db.get_single_value("Sugar Settings", "elp_not_arrived_hours") or 48)
	stale = sum(1 for r in rows if r.status == "In Transit" and (now - get_datetime(r.registered_at)).total_seconds() > not_arrived_h * 3600)
	s = frappe.get_cached_doc("Sugar Settings")
	on_road = [{"name": r.name, "vehicle_no": r.vehicle_no, "point": r.point_name, "overdue": r.overdue,
		"lat": frappe.db.get_value("LP Vehicle Registration", r.name, "latitude"), "lng": frappe.db.get_value("LP Vehicle Registration", r.name, "longitude"),
		"expected": str(r.expected_arrival or "")} for r in rows if r.status == "In Transit"][:300]
	pins = []
	for dt, title in (("Loading Point", "loading_point_name"), ("Cane Depot", "depot_name")):
		for p in frappe.get_list(dt, filters={"is_active": 1}, fields=["name", title, "latitude", "longitude", "journey_to_mill_min"], limit_page_length=0):
			if p.latitude and p.longitude:
				pins.append({"type": dt, "name": p.name, "title": p.get(title) or p.name, "lat": p.latitude, "lng": p.longitude,
					"journey_min": p.journey_to_mill_min})
	return {"days": cint(days), "mill": {"lat": s.mill_latitude, "lng": s.mill_longitude}, "on_road": on_road, "pins": pins,
		"pending_registrations": len(pending_reg), "not_arrived_hours": not_arrived_h, "not_arrived": stale,
		"kpis": {"registered": len(rows), "in_transit": status.get("In Transit", 0), "arrived": status.get("Arrived", 0),
		"accepted": status.get("Accepted", 0), "rejected": status.get("Rejected", 0), "overdue": overdue,
		"avg_transit": round(sum(r.transit_minutes for r in rows if r.transit_minutes) / max(1, sum(1 for r in rows if r.transit_minutes)))},
		"status": [{"name": k, "value": v} for k, v in status.most_common()], "trend": trend, "points": points,
		"reasons": [{"name": k or "—", "value": v} for k, v in reasons.most_common(8)],
		"hours": [{"hour": h, "count": hours.get(h, 0)} for h in range(24)], "highlights": highlights}
