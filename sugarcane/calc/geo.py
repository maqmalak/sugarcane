"""Geometry on WGS84 GeoJSON (lng, lat): geodesic areas with pyproj, overlaps and containment with shapely.

Accepts what Frappe's Geolocation field stores (a FeatureCollection), a single Feature, or a bare Geometry, as a dict
or JSON text. No database access.
"""

import json
import math
from functools import lru_cache

from pyproj import Geod
from shapely.geometry import MultiPolygon, Point, Polygon, mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

from sugarcane.calc.units import KANAL_PER_ACRE, SQ_M_PER_ACRE

GEOD = Geod(ellps="WGS84")
EARTH_RADIUS_M = 6_371_008.8


class GeoError(ValueError):
	pass


# ---------------------------------------------------------------- parsing
def geometries(value) -> list[dict]:
	"""All geometry dicts in a GeoJSON value (FeatureCollection / Feature / Geometry / GeometryCollection)."""
	if not value:
		return []
	if isinstance(value, str):
		try:
			value = json.loads(value)
		except ValueError as e:
			raise GeoError("Not valid GeoJSON") from e
	if not isinstance(value, dict):
		raise GeoError("Not valid GeoJSON")
	kind = value.get("type")
	if kind == "FeatureCollection":
		return [g for f in value.get("features") or [] for g in geometries(f)]
	if kind == "Feature":
		return geometries(value.get("geometry"))
	if kind == "GeometryCollection":
		return [g for sub in value.get("geometries") or [] for g in geometries(sub)]
	if kind in ("Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"):
		return [value]
	raise GeoError(f"Unsupported GeoJSON type {kind!r}")


def polygon_of(value):
	"""The (multi)polygon in a GeoJSON value as a valid shapely geometry, or None when it has no polygon.

	Leaflet-draw circles (a Point with a "radius" property in metres) are turned into polygons too."""
	if not value:
		return None
	if isinstance(value, str):
		value = json.loads(value)
	parts = []
	features = value.get("features") if value.get("type") == "FeatureCollection" else [value]
	for f in features or []:
		geom = f.get("geometry") if f.get("type") == "Feature" else f
		radius = (f.get("properties") or {}).get("radius") if f.get("type") == "Feature" else None
		if not geom:
			continue
		if geom.get("type") == "Point" and radius:
			parts.append(circle_polygon(geom["coordinates"][1], geom["coordinates"][0], float(radius)))
		elif geom.get("type") in ("Polygon", "MultiPolygon"):
			if geom["type"] == "Polygon" and len((geom.get("coordinates") or [[]])[0]) < 4:
				raise GeoError("A polygon needs at least 3 corners")
			parts.append(shape(geom))
	if not parts:
		return None
	geom = unary_union([p if p.is_valid else make_valid(p) for p in parts])
	geom = _only_polygons(geom)
	return geom if geom and not geom.is_empty else None


def _only_polygons(geom):
	if geom.geom_type in ("Polygon", "MultiPolygon"):
		return geom
	polys = [g for g in getattr(geom, "geoms", []) if g.geom_type in ("Polygon", "MultiPolygon")]
	return unary_union(polys) if polys else None


def point_of(value):
	"""First Point in a GeoJSON value as (lat, lng), or None."""
	for g in geometries(value):
		if g.get("type") == "Point":
			lng, lat = g["coordinates"][:2]
			return float(lat), float(lng)
	return None


def feature_collection(*geoms, properties: dict | None = None) -> dict:
	"""shapely geometries / GeoJSON dicts → FeatureCollection (what the Geolocation field stores)."""
	feats = []
	for g in geoms:
		if g is None:
			continue
		geo = mapping(g) if hasattr(g, "geom_type") else g
		feats.append({"type": "Feature", "properties": dict(properties or {}), "geometry": json.loads(json.dumps(geo))})
	return {"type": "FeatureCollection", "features": feats}


