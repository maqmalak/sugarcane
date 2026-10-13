# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe

from sugarcane.eagleeye_survey.report_utils import col, grouped
from sugarcane.quota import season_quotas


def execute(filters=None):
	filters = frappe._dict(filters or {})
	quotas = season_quotas(filters.season or frappe.db.get_single_value("Sugar Settings", "active_season"))
	columns, data, message, chart = grouped(filters, [col("circle", "Circle", "Link", "Cane Circle", 140), col("zone", "Zone", "Link", "Sugar Zone", 110)],
		extra=lambda key, rows: {"quota_maund": quotas.get(key[0], 0)})
	columns.append(col("quota_maund", "Quota (maund)", "Float", width=120))
	return columns, data, message, chart
