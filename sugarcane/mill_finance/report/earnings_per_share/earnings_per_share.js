// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Earnings Per Share"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date", default: "2026-07-01" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date" },
	],
};
