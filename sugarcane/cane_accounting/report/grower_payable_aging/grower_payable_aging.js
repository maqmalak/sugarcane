// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Grower Payable Aging"] = {
	filters: [
		{ fieldname: "as_on", label: __("As on"), fieldtype: "Date" },
		{ fieldname: "circle", label: __("Circle"), fieldtype: "Link", options: "Cane Circle" },
		{ fieldname: "source", label: __("Source"), fieldtype: "Link", options: "Cane Source" },
	],
};
