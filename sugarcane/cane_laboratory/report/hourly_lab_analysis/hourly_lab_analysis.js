// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Hourly Lab Analysis"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date" },
		{ fieldname: "sample_type", label: __("Sample Type"), fieldtype: "Link", options: "Lab Sample Type" },
		{ fieldname: "out_of_range", label: __("Out of range only"), fieldtype: "Check" },
	],
};
