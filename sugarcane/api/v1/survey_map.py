"""React Survey Map, Survey Dashboard and the hierarchy map editor (pins and boundaries).

Everything goes through frappe.get_list, so DocPerms and the user's circle User Permissions decide what is visible.
"""

import json
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, nowdate

from sugarcane import geo as hierarchy
from sugarcane.calc import geo

LEVEL_FIELDS = {
	"Sugar Division": ["name", "division_code as code", "latitude", "longitude", "polygon", "area_acres"],
	"Sugar District": ["name", "division as parent", "latitude", "longitude", "polygon", "area_acres"],
	"Sugar Zone": ["name", "district as parent", "is_free_area", "latitude", "longitude", "polygon", "area_acres"],
	"Cane Circle": ["name", "circle_code as code", "zone as parent", "affiliation", "quality_grade", "latitude",
		"longitude", "polygon", "area_acres"],
	"Cane Sector": ["name", "sector_name as title", "circle as parent", "latitude", "longitude", "polygon", "area_acres"],
	"Cane Village": ["name", "village_name as title", "village_code as code", "circle", "sector", "latitude",
		"longitude", "polygon", "area_acres"],
}
# editable on the Area Map besides the hierarchy (no parent)
EXTRA_GEO = {"Competitor Mill": ["name", "short_name as title", "latitude", "longitude", "polygon", "area_acres"]}
SETTINGS_GEO = {"latitude": "mill_latitude", "longitude": "mill_longitude", "polygon": "mill_boundary"}
SURVEY_FIELDS = ["name", "grower", "grower_name", "survey_for", "competitor_mill", "grower_category", "circle", "village", "village_name",
	"sector", "variety", "crop_type", "disease", "disease_pct", "crop_condition", "calc_area_acres", "crop_land_acres",
	"expected_production_maund", "surveyor", "survey_date", "overlap_status", "latitude", "longitude", "polygon"]


def _can_read(doctype):
	return frappe.has_permission(doctype, "read")


# ---------------------------------------------------------------- layers
@frappe.whitelist(methods=["GET"])
def meta() -> dict:
	"""Filter options and colours for the map legend."""
	settings = frappe.get_cached_doc("Sugar Settings")
	return {
		"season": settings.active_season,
		"seasons": frappe.get_list("Crushing Season", fields=["name", "status"], order_by="start_date desc"),
		"varieties": frappe.get_list("Cane Variety", fields=["name", "map_color", "maturity"], order_by="name"),
		"diseases": frappe.get_list("Crop Disease", fields=["name", "map_color", "severity"], order_by="name"),
		"circles": frappe.get_list("Cane Circle", fields=["name", "circle_code", "zone"], order_by="circle_code"),
		"villages": frappe.get_list("Cane Village", fields=["name", "village_name", "circle"], order_by="name",
			limit_page_length=0),
		"surveyors": frappe.get_all("Has Role", filters={"role": "Surveyor", "parenttype": "User"}, pluck="parent",
			distinct=True),
		"competitor_mills": frappe.get_list("Competitor Mill", fields=["name", "short_name", "map_color"],
			filters={"is_active": 1}, order_by="name"),
		"centre": _centre(),
	}


@frappe.whitelist(methods=["GET"])
def mills() -> dict:
	"""The company mill and competitor mills as map features (pins, plus premises when drawn)."""
	s = frappe.get_cached_doc("Sugar Settings")
	features = []
	if s.mill_latitude and s.mill_longitude:
		features.append({"type": "Feature", "id": "company", "geometry": {"type": "Point", "coordinates": [s.mill_longitude, s.mill_latitude]},
			"properties": {"kind": "company", "name": s.company, "title": s.company}})
	for g in geo.geometries(s.mill_boundary) if s.mill_boundary else []:
		if g["type"] in ("Polygon", "MultiPolygon"):
			features.append({"type": "Feature", "geometry": g, "properties": {"kind": "company", "name": s.company, "title": s.company}})
	for m in frappe.get_list("Competitor Mill", filters={"is_active": 1}, fields=["name", "short_name", "latitude", "longitude",
			"crushing_capacity_tcd", "map_color", "polygon"], limit_page_length=0):
		props = {"kind": "competitor", "name": m.name, "title": m.short_name or m.name, "tcd": m.crushing_capacity_tcd,
			"color": m.map_color or "#e03131"}
		if m.latitude and m.longitude:
			features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [m.longitude, m.latitude]}, "properties": props})
		for g in geo.geometries(m.polygon) if m.polygon else []:
			if g["type"] in ("Polygon", "MultiPolygon"):
				features.append({"type": "Feature", "geometry": g, "properties": props})
	return {"type": "FeatureCollection", "features": features}


