// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Circle Wise Indent Summary"] = {
	filters: [
		{ fieldname: "season", label: __("Season"), fieldtype: "Link", options: "Crushing Season" },
		{ fieldname: "circle", label: __("Circle"), fieldtype: "Link", options: "Cane Circle" },
	],
};
