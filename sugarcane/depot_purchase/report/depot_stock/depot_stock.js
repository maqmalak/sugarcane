// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Depot Stock"] = {
	filters: [
		{ fieldname: "to_date", label: __("As on"), fieldtype: "Date" },
	],
};