def _centre():
	rows = frappe.get_list("Cane Circle", fields=["latitude", "longitude"], filters={"latitude": ["is", "set"]},
		limit_page_length=0)
	if not rows:
		return {"lat": 30.3753, "lng": 69.3451, "zoom": 6}  # Pakistan
	return {"lat": sum(r.latitude for r in rows) / len(rows), "lng": sum(r.longitude for r in rows) / len(rows), "zoom": 9}


@frappe.whitelist(methods=["GET"])
def boundaries(levels: str | None = None) -> dict:
	"""{doctype: FeatureCollection} for the hierarchy levels asked for (all by default)."""
	wanted = json.loads(levels) if levels else list(LEVEL_FIELDS)
	out = {}
	for dt in wanted:
		if dt not in LEVEL_FIELDS or not _can_read(dt):
			continue
		rows = frappe.get_list(dt, fields=LEVEL_FIELDS[dt], limit_page_length=0)
		out[dt] = {"type": "FeatureCollection",
			"features": [f for f in (hierarchy.feature(dt, r) for r in rows) if f]}
	return out


def _survey_filters(season=None, circle=None, village=None, variety=None, disease=None, surveyor=None,
		from_date=None, to_date=None, crop_type=None, survey_for=None, overlap_status=None, competitor_mill=None,
		grower_category=None):
	f = {"docstatus": 1, "season": season or frappe.db.get_single_value("Sugar Settings", "active_season")}
	for key, value in (("circle", circle), ("village", village), ("variety", variety), ("surveyor", surveyor),
			("crop_type", crop_type), ("survey_for", survey_for), ("overlap_status", overlap_status),
			("competitor_mill", competitor_mill), ("grower_category", grower_category)):
		if value:
			f[key] = value
	if disease == "__any__":
		f["disease"] = ["is", "set"]
	elif disease == "__none__":
		f["disease"] = ["is", "not set"]
	elif disease:
		f["disease"] = disease
	if from_date and to_date:
		f["survey_date"] = ["between", [from_date, to_date]]
	elif from_date:
		f["survey_date"] = [">=", from_date]
	elif to_date:
		f["survey_date"] = ["<=", to_date]
	return f


@frappe.whitelist(methods=["GET"])
def surveys(**filters) -> dict:
	"""Submitted surveys as a FeatureCollection (boundary, or a point when a survey has none) plus totals."""
	allowed = {"season", "circle", "village", "variety", "disease", "surveyor", "from_date", "to_date", "crop_type",
		"survey_for", "overlap_status", "competitor_mill", "grower_category"}
	filters = {k: v for k, v in filters.items() if k in allowed and v not in (None, "")}
	rows = frappe.get_list("Cane Survey", filters=_survey_filters(**filters), fields=SURVEY_FIELDS,
		limit_page_length=0, order_by="survey_date desc")
	features, totals = [], defaultdict(float)
	for r in rows:
		geom = None
		if r.polygon:
			polys = [g for g in geo.geometries(r.polygon) if g["type"] in ("Polygon", "MultiPolygon")]
			geom = polys[0] if polys else None
		if geom is None and r.latitude and r.longitude:
			geom = {"type": "Point", "coordinates": [r.longitude, r.latitude]}
		props = {k: v for k, v in r.items() if k != "polygon"}
		props["survey_date"] = str(r.survey_date) if r.survey_date else None
		if geom:
			features.append({"type": "Feature", "id": r.name, "geometry": geom, "properties": props})
		key = "competitor" if r.survey_for == "Competitor" else "company"
		totals[f"{key}_acres"] += flt(r.calc_area_acres)
		totals[f"{key}_surveys"] += 1
		if r.survey_for != "Competitor":
			totals["expected_maund"] += flt(r.expected_production_maund)
	return {"type": "FeatureCollection", "features": features,
		"totals": {k: round(v, 2) for k, v in totals.items()}, "count": len(rows)}


