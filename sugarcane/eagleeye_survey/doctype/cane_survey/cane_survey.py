# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime

from sugarcane.calc import geo
from sugarcane.eagleeye_survey import overlaps

AREA_TOLERANCE_ACRES = 0.05  # empty + cane may exceed the total by rounding only


class CaneSurvey(Document):
	def validate(self):
		if not self.season:
			self.season = frappe.db.get_single_value("Sugar Settings", "active_season")
		if not self.season:
			frappe.throw(_("Set the season (no active season in Sugar Settings)"))
		self.validate_location()
		self.validate_areas()
		self.measure()
		self.set_expected_production()

	def validate_location(self):
		village_circle = frappe.db.get_value("Cane Village", self.village, "circle")
		if village_circle != self.circle:
			frappe.throw(_("Village {0} is in circle {1}, not {2}").format(
				frappe.bold(self.village), frappe.bold(village_circle), frappe.bold(self.circle)))
		if self.survey_for == "Competitor":
			if not self.competitor_mill:
				frappe.throw(_("Enter the competitor mill"))
		elif self.grower:
			grower_circle = frappe.db.get_value("Grower", self.grower, "circle")
			if grower_circle != self.circle:
				frappe.msgprint(_("Grower {0} is registered in {1}; this field is in {2}").format(
					frappe.bold(self.grower), grower_circle, self.circle), indicator="orange", alert=True)

	def validate_areas(self):
		if not self.total_acres and (self.crop_land_acres or self.empty_land_acres):
			self.total_acres = flt(self.crop_land_acres) + flt(self.empty_land_acres)
		if self.total_acres and flt(self.crop_land_acres) + flt(self.empty_land_acres) > self.total_acres + AREA_TOLERANCE_ACRES:
			frappe.throw(_("Cane area + empty land ({0} acres) is more than the total land ({1} acres)").format(
				flt(self.crop_land_acres) + flt(self.empty_land_acres), self.total_acres))
		if self.disease and not 0 <= flt(self.disease_pct) <= 100:
			frappe.throw(_("Disease % must be between 0 and 100"))
		if self.crop_type == "Plant":
			self.ratoon_no = 0

	def measure(self):
		try:
			poly = geo.polygon_of(self.polygon)
		except (geo.GeoError, ValueError, TypeError, KeyError) as e:
			frappe.throw(_("The field boundary is not a valid polygon: {0}").format(e))
		if poly is None:
			self.calc_area_acres = self.calc_area_kanal = self.area_variance_pct = 0
			self.bbox_min_lat = self.bbox_max_lat = self.bbox_min_lng = self.bbox_max_lng = None
			self.inside_village = 0
			return
		self.calc_area_acres = flt(geo.area_acres(poly), 3)
		self.calc_area_kanal = flt(geo.area_kanal(poly), 2)
		self.latitude, self.longitude = (round(v, 6) for v in geo.centroid(poly))
		self.bbox_min_lat, self.bbox_min_lng, self.bbox_max_lat, self.bbox_max_lng = geo.bbox(poly)
		declared = flt(self.crop_land_acres)
		self.area_variance_pct = flt(100 * (self.calc_area_acres - declared) / declared, 2) if declared else 0
		village_poly = geo.cached_polygon(frappe.db.get_value("Cane Village", self.village, "polygon"))
		self.inside_village = 1 if village_poly is not None and geo.share_inside(poly, village_poly) >= 50 else 0

	def set_expected_production(self):
		area = flt(self.calc_area_acres) or flt(self.crop_land_acres)
		loss = flt(self.disease_pct) / 100 if self.disease else 0
		self.expected_production_maund = flt(area * flt(self.expected_yield) * (1 - loss), 2)

	def before_submit(self):
		if not self.polygon or not flt(self.calc_area_acres):
			frappe.throw(_("Draw or walk the field boundary before submitting"))

	def on_submit(self):
		if not self.synced_at and self.survey_uuid:
			self.db_set("synced_at", now_datetime(), update_modified=False)
		overlaps.detect(self)

	def on_cancel(self):
		overlaps.on_survey_cancel(self)
		overlaps.refresh_status(self.name)
