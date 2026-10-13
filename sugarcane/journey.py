"""Distance and standard journey time from a cane source (gate / check post / depot), depot or loading point to the mill.

- straight_km: geodesic, mill pin (Sugar Settings) → the record's pin.
- road distance (distance_km), first that applies:
  1. a drawn route (GeoJSON LineString, source → mill): its length — "Drawn route"
  2. entered by hand (road_distance_manual) — "Entered"
  3. straight line × Sugar Settings road factor — "Estimated"
- standard times, unless entered by hand (journey_time_manual):
  to mill (loaded) = road km ÷ loaded speed + allowance; back (empty) = road km ÷ empty speed; round trip = both.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt

from sugarcane.calc import geo

JOURNEY_DOCTYPES = ("Cane Source", "Cane Depot", "Loading Point")
DEFAULTS = {"road_factor": 1.3, "loaded_speed_kmph": 25.0, "empty_speed_kmph": 35.0, "journey_allowance_min": 15}
ROUTE_END_TOLERANCE_KM = 3  # a drawn route should start near the source and end near the mill


def standards() -> dict:
	s = frappe.get_cached_doc("Sugar Settings")
	out = {k: flt(s.get(k)) or v for k, v in DEFAULTS.items()}
	out["journey_allowance_min"] = cint(s.get("journey_allowance_min")) if s.get("journey_allowance_min") is not None else DEFAULTS["journey_allowance_min"]
	out["mill"] = (flt(s.mill_latitude), flt(s.mill_longitude)) if s.mill_latitude and s.mill_longitude else None
	return out


def _m(a: tuple[float, float], b: tuple[float, float]) -> float:
	"""Geodesic metres between (lat, lng) points on the WGS84 ellipsoid (as field areas are measured)."""
	return geo.GEOD.inv(a[1], a[0], b[1], b[0])[2]


def _path_m(pts) -> float:
	return sum(_m(a, b) for a, b in zip(pts, pts[1:], strict=False))


def route_points(value) -> list[tuple[float, float]]:
	"""[(lat, lng), …] of a GeoJSON LineString / Feature / FeatureCollection (first line found)."""
	if not value:
		return []
	data = json.loads(value) if isinstance(value, str) else value
	for g in geo.geometries(data):
		if g.get("type") == "LineString":
			return [(flt(lat), flt(lng)) for lng, lat, *_ in g["coordinates"]]
		if g.get("type") == "MultiLineString" and g["coordinates"]:
			return [(flt(lat), flt(lng)) for lng, lat, *_ in g["coordinates"][0]]
	return []


def times(road_km: float, std: dict) -> tuple[int, int]:
	to_mill = round(60 * road_km / std["loaded_speed_kmph"] + std["journey_allowance_min"]) if road_km else 0
	back = round(60 * road_km / std["empty_speed_kmph"]) if road_km else 0
	return to_mill, back


def compute(doc, std: dict | None = None, warn: bool = True):
	std = std or standards()
	lat, lng = flt(doc.get("latitude")), flt(doc.get("longitude"))
	has_pin = bool(lat and lng)
	if has_pin and not (-90 <= lat <= 90 and -180 <= lng <= 180):
		frappe.throw(_("Latitude / longitude are out of range"))
	mill = std["mill"]
	doc.straight_km = flt(_m((lat, lng), mill) / 1000, 2) if has_pin and mill else 0

	try:
		pts = route_points(doc.get("route"))
	except (ValueError, TypeError, KeyError, geo.GeoError) as e:
		frappe.throw(_("The route is not a valid GeoJSON line: {0}").format(e))
	if doc.get("route") and len(pts) < 2:
		frappe.throw(_("The route needs at least two points"))

	if pts:
		doc.distance_km = flt(_path_m(pts) / 1000, 2)
		doc.distance_basis = "Drawn route"
		doc.road_distance_manual = 0
		if warn:
			far = []
			if has_pin and _m(pts[0], (lat, lng)) > ROUTE_END_TOLERANCE_KM * 1000:
				far.append(_("it does not start at this location"))
			if mill and _m(pts[-1], mill) > ROUTE_END_TOLERANCE_KM * 1000:
				far.append(_("it does not end at the mill"))
			if far:
				frappe.msgprint(_("Check the route: {0}.").format(_(" and ").join(far)), indicator="orange", alert=True)
	elif cint(doc.get("road_distance_manual")) and flt(doc.get("distance_km")):
		doc.distance_basis = "Entered"
	elif doc.straight_km:
		doc.distance_km = flt(doc.straight_km * std["road_factor"], 2)
		doc.distance_basis = "Estimated"
	else:
		doc.distance_basis = "Entered" if flt(doc.get("distance_km")) else ""

	if not cint(doc.get("journey_time_manual")):
		doc.journey_to_mill_min, doc.journey_back_min = times(flt(doc.distance_km), std)
	doc.round_trip_min = cint(doc.journey_to_mill_min) + cint(doc.journey_back_min)


def validate_journey(doc, method=None):
	compute(doc)


def refresh_all() -> int:
	"""Recalculate every source / depot / loading point (after the mill pin or the standards change)."""
	std, n = standards(), 0
	for dt in JOURNEY_DOCTYPES:
		for name in frappe.get_all(dt, pluck="name"):
			doc = frappe.get_doc(dt, name)
			before = (doc.straight_km, doc.distance_km, doc.journey_to_mill_min, doc.journey_back_min)
			compute(doc, std, warn=False)
			after = (doc.straight_km, doc.distance_km, doc.journey_to_mill_min, doc.journey_back_min)
			if before != after:
				doc.db_update()
				n += 1
	return n


def fmt_minutes(minutes) -> str:
	m = cint(minutes)
	return f"{m // 60} h {m % 60:02d} min" if m >= 60 else f"{m} min"


@frappe.whitelist(methods=["GET"])
def sources_map() -> dict:
	"""Every source, depot and loading point with its pin, route and journey figures, plus the mill pin — for the maps."""
	std = standards()
	features = []
	for dt in JOURNEY_DOCTYPES:
		if not frappe.has_permission(dt, "read"):
			continue
		title = {"Cane Source": "source_name", "Cane Depot": "depot_name", "Loading Point": "loading_point_name"}[dt]
		extra = ["source_type"] if dt == "Cane Source" else ["source", "circle"]
		for r in frappe.get_list(dt, fields=["name", title, "latitude", "longitude", "straight_km", "distance_km", "distance_basis",
				"journey_to_mill_min", "journey_back_min", "round_trip_min", "route", "is_active", *extra], limit_page_length=0):
			props = {"doctype": dt, "name": r.name, "title": r.get(title) or r.name, "kind": r.get("source_type") or dt,
				"straight_km": r.straight_km, "distance_km": r.distance_km, "basis": r.distance_basis,
				"to_mill": r.journey_to_mill_min, "back": r.journey_back_min, "round_trip": r.round_trip_min,
				"active": r.is_active, "source": r.get("source"), "circle": r.get("circle")}
			if r.latitude and r.longitude:
				features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [r.longitude, r.latitude]}, "properties": props})
			pts = route_points(r.route) if r.route else []
			if pts:
				features.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[p[1], p[0]] for p in pts]},
					"properties": {**props, "line": "route"}})
	mill = std.pop("mill")
	return {"type": "FeatureCollection", "features": features,
		"mill": {"latitude": mill[0], "longitude": mill[1]} if mill else None, "standards": std}


@frappe.whitelist(methods=["POST"])
def recalculate() -> dict:
	frappe.only_for(("System Manager", "Cane Admin", "Cane Manager"))
	return {"updated": refresh_all()}
