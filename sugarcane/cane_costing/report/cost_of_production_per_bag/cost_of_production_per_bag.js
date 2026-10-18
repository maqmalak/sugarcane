// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Cost of Production per Bag"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date" },
	],
};