@frappe.whitelist(methods=["GET"])
def survey_detail(name: str) -> dict:
	doc = frappe.get_doc("Cane Survey", name)
	doc.check_permission("read")
	reviews = frappe.get_all("Survey Overlap Review", or_filters={"survey": name, "other_survey": name},
		fields=["name", "survey", "other_survey", "overlap_acres", "overlap_pct", "status"])
	data = doc.as_dict(no_default_fields=False)
	data.pop("polygon", None)
	grower_photo = doc.grower_photo or (frappe.db.get_value("Grower", doc.grower, "grower_photo") if doc.grower else None)
	return {"survey": data, "reviews": reviews, "grower_photo": grower_photo,
		"photos": [{"url": p.photo, "caption": p.caption, "latitude": p.latitude, "longitude": p.longitude,
			"taken_at": str(p.taken_at) if p.taken_at else None} for p in doc.photos],
		"variety_color": frappe.db.get_value("Cane Variety", doc.variety, "map_color")}


@frappe.whitelist(methods=["GET"])
def tracks(date: str | None = None, surveyor: str | None = None) -> dict:
	"""Attendance check-in/out points and GPS tracks (LineString per surveyor) for one day."""
	if not _can_read("Surveyor Location Log"):
		return {"attendance": {"type": "FeatureCollection", "features": []},
			"tracks": {"type": "FeatureCollection", "features": []}}
	day = getdate(date or nowdate())
	af = {"attendance_date": day, "docstatus": 1}
	lf = {"logged_at": ["between", [f"{day} 00:00:00", f"{add_days(day, 1)} 00:00:00"]]}
	if surveyor:
		af["surveyor"] = lf["surveyor"] = surveyor
	att = frappe.get_list("Surveyor Attendance", filters=af, fields=["name", "surveyor", "surveyor_name", "status",
		"time_in", "time_out", "latitude_in", "longitude_in", "latitude_out", "longitude_out", "inside_geofence_in",
		"inside_geofence_out", "working_hours", "distance_km", "selfie_in", "selfie_out"], limit_page_length=0)
	points = []
	for a in att:
		for kind, lat, lng, t, selfie, inside in (
				("in", a.latitude_in, a.longitude_in, a.time_in, a.selfie_in, a.inside_geofence_in),
				("out", a.latitude_out, a.longitude_out, a.time_out, a.selfie_out, a.inside_geofence_out)):
			if lat and lng:
				points.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lng, lat]},
					"properties": {"kind": kind, "surveyor": a.surveyor, "surveyor_name": a.surveyor_name, "status": a.status,
						"time": str(t) if t else None, "inside": inside, "hours": a.working_hours, "selfie": selfie,
						"lat": lat, "lng": lng, "km": a.distance_km, "attendance": a.name}})
	logs = frappe.get_list("Surveyor Location Log", filters=lf, fields=["surveyor", "latitude", "longitude", "logged_at"],
		order_by="surveyor asc, logged_at asc", limit_page_length=0)
	by_user = defaultdict(list)
	for r in logs:
		by_user[r.surveyor].append(r)
	lines = []
	for user, pts in by_user.items():
		if len(pts) < 2:
			continue
		coords = [[p.longitude, p.latitude] for p in pts]
		lines.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": coords},
			"properties": {"surveyor": user, "points": len(pts), "from": str(pts[0].logged_at), "to": str(pts[-1].logged_at),
				"km": round(geo.path_length_m([(p.latitude, p.longitude) for p in pts]) / 1000, 2)}})
	return {"attendance": {"type": "FeatureCollection", "features": points},
		"tracks": {"type": "FeatureCollection", "features": lines}}


