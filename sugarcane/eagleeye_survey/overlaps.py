"""Overlap detection between submitted surveys of a season, and each survey's overlap status.

On submit, candidates are found with the indexed bounding box, then measured with shapely + geodesic areas. A shared
area above Sugar Settings → overlap tolerance (% of the smaller field) opens a Survey Overlap Review.
"""

import json

import frappe
from frappe.utils import flt

from sugarcane.calc import geo


def candidates(doc):
	if doc.bbox_min_lat is None or not doc.polygon:
		return []
	return frappe.get_all("Cane Survey", filters={
		"docstatus": 1, "season": doc.season, "name": ["!=", doc.name],
		"bbox_min_lat": ["<=", doc.bbox_max_lat], "bbox_max_lat": [">=", doc.bbox_min_lat],
		"bbox_min_lng": ["<=", doc.bbox_max_lng], "bbox_max_lng": [">=", doc.bbox_min_lng],
	}, fields=["name", "polygon", "grower", "survey_for"])


def detect(doc) -> list[str]:
	"""Opens a review for every survey overlapping `doc` beyond the tolerance; returns the review names."""
	poly = geo.polygon_of(doc.polygon)
	if poly is None:
		return []
	tolerance = flt(frappe.db.get_single_value("Sugar Settings", "overlap_tolerance_pct")) or 5
	reviews, total = [], 0.0
	for other in candidates(doc):
		ov = geo.overlap(poly, geo.polygon_of(other.polygon))
		if ov["pct_of_smaller"] <= tolerance:
			continue
		total += ov["acres"]
		if frappe.db.exists("Survey Overlap Review", {"survey": ["in", [doc.name, other.name]],
				"other_survey": ["in", [doc.name, other.name]], "status": "Open"}):
			continue
		shared = poly.intersection(geo.polygon_of(other.polygon))
		review = frappe.get_doc({
			"doctype": "Survey Overlap Review", "survey": doc.name, "other_survey": other.name,
			"overlap_acres": flt(ov["acres"], 3), "overlap_pct": flt(ov["pct_of_smaller"], 2),
			"overlap_geojson": json.dumps(geo.feature_collection(shared)), "status": "Open",
			"is_demo": doc.get("is_demo") or 0,
		})
		review.insert(ignore_permissions=True)
		reviews.append(review.name)
		refresh_status(other.name)
	doc.db_set("overlap_acres", flt(total, 3), update_modified=False)
	refresh_status(doc.name)
	return reviews


def refresh_status(survey: str):
	rows = frappe.get_all("Survey Overlap Review", or_filters={"survey": survey, "other_survey": survey},
		fields=["survey", "other_survey", "status"])
	if any(r.status == "Open" for r in rows):
		status = "Under Review"
	elif any((r.status == "Rejected Survey" and r.survey == survey)
			or (r.status == "Rejected Other Survey" and r.other_survey == survey) for r in rows):
		status = "Rejected"
	elif rows:
		status = "Accepted"
	else:
		status = "Clear"
	frappe.db.set_value("Cane Survey", survey, "overlap_status", status, update_modified=False)
	return status


def on_survey_cancel(doc):
	"""A cancelled survey closes its open reviews (as rejected) and frees the other surveys."""
	for r in frappe.get_all("Survey Overlap Review", or_filters={"survey": doc.name, "other_survey": doc.name},
			filters={"status": "Open"}, fields=["name", "survey", "other_survey"]):
		status = "Rejected Survey" if r.survey == doc.name else "Rejected Other Survey"
		frappe.db.set_value("Survey Overlap Review", r.name, {"status": status, "reviewed_by": frappe.session.user,
			"reviewed_on": frappe.utils.now_datetime(), "remarks": "Survey cancelled"})
		refresh_status(r.other_survey if r.survey == doc.name else r.survey)
