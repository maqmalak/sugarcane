// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Weighment Register"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date" },
		{ fieldname: "terminal", label: __("Terminal"), fieldtype: "Link", options: "Weighbridge Terminal" },
		{ fieldname: "manual_only", label: __("Typed-in weights only"), fieldtype: "Check" },
	],
};