# ---------------------------------------------------------------- dashboard
@frappe.whitelist(methods=["GET"])
def dashboard(season: str | None = None) -> dict:
	season = season or frappe.db.get_single_value("Sugar Settings", "active_season")
	rows = frappe.get_list("Cane Survey", filters={"docstatus": 1, "season": season},
		fields=["name", "survey_for", "circle", "variety", "crop_type", "disease", "calc_area_acres", "crop_land_acres",
			"expected_production_maund", "survey_date", "surveyor", "overlap_status", "grower"], limit_page_length=0)
	company = [r for r in rows if r.survey_for != "Competitor"]
	competitor = [r for r in rows if r.survey_for == "Competitor"]

	def group(items, key):
		out = defaultdict(lambda: {"surveys": 0, "acres": 0.0, "maund": 0.0})
		for r in items:
			g = out[r.get(key) or "—"]
			g["surveys"] += 1
			g["acres"] += flt(r.calc_area_acres)
			g["maund"] += flt(r.expected_production_maund)
		return [{"key": k, **{m: round(v, 2) for m, v in g.items()}} for k, g in sorted(out.items())]

	targets = frappe.get_list("Surveyor Target", filters={"season": season},
		fields=["surveyor", "surveyor_name", "target_acres", "target_surveys"], limit_page_length=0)
	done = {g["key"]: g for g in group(company, "surveyor")}
	today = getdate(nowdate())
	present = frappe.get_list("Surveyor Attendance", filters={"attendance_date": today, "docstatus": 1},
		pluck="name", limit_page_length=0) if _can_read("Surveyor Attendance") else []
	open_reviews = len(frappe.get_list("Survey Overlap Review", filters={"status": "Open", "season": season},
		pluck="name", limit_page_length=0)) if _can_read("Survey Overlap Review") else 0
	growers_total = len(frappe.get_list("Grower", filters={"disabled": 0}, pluck="name", limit_page_length=0))
	return {
		"season": season,
		"kpis": {
			"surveys": len(company), "acres": round(sum(flt(r.calc_area_acres) for r in company), 2),
			"expected_maund": round(sum(flt(r.expected_production_maund) for r in company), 2),
			"growers_surveyed": len({r.grower for r in company if r.grower}), "growers_total": growers_total,
			"competitor_acres": round(sum(flt(r.calc_area_acres) for r in competitor), 2),
			"diseased_acres": round(sum(flt(r.calc_area_acres) for r in company if r.disease), 2),
			"ratoon_acres": round(sum(flt(r.calc_area_acres) for r in company if r.crop_type == "Ratoon"), 2),
			"open_overlaps": open_reviews, "present_today": len(present),
		},
		"by_circle": group(company, "circle"),
		"by_variety": group(company, "variety"),
		"by_disease": group([r for r in company if r.disease], "disease"),
		"by_day": [{"key": str(g["key"]), **{k: v for k, v in g.items() if k != "key"}} for g in group(company, "survey_date")],
		"surveyors": [{**t, "done_acres": done.get(t.surveyor, {}).get("acres", 0),
			"done_surveys": done.get(t.surveyor, {}).get("surveys", 0)} for t in targets],
		"variety_colors": dict(frappe.get_all("Cane Variety", fields=["name", "map_color"], as_list=True)),
	}


