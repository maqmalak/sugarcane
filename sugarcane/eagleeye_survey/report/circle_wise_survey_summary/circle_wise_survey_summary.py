# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe

from sugarcane.eagleeye_survey.report_utils import col, grouped


def execute(filters=None):
	columns, data, message, chart = grouped(filters, [col("circle", "Circle", "Link", "Cane Circle", 140), col("zone", "Zone", "Link", "Sugar Zone", 110)], extra=lambda key, rows: {"quota_maund": frappe.db.get_value("Cane Circle", key[0], "quota_maund") or 0})
	columns.append(col("quota_maund", "Quota (maund)", "Float", width=120))
	return columns, data, message, chart
