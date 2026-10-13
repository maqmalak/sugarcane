"""Pins and boundaries on the area hierarchy: Division → District → Zone → Circle → Sector → Village.

Every level has latitude / longitude (the pin), `polygon` (Geolocation boundary) and `area_acres` (geodesic, computed).
On save: the polygon is checked and measured; an empty pin is set to a point inside the boundary; a pin outside its
own boundary, or a boundary that sticks out of its parent's, gives a warning (never blocks — field data is rough).
"""

import json

import frappe
from frappe import _
from frappe.utils import flt

from sugarcane.calc import geo

# doctype → (parent link field(s), most specific first, parent doctype for each)
HIERARCHY = {
	"Sugar Division": (),
	"Sugar District": (("division", "Sugar Division"),),
	"Sugar Zone": (("district", "Sugar District"),),
	"Cane Circle": (("zone", "Sugar Zone"),),
	"Cane Sector": (("circle", "Cane Circle"),),
	"Cane Village": (("sector", "Cane Sector"), ("circle", "Cane Circle")),
}
LEVELS = tuple(HIERARCHY)
PARENT_SHARE_WARN_PCT = 90


def validate_geo(doc, method=None):
	try:
		poly = geo.polygon_of(doc.polygon)
	except (geo.GeoError, ValueError, TypeError, KeyError) as e:
		frappe.throw(_("{0} boundary is not a valid polygon: {1}").format(_(doc.doctype), e))
	doc.area_acres = flt(geo.area_acres(poly), 2) if poly else 0
	if poly and not (doc.latitude and doc.longitude):
		doc.latitude, doc.longitude = (round(v, 6) for v in geo.centroid(poly))
	if doc.latitude or doc.longitude:
		if not (-90 <= flt(doc.latitude) <= 90 and -180 <= flt(doc.longitude) <= 180):
			frappe.throw(_("Latitude must be −90…90 and longitude −180…180"))
	if poly and doc.latitude and doc.longitude and not geo.contains_point(poly, doc.latitude, doc.longitude):
		frappe.msgprint(_("The pin of {0} is outside its own boundary").format(frappe.bold(doc.name or doc.get_title())),
			indicator="orange", alert=True)
	if poly:
		parent = parent_polygon(doc)
		if parent is not None:
			share = geo.share_inside(poly, parent[1])
			if share < PARENT_SHARE_WARN_PCT:
				frappe.msgprint(_("Only {0}% of this boundary lies inside {1} {2}").format(
					round(share), _(parent[0]), frappe.bold(parent[2])), indicator="orange", alert=True)


def parent_polygon(doc):
	"""(parent doctype, shapely polygon, parent name) of the nearest parent that has a boundary."""
	for field, parent_dt in HIERARCHY.get(doc.doctype, ()):
		name = doc.get(field)
		if not name:
			continue
		text = frappe.db.get_value(parent_dt, name, "polygon")
		if text:
			return parent_dt, geo.cached_polygon(text), name
	return None


def as_feature_collection(geometry: dict | str | None) -> str | None:
	"""A bare GeoJSON geometry (as the React map editor sends) → FeatureCollection text for a Geolocation field."""
	if not geometry:
		return None
	value = json.loads(geometry) if isinstance(geometry, str) else geometry
	if value.get("type") == "FeatureCollection":
		return json.dumps(value)
	if value.get("type") == "Feature":
		return json.dumps({"type": "FeatureCollection", "features": [value]})
	return json.dumps(geo.feature_collection(value))


def feature(doctype, row, kind=None) -> dict | None:
	"""Map feature for a hierarchy record: its boundary (or pin when it has no boundary) with display properties."""
	geom = None
	if row.get("polygon"):
		polys = [g for g in geo.geometries(row["polygon"]) if g["type"] in ("Polygon", "MultiPolygon")]
		if polys:
			geom = polys[0] if len(polys) == 1 else {"type": "GeometryCollection", "geometries": polys}
	if geom is None and row.get("latitude") and row.get("longitude"):
		geom = {"type": "Point", "coordinates": [row["longitude"], row["latitude"]]}
	if geom is None:
		return None
	props = {k: v for k, v in row.items() if k != "polygon" and not isinstance(v, (dict, list))}
	props.update({"doctype": doctype, "kind": kind or doctype, "has_boundary": bool(row.get("polygon"))})
	return {"type": "Feature", "id": f"{doctype}:{row['name']}", "geometry": geom, "properties": props}
