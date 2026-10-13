"""Phase 1 demo: hierarchy pins/boundaries, surveyors (devices, targets, scopes), surveys with a few deliberate
overlaps, competitor fields, attendance and GPS tracks for the last 12 days. Called from sugarcane.setup.demo.run."""

import json
import math
import random

import frappe
from frappe.utils import add_days, add_to_date, flt, get_datetime, getdate, nowdate
from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union

from sugarcane.calc import geo
from sugarcane.calc.units import SQ_M_PER_ACRE

SEED = 2027
SEASON = "2026-27"
DOMAIN = "micromaxsugar.example"
SURVEYORS = (  # prefix, first, last, circles
	("surveyor", "Adeel", "Haider", ("Bhalwal", "Phularwan")),
	("surveyor.kot", "Bilal", "Sarwar", ("Kot Momin", "Midh Ranjha")),
	("surveyor.sillanwali", "Hamza", "Javed", ("Sillanwali", "Sahiwal")),
	("surveyor.jauharabad", "Junaid", "Akram", ("Jauharabad", "Quaidabad")),
	("surveyor.shorkot", "Qasim", "Riaz", ("Shorkot", "Ahmedpur Sial")),
	("surveyor.athara", "Waqas", "Nadeem", ("Athara Hazari", "Chiniot Road")),
)
COMPETITORS = ("Al-Noor Sugar Mills", "Shakarganj Sugar", "Hamza Sugar Mills")
SURVEY_FROM, SURVEY_TO = "2026-08-15", "2026-10-12"
PHASE1_DOCTYPES = ("Survey Overlap Review", "Cane Survey", "Surveyor Attendance", "Surveyor Location Log",
	"Surveyor Target", "Survey Device")


def _fc(geom):
	return json.dumps(geo.feature_collection(geom))


def _poly(text):
	return geo.polygon_of(text) if text else None


# ---------------------------------------------------------------- hierarchy geography
def hierarchy_geo():
	"""Sector, zone, district and division boundaries = the outline around their children (buffered a little)."""
	def save(dt, name, geom):
		doc = frappe.get_doc(dt, name)
		doc.polygon = _fc(geom.simplify(0.0005))
		doc.latitude = doc.longitude = None
		doc.flags.ignore_permissions = True
		doc.save()

	for v in frappe.get_all("Cane Village", filters={"is_demo": 1}, pluck="name"):
		doc = frappe.get_doc("Cane Village", v)  # re-save: computes area, keeps pin
		doc.flags.ignore_permissions = True
		doc.save()
	for c in frappe.get_all("Cane Circle", filters={"is_demo": 1}, pluck="name"):
		doc = frappe.get_doc("Cane Circle", c)
		doc.latitude = doc.longitude = None
		doc.flags.ignore_permissions = True
		doc.save()
	for s in frappe.get_all("Cane Sector", filters={"is_demo": 1}, pluck="name"):
		polys = [_poly(p) for p in frappe.get_all("Cane Village", filters={"sector": s}, pluck="polygon") if p]
		if polys:
			save("Cane Sector", s, unary_union(polys).convex_hull.buffer(0.002))
	for z in frappe.get_all("Sugar Zone", filters={"is_demo": 1}, pluck="name"):
		polys = [_poly(p) for p in frappe.get_all("Cane Circle", filters={"zone": z}, pluck="polygon") if p]
		if polys:
			save("Sugar Zone", z, unary_union(polys).convex_hull.buffer(0.01))
	for d in frappe.get_all("Sugar District", filters={"is_demo": 1}, pluck="name"):
		polys = [_poly(p) for p in frappe.get_all("Sugar Zone", filters={"district": d}, pluck="polygon") if p]
		if polys:
			save("Sugar District", d, unary_union(polys).convex_hull.buffer(0.01))
	for d in frappe.get_all("Sugar Division", filters={"is_demo": 1}, pluck="name"):
		polys = [_poly(p) for p in frappe.get_all("Sugar District", filters={"division": d}, pluck="polygon") if p]
		if polys:
			save("Sugar Division", d, unary_union(polys).convex_hull.buffer(0.01))


