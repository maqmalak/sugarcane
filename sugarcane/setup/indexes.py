# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Phase 9: database indexes for a full season (thousands of loads a day at a real mill).

Frappe indexes only `name` and `creation`, so every screen that filters by season, crushing day, grower, circle,
status or a linked document scanned the whole table. `ensure()` runs on every migrate and adds what is missing
(online in MariaDB; a large table takes a moment the first time). The benchmark (`sugarcane.setup.benchmark`)
measures the screens before and after."""
import frappe

INDEXES = {  # doctype -> [columns of one index]
	"Cane Purchase Receipt": [["season", "posting_date"], ["posting_date", "docstatus"], ["grower", "docstatus"], ["circle", "season"],
		["payment_status", "docstatus"], ["token"], ["indent"], ["daily_purchase"], ["payment_scroll"], ["purchase_depot", "posting_date"],
		["posted_at"], ["road_cess_deposit"], ["source"]],
	"Cane Token": [["crushing_day", "status"], ["status", "docstatus"], ["indent"], ["vehicle"], ["season"], ["elp_registration"]],
	"Cane Weighment": [["token"], ["crushing_day"]],
	"TPT Bilty": [["status", "crushing_day"], ["cpr"], ["season"]],
	"Cane Indent": [["season", "circle"], ["grower", "season"], ["status", "valid_to"], ["batch"], ["valid_from", "valid_to"], ["token"]],
	"Indent Batch": [["season", "circle"]],
	"Cane Survey": [["season", "circle"], ["grower", "season"], ["village"]],
	"Grower": [["cnic"], ["mobile"], ["circle"], ["passbook_no"]],
	"Daily Cane Purchase": [["crushing_day"], ["season"]],
	"Cane Payment Scroll CPR": [["cpr"]],
	"Cane Payment Scroll Payment": [["grower"]],
	"Grower Loan": [["grower", "status"], ["season"]],
	"Grower Loan Entry": [["loan"], ["cpr"], ["journal_entry"]],
	"Depot Dispatch": [["depot", "dispatch_day"], ["status"], ["received_day"], ["vehicle"]],
	"LP Vehicle Registration": [["indent"], ["status", "arrived_at"], ["loading_point"]],
	"Weighment Reading Log": [["terminal", "read_at"], ["weighment"], ["dispatch"]],
	"Lab Sample": [["sample_time"], ["sample_type", "sample_time"]],
	"Vehicle Recovery Sample": [["cpr"]],
	"Mill Stoppage": [["crushing_day"]],
	"Daily Manufacturing Report": [["crushing_day"], ["season"]],
	"Plant Level Reading": [["reading_time"]],
	"Sugar SMS Log": [["mobile", "queued_at"], ["reference_doctype", "reference_name"], ["status", "direction"], ["grower"], ["queued_at"]],
	"Gate Pass": [["reference_doctype", "reference_name"], ["status"]],
	"Sales Weighment": [["delivery_note"]],
	"Sugar Generated Document": [["reference_doctype", "reference_name"]],
	"Contractor Bill Item": [["reference_doctype", "reference_name"]],
}


def index_name(cols):
	return "sc_" + "_".join(cols)[:56]


def ensure() -> int:
	added = 0
	for doctype, groups in INDEXES.items():
		if not frappe.db.table_exists(doctype):
			continue
		columns = set(frappe.db.get_table_columns(doctype))
		for cols in groups:
			if not set(cols) <= columns:
				continue
			name = index_name(cols)
			if not frappe.db.has_index(f"tab{doctype}", name):
				frappe.db.add_index(doctype, cols, name)
				added += 1
	return added


def missing() -> list[str]:
	out = []
	for doctype, groups in INDEXES.items():
		if not frappe.db.table_exists(doctype):
			continue
		columns = set(frappe.db.get_table_columns(doctype))
		out += [f"{doctype}: {', '.join(c)}" for c in groups if set(c) <= columns and not frappe.db.has_index(f"tab{doctype}", index_name(c))]
	return out
