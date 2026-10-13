# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _

from sugarcane.eagleeye_survey.report_utils import col, survey_rows


def execute(filters=None):
	columns = [
		col("name", "Survey", "Link", "Cane Survey", 140), col("survey_date", "Date", "Date", width=95),
		col("grower", "Grower ID", "Link", "Grower", 115), col("grower_name", "Grower", width=170),
		col("cnic", "CNIC", width=130), col("passbook_no", "Passbook", width=130),
		col("circle", "Circle", "Link", "Cane Circle", 110), col("village_name", "Village", width=120),
		col("murabba_no", "Murabba", width=75), col("killa_no", "Killa", width=60),
		col("variety", "Variety", "Link", "Cane Variety", 95), col("crop_type", "Plant/Ratoon", width=95),
		col("disease", "Disease", "Link", "Crop Disease", 110), col("disease_pct", "Disease %", "Percent", width=80),
		col("crop_land_acres", "Declared (acres)", "Float", width=115), col("calc_area_acres", "Measured (acres)", "Float", width=120),
		col("area_variance_pct", "Variance %", "Percent", width=85),
		col("expected_production_maund", "Expected (maund)", "Float", width=125),
		col("surveyor", "Surveyor", "Link", "User", 170), col("overlap_status", "Overlap", width=100),
		col("survey_for", "For", width=90), col("competitor_mill", "Competitor Mill", width=140),
	]
	return columns, survey_rows(filters)
