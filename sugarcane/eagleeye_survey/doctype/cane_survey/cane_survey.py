# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime

from sugarcane.calc import geo
from sugarcane.eagleeye_survey import overlaps
from sugarcane.utils import clean_cnic

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
				frappe.throw(_("Choose the competitor mill"))
			self.grower = None
			return
		self.competitor_mill = None
		if self.grower_category == "Non-Passbook Grower" and not self.grower:
			self.np_cnic = clean_cnic(self.np_cnic, _("Grower CNIC"))
			if not (self.np_grower_name or "").strip():
				frappe.throw(_("Enter the grower's name"))
			# a grower already registered with this CNIC (e.g. surveyed before) is linked, not duplicated
			self.grower = frappe.db.get_value("Grower", {"cnic": self.np_cnic}, "name")
		if not self.grower and self.grower_category != "Non-Passbook Grower":
			frappe.throw(_("Choose the grower, or switch Grower Type to Non-Passbook Grower"))
		if self.grower:
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
		if self.survey_for == "Company" and not self.grower:
			self.register_grower()

	def register_grower(self):
		"""CNIC-based survey of a grower without a passbook: register the grower (no passbook) in the survey's village."""
		grower = frappe.get_doc({"doctype": "Grower", "grower_name": self.np_grower_name.strip(), "father_name": self.np_father_name,
			"cnic": self.np_cnic, "mobile": self.np_mobile, "circle": self.circle, "village": self.village,
			"grower_photo": self.grower_photo,
			"is_demo": self.get("is_demo") or 0})
		grower.flags.ignore_permissions = True
		grower.insert()
		grower.add_comment("Comment", _("Registered from non-passbook survey {0}").format(self.name))
		self.grower = grower.name
		self.grower_name = grower.grower_name
		self.cnic = grower.cnic

	def on_submit(self):
		if self.grower and self.grower_photo and not frappe.db.get_value("Grower", self.grower, "grower_photo"):
			frappe.db.set_value("Grower", self.grower, "grower_photo", self.grower_photo)  # first survey photo → profile
		if not self.synced_at and self.survey_uuid:
			self.db_set("synced_at", now_datetime(), update_modified=False)
		overlaps.detect(self)

	def on_cancel(self):
		overlaps.on_survey_cancel(self)
		overlaps.refresh_status(self.name)