# ---------------------------------------------------------------- people and devices
def surveyors(password=None):
	from frappe.utils.password import update_password

	out = []
	for i, (prefix, first, last, circles) in enumerate(SURVEYORS):
		email = f"{prefix}@{DOMAIN}"
		if not frappe.db.exists("User", email):
			user = frappe.get_doc({"doctype": "User", "email": email, "first_name": first, "last_name": last,
				"send_welcome_email": 0, "user_type": "System User", "time_zone": "Asia/Karachi"})
			user.flags.no_welcome_mail = True
			user.insert(ignore_permissions=True)
			if password:
				update_password(email, password)
		user = frappe.get_doc("User", email)
		if "Surveyor" not in {r.role for r in user.roles}:
			user.add_roles("Surveyor")
		for circle in circles:
			if not frappe.db.exists("User Permission", {"user": email, "allow": "Cane Circle", "for_value": circle}):
				frappe.get_doc({"doctype": "User Permission", "user": email, "allow": "Cane Circle", "for_value": circle,
					"apply_to_all_doctypes": 1}).insert(ignore_permissions=True)
			if not frappe.db.exists("Surveyor Target", {"surveyor": email, "season": SEASON, "circle": circle}):
				frappe.get_doc({"doctype": "Surveyor Target", "season": SEASON, "surveyor": email, "circle": circle,
					"from_date": SURVEY_FROM, "to_date": "2026-10-31", "target_acres": 900, "target_surveys": 60,
					"is_demo": 1}).insert(ignore_permissions=True)
		android_id = f"demo{i + 1:04d}a1b2c3d4"
		if not frappe.db.exists("Survey Device", {"android_id": android_id}):
			frappe.get_doc({"doctype": "Survey Device", "android_id": android_id, "device_name": f"Galaxy A14 #{i + 1}",
				"app": "EagleEye", "status": "Approved", "assigned_user": email, "app_version": "1.0.0",
				"os_version": "14", "registered_on": "2026-08-10 09:00:00", "is_demo": 1}).insert(ignore_permissions=True)
		out.append((email, circles, frappe.db.get_value("Survey Device", {"android_id": android_id}, "name")))
	return out


# ---------------------------------------------------------------- surveys
def _field(rnd, village_poly, acres, taken):
	"""A rectangle of `acres` inside the village square, avoiding fields already placed (most of the time)."""
	minx, miny, maxx, maxy = village_poly.bounds
	lat0 = (miny + maxy) / 2
	side_m = math.sqrt(acres * SQ_M_PER_ACRE)
	ratio = rnd.uniform(0.6, 1.6)
	w_m, h_m = side_m * ratio, side_m / ratio
	w, h = w_m / (111_320 * math.cos(math.radians(lat0))), h_m / 110_540
	for _ in range(25):
		x = rnd.uniform(minx, maxx - w)
		y = rnd.uniform(miny, maxy - h)
		cand = Polygon([(x, y), (x + w, y), (x + w, y + h), (x, y + h)])
		angle = rnd.uniform(-12, 12)
		from shapely import affinity

		cand = affinity.rotate(cand, angle, origin="centroid")
		if not any(cand.intersects(t) for t in taken):
			return cand
	return cand


