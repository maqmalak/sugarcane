# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from sugarcane.eagleeye_survey.report_utils import col, grouped


def execute(filters=None):
	return grouped(filters, [col("circle", "Circle", "Link", "Cane Circle", 120), col("grower", "Grower ID", "Link", "Grower", 120), col("grower_name", "Grower", width=180), col("variety", "Variety", "Link", "Cane Variety", 100)])
