# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import cint

from sugarcane.cane_procurement.report_utils import col, dates


def execute(filters=None):
	"""Every weighment with the terminal, user and reading used for each weight; typed-in and out-of-limit weights stand out."""
	f = frappe._dict(filters or {})
	start, end = dates(f)
	q = {"docstatus": ["<", 2], "crushing_day": ["between", [start, end]]}
	if cint(f.manual_only):
		q["manual_entry"] = 1
	or_q = {"gross_terminal": f.terminal, "tare_terminal": f.terminal} if f.terminal else None
	data = frappe.get_list("Cane Weighment", filters=q, or_filters=or_q, fields=["name", "crushing_day", "token", "status", "vehicle_no", "vehicle_type",
		"grower_name", "gross_kg", "gross_at", "gross_by", "gross_terminal", "gross_note", "tare_kg", "tare_at", "tare_by", "tare_terminal", "tare_note",
		"net_kg", "yard_minutes", "manual_entry", "cpr"], order_by="gross_at asc", limit_page_length=0)
	for r in data:
		r.notes = " · ".join(x for x in (r.gross_note, r.tare_note) if x)
	columns = [col("name", "Weighment", "Link", "Cane Weighment", 120), col("crushing_day", "Day", "Date", width=95), col("token", "Token", "Link", "Cane Token", 120),
		col("status", "Status", width=85), col("vehicle_no", "Vehicle", width=95), col("vehicle_type", "Type", width=110), col("grower_name", "Grower", width=140),
		col("gross_kg", "Gross kg", "Int", width=85), col("gross_at", "Gross At", "Datetime", width=140), col("gross_terminal", "Gross Terminal", width=110),
		col("gross_by", "Gross By", "Link", "User", 150), col("tare_kg", "Tare kg", "Int", width=80), col("tare_at", "Tare At", "Datetime", width=140),
		col("tare_terminal", "Tare Terminal", width=110), col("tare_by", "Tare By", "Link", "User", 150), col("net_kg", "Net kg", "Int", width=85),
		col("yard_minutes", "Yard (min)", "Int", width=85), col("manual_entry", "Typed In", "Check", width=75), col("notes", "Notes", width=260),
		col("cpr", "CPR", "Link", "Cane Purchase Receipt", 120)]
	return columns, data