def surveys(rnd, people):
	if frappe.db.count("Cane Survey", {"is_demo": 1, "survey_for": "Company"}):
		return
	by_circle = {c: (email, device) for email, circles, device in people for c in circles}
	varieties = [v.name for v in frappe.get_all("Cane Variety", filters={"is_demo": 1}, fields=["name"])]
	weights = [18, 12, 16, 10, 6, 14, 8, 6, 5, 5][: len(varieties)]
	diseases = frappe.get_all("Crop Disease", filters={"is_demo": 1}, pluck="name")
	villages = {v.name: v for v in frappe.get_all("Cane Village", filters={"is_demo": 1}, fields=["name", "circle", "polygon"])}
	village_poly = {k: _poly(v.polygon) for k, v in villages.items()}
	taken = {k: [] for k in villages}
	growers = frappe.get_all("Grower", filters={"is_demo": 1}, fields=["name", "circle", "village"], order_by="name")
	start, days = getdate(SURVEY_FROM), (getdate(SURVEY_TO) - getdate(SURVEY_FROM)).days
	made = []
	for n, g in enumerate(growers):
		if rnd.random() > 0.78:
			continue
		for k in range(rnd.choice((1, 1, 1, 2))):
			acres = rnd.choice((1, 1.5, 2, 2.5, 3, 4, 5, 6))
			poly = _field(rnd, village_poly[g.village], acres, taken[g.village])
			taken[g.village].append(poly)
			surveyor, device = by_circle.get(g.circle, (None, None))
			diseased = rnd.random() < 0.12
			ratoon = rnd.random() < 0.22
			measured = geo.area_acres(poly)
			declared = round(measured * rnd.uniform(0.9, 1.12), 2)
			doc = frappe.get_doc({
				"doctype": "Cane Survey", "season": SEASON, "survey_for": "Company", "grower": g.name,
				"circle": g.circle, "village": g.village, "survey_date": add_days(start, rnd.randint(0, days)),
				"surveyor": surveyor or "Administrator", "device": device,
				"murabba_no": str(rnd.randint(1, 180)), "killa_no": str(rnd.randint(1, 25)),
				"crop_land_acres": declared, "empty_land_acres": rnd.choice((0, 0, 0.5, 1)),
				"variety": rnd.choices(varieties, weights=weights)[0],
				"crop_type": "Ratoon" if ratoon else "Plant", "ratoon_no": rnd.choice((1, 1, 2)) if ratoon else 0,
				"crop_condition": rnd.choices(("Good", "Average", "Poor"), weights=(60, 30, 10))[0],
				"disease": rnd.choice(diseases) if diseased else None,
				"disease_pct": rnd.choice((5, 10, 15, 20, 30)) if diseased else 0,
				"polygon": _fc(poly), "gps_accuracy_m": rnd.choice((3, 4, 5, 6, 8)),
				"survey_uuid": frappe.generate_hash(length=24), "is_demo": 1,
			})
			doc.flags.ignore_permissions = True
			doc.insert()
			doc.submit()
			made.append(doc)
		if n % 50 == 49:
			frappe.db.commit()
	# deliberate overlaps: another grower in the same village surveys most of an existing field
	for doc in rnd.sample(made, 6):
		other = next((g for g in growers if g.village == doc.village and g.name != doc.grower), None)
		if not other:
			continue
		poly = _poly(doc.polygon)
		from shapely import affinity

		shifted = affinity.translate(poly, xoff=(poly.bounds[2] - poly.bounds[0]) * 0.35, yoff=0)
		dup = frappe.get_doc({**{k: doc.get(k) for k in ("season", "circle", "village", "variety", "crop_type",
			"surveyor", "device", "survey_date")}, "doctype": "Cane Survey", "survey_for": "Company", "grower": other.name,
			"crop_land_acres": round(geo.area_acres(shifted), 2), "polygon": _fc(shifted),
			"survey_uuid": frappe.generate_hash(length=24), "is_demo": 1, "remarks": "Demo: overlapping field"})
		dup.flags.ignore_permissions = True
		dup.insert()
		dup.submit()
	# competitor fields
	for _ in range(45):
		vname = rnd.choice(list(villages))
		poly = _field(rnd, village_poly[vname], rnd.choice((2, 3, 4, 5)), taken[vname])
		taken[vname].append(poly)
		circle = villages[vname].circle
		surveyor, device = by_circle.get(circle, (None, None))
		doc = frappe.get_doc({"doctype": "Cane Survey", "season": SEASON, "survey_for": "Competitor",
			"competitor_mill": rnd.choice(COMPETITORS), "circle": circle, "village": vname,
			"survey_date": add_days(start, rnd.randint(0, days)), "surveyor": surveyor or "Administrator", "device": device,
			"crop_land_acres": round(geo.area_acres(poly), 2), "variety": rnd.choice(varieties), "crop_type": "Plant",
			"polygon": _fc(poly), "survey_uuid": frappe.generate_hash(length=24), "is_demo": 1})
		doc.flags.ignore_permissions = True
		doc.insert()
		doc.submit()
	frappe.db.commit()


