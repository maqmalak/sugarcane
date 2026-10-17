// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Daily Indent Schedule"] = {
	filters: [
		{ fieldname: "season", label: __("Season"), fieldtype: "Link", options: "Crushing Season" },
		{ fieldname: "from_date", label: __("Supply From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("Supply To"), fieldtype: "Date" },
		{ fieldname: "circle", label: __("Circle"), fieldtype: "Link", options: "Cane Circle" },
	],
};