# ---------------------------------------------------------------- hierarchy editor
@frappe.whitelist(methods=["GET"])
def geo_tree() -> list[dict]:
	"""Flat list of every hierarchy record with its parent, for the tree in the map editor (plus the mill and the
	competitor mills at the top)."""
	out = []
	settings = frappe.get_cached_doc("Sugar Settings")
	if frappe.has_permission("Sugar Settings", "read"):
		out.append({"doctype": "Sugar Settings", "name": "Sugar Settings", "title": settings.company or _("Company mill"),
			"code": None, "parent_doctype": None, "parent": None, "latitude": settings.mill_latitude,
			"longitude": settings.mill_longitude, "area_acres": None, "has_boundary": 1 if settings.mill_boundary else 0,
			"can_write": frappe.has_permission("Sugar Settings", "write")})
	for dt, fields in EXTRA_GEO.items():
		if _can_read(dt):
			for r in frappe.get_list(dt, fields=fields, limit_page_length=0, order_by="name"):
				out.append({"doctype": dt, "name": r.name, "title": r.get("title") or r.name, "code": None, "parent_doctype": None,
					"parent": None, "latitude": r.latitude, "longitude": r.longitude, "area_acres": r.area_acres,
					"has_boundary": 1 if r.polygon else 0, "can_write": frappe.has_permission(dt, "write")})
	for dt, fields in LEVEL_FIELDS.items():
		if not _can_read(dt):
			continue
		for r in frappe.get_list(dt, fields=fields, limit_page_length=0, order_by="name"):
			parent_dt, parent = None, r.get("parent")
			if dt == "Cane Village":
				parent_dt, parent = ("Cane Sector", r.sector) if r.sector else ("Cane Circle", r.circle)
			elif hierarchy.HIERARCHY[dt]:
				parent_dt = hierarchy.HIERARCHY[dt][0][1]
			out.append({"doctype": dt, "name": r.name, "title": r.get("title") or r.name, "code": r.get("code"),
				"parent_doctype": parent_dt, "parent": parent, "latitude": r.latitude, "longitude": r.longitude,
				"area_acres": r.area_acres, "has_boundary": 1 if r.polygon else 0,
				"can_write": frappe.has_permission(dt, "write")})
	return out


@frappe.whitelist(methods=["GET"])
def geo_feature(doctype: str, name: str) -> dict:
	if doctype == "Sugar Settings":
		doc = frappe.get_doc("Sugar Settings")
		doc.check_permission("read")
		return {"doctype": doctype, "name": name, "title": doc.company or _("Company mill"), "latitude": doc.mill_latitude,
			"longitude": doc.mill_longitude, "polygon": doc.mill_boundary, "area_acres": None,
			"can_write": frappe.has_permission("Sugar Settings", "write"), "parent": None,
			"children": boundaries(json.dumps(["Sugar Zone"])).get("Sugar Zone") or {"type": "FeatureCollection", "features": []}}
	if doctype not in LEVEL_FIELDS and doctype not in EXTRA_GEO:
		frappe.throw(_("Not a hierarchy level"))
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	children = []
	for child_dt, links in hierarchy.HIERARCHY.items():
		for field, parent_dt in links:
			if parent_dt == doctype and _can_read(child_dt):
				rows = frappe.get_list(child_dt, filters={field: name}, fields=LEVEL_FIELDS[child_dt], limit_page_length=0)
				children += [f for f in (hierarchy.feature(child_dt, r) for r in rows) if f]
	parent = hierarchy.parent_polygon(doc)
	return {
		"doctype": doctype, "name": name, "title": doc.get_title(), "latitude": doc.latitude, "longitude": doc.longitude,
		"polygon": doc.polygon, "area_acres": doc.area_acres, "can_write": frappe.has_permission(doctype, "write", doc=doc),
		"parent": {"doctype": parent[0], "name": parent[2],
			"polygon": geo.feature_collection(parent[1])} if parent else None,
		"children": {"type": "FeatureCollection", "features": children},
	}


@frappe.whitelist(methods=["POST"])
def save_geo(doctype: str, name: str, latitude: float | None = None, longitude: float | None = None,
		polygon: str | None = None, clear_polygon: int = 0) -> dict:
	if doctype not in LEVEL_FIELDS and doctype not in EXTRA_GEO and doctype != "Sugar Settings":
		frappe.throw(_("Not a hierarchy level"))
	doc = frappe.get_doc(doctype) if doctype == "Sugar Settings" else frappe.get_doc(doctype, name)
	doc.check_permission("write")
	f = SETTINGS_GEO if doctype == "Sugar Settings" else {"latitude": "latitude", "longitude": "longitude", "polygon": "polygon"}
	if latitude not in (None, "") and longitude not in (None, ""):
		doc.set(f["latitude"], flt(latitude, 6))
		doc.set(f["longitude"], flt(longitude, 6))
	if cint(clear_polygon):
		doc.set(f["polygon"], None)
	elif polygon:
		doc.set(f["polygon"], hierarchy.as_feature_collection(polygon))
	doc.save()
	return {"latitude": doc.get(f["latitude"]), "longitude": doc.get(f["longitude"]), "area_acres": doc.get("area_acres"),
		"polygon": doc.get(f["polygon"])}
