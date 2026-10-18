// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Variety Wise Recovery"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date" },
		{ fieldname: "group_by", label: __("Group by"), fieldtype: "Select", options: "Variety\nCircle\nGrower\nSource", default: "Variety" },
	],
};