# ---------------------------------------------------------------- attendance and tracks
def attendance(rnd, people, days=12):
	today = getdate(nowdate())
	if frappe.db.count("Surveyor Attendance", {"is_demo": 1, "attendance_date": [">=", add_days(today, -days)]}):
		return
	circle_poly = {c.name: _poly(c.polygon) for c in frappe.get_all("Cane Circle", fields=["name", "polygon"])}
	fields = ["name", "surveyor", "logged_at", "latitude", "longitude", "accuracy_m", "speed_mps", "battery_pct",
		"device", "log_uuid", "owner", "modified_by", "creation", "modified", "docstatus", "is_demo"]
	for email, circles, device in people:
		for d in range(days, -1, -1):
			day = add_days(today, -d)
			if d and rnd.random() < 0.08:  # day off
				continue
			poly = circle_poly[circles[d % len(circles)]]
			minx, miny, maxx, maxy = poly.bounds
			out_of_area = rnd.random() < 0.05
			lat, lng = (rnd.uniform(miny, maxy), rnd.uniform(minx, maxx)) if not out_of_area else (miny - 0.05, minx - 0.05)
			t_in = get_datetime(f"{day} 08:{rnd.randint(0, 45):02d}:00")
			hours = rnd.choice((7.5, 8, 8.5, 9)) if rnd.random() > 0.1 else rnd.uniform(2.5, 3.8)
			t_out = add_to_date(t_in, hours=hours)
			still_out = d == 0  # today: checked in this morning, still in the field
			if still_out:
				t_out = min(t_out, get_datetime())
			# track: a wander every 5 minutes
			values, now = [], get_datetime()
			plat, plng, t, battery = lat, lng, t_in, 98
			while t < t_out:
				plat = min(max(plat + rnd.uniform(-0.0012, 0.0012), miny), maxy)
				plng = min(max(plng + rnd.uniform(-0.0012, 0.0012), minx), maxx)
				battery = max(15, battery - rnd.choice((0, 0, 1)))
				values.append((frappe.generate_hash(length=12), email, t, round(plat, 6), round(plng, 6),
					rnd.choice((4, 5, 6, 8, 12)), round(rnd.uniform(0, 1.6), 2), battery, device,
					frappe.generate_hash(length=20), email, email, now, now, 0, 1))
				t = add_to_date(t, minutes=5)
			frappe.db.bulk_insert("Surveyor Location Log", fields, values)
			doc = frappe.get_doc({"doctype": "Surveyor Attendance", "surveyor": email, "device": device,
				"time_in": t_in, "latitude_in": round(lat, 6), "longitude_in": round(lng, 6), "accuracy_in": 5,
				**({} if still_out else {"time_out": t_out, "latitude_out": round(plat, 6), "longitude_out": round(plng, 6),
					"accuracy_out": 6}),
				"circle": circles[d % len(circles)], "attendance_uuid": frappe.generate_hash(length=24), "is_demo": 1})
			doc.flags.ignore_permissions = True
			doc.insert()
			doc.submit()
		frappe.db.commit()


def run(password=None):
	rnd = random.Random(SEED)
	hierarchy_geo()
	people = surveyors(password)
	surveys(rnd, people)
	attendance(rnd, people)
	frappe.db.commit()


def reset():
	"""Removes Phase 1 demo records (submitted ones too) in bulk."""
	from sugarcane.setup.demo import _purge

	for dt in PHASE1_DOCTYPES:
		_purge(dt, frappe.get_all(dt, filters={"is_demo": 1}, pluck="name"))
	frappe.db.commit()
