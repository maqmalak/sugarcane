// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Circle Wise Performance"] = {
	filters: [
		{ fieldname: "season", label: __("Season"), fieldtype: "Link", options: "Crushing Season" },
		{ fieldname: "to_date", label: __("Up To"), fieldtype: "Date" },
	],
};
