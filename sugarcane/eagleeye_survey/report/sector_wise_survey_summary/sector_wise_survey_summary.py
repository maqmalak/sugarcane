# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from sugarcane.eagleeye_survey.report_utils import col, grouped


def execute(filters=None):
	return grouped(filters, [col("circle", "Circle", "Link", "Cane Circle", 120), col("sector", "Sector", "Link", "Cane Sector", 120)])