# ---------------------------------------------------------------- measures
def area_sq_m(geom) -> float:
	"""Geodesic area (WGS84 ellipsoid) of a shapely (multi)polygon in square metres."""
	if geom is None or geom.is_empty:
		return 0.0
	area, _perimeter = GEOD.geometry_area_perimeter(geom)
	return abs(area)


def area_acres(geom) -> float:
	return area_sq_m(geom) / SQ_M_PER_ACRE


def area_kanal(geom) -> float:
	return area_acres(geom) * KANAL_PER_ACRE


def perimeter_m(geom) -> float:
	if geom is None or geom.is_empty:
		return 0.0
	_area, perimeter = GEOD.geometry_area_perimeter(geom)
	return abs(perimeter)


def centroid(geom) -> tuple[float, float] | None:
	"""(lat, lng) of a point guaranteed to lie inside the polygon (representative point)."""
	if geom is None or geom.is_empty:
		return None
	p = geom.representative_point()
	return p.y, p.x


def bbox(geom) -> tuple[float, float, float, float] | None:
	"""(min_lat, min_lng, max_lat, max_lng)."""
	if geom is None or geom.is_empty:
		return None
	min_lng, min_lat, max_lng, max_lat = geom.bounds
	return min_lat, min_lng, max_lat, max_lng


def distance_m(lat1, lng1, lat2, lng2) -> float:
	"""Great-circle distance in metres (haversine)."""
	p1, p2 = math.radians(lat1), math.radians(lat2)
	dp, dl = p2 - p1, math.radians(lng2 - lng1)
	a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
	return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def path_length_m(points: list[tuple[float, float]]) -> float:
	"""Length of a track [(lat, lng), …] in metres."""
	return sum(distance_m(*a, *b) for a, b in zip(points, points[1:], strict=False))


def circle_polygon(lat, lng, radius_m, segments=48) -> Polygon:
	pts = []
	for i in range(segments):
		lng2, lat2, _ = GEOD.fwd(lng, lat, 360 * i / segments, radius_m)
		pts.append((lng2, lat2))
	return Polygon(pts)


# ---------------------------------------------------------------- relations
def overlap(a, b) -> dict:
	"""Shared area of two polygons: {acres, pct_of_a, pct_of_b, pct_of_smaller}."""
	if a is None or b is None or not a.intersects(b):
		return {"acres": 0.0, "pct_of_a": 0.0, "pct_of_b": 0.0, "pct_of_smaller": 0.0}
	shared = area_acres(_only_polygons(a.intersection(b)) or Polygon())
	aa, ab = area_acres(a), area_acres(b)
	pa = 100 * shared / aa if aa else 0.0
	pb = 100 * shared / ab if ab else 0.0
	return {"acres": shared, "pct_of_a": pa, "pct_of_b": pb, "pct_of_smaller": max(pa, pb)}


def contains_point(geom, lat, lng, buffer_m: float = 0) -> bool:
	"""Is (lat, lng) inside the polygon, or within buffer_m metres of its edge?"""
	if geom is None or geom.is_empty or lat is None or lng is None:
		return False
	pt = Point(lng, lat)
	if geom.covers(pt):
		return True
	if not buffer_m:
		return False
	nearest = geom.exterior if isinstance(geom, Polygon) else unary_union([g.exterior for g in geom.geoms])
	proj = nearest.interpolate(nearest.project(pt))
	return distance_m(lat, lng, proj.y, proj.x) <= buffer_m


def share_inside(inner, outer) -> float:
	"""Percentage of `inner`'s area that lies inside `outer`."""
	if inner is None or outer is None:
		return 0.0
	total = area_acres(inner)
	if not total:
		return 0.0
	return 100 * area_acres(_only_polygons(inner.intersection(outer)) or Polygon()) / total


@lru_cache(maxsize=2048)
def _cached_polygon(text: str):
	return polygon_of(text)


def cached_polygon(text: str | None):
	"""polygon_of with an in-process cache keyed on the JSON text (boundaries are read many times per request)."""
	return _cached_polygon(text) if text else None


__all__ = ["GeoError", "MultiPolygon", "Polygon"]
