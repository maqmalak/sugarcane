# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from sugarcane.eagleeye_survey.report_utils import col, grouped


def execute(filters=None):
	return grouped(filters, [col("grower", "Grower ID", "Link", "Grower", 120), col("grower_name", "Grower", width=180), col("circle", "Circle", "Link", "Cane Circle", 110), col("village_name", "Village", width=120)])
