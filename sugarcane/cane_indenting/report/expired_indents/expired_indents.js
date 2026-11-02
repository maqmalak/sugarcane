// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Expired Indents"] = {
	filters: [
		{ fieldname: "season", label: __("Season"), fieldtype: "Link", options: "Crushing Season" },
		{ fieldname: "from_date", label: __("Supply From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("Supply To"), fieldtype: "Date" },
		{ fieldname: "circle", label: __("Circle"), fieldtype: "Link", options: "Cane Circle" },
		{ fieldname: "village", label: __("Village"), fieldtype: "Link", options: "Cane Village",
			get_query: () => ({ filters: { circle: frappe.query_report.get_filter_value("circle") || undefined } }) },
		{ fieldname: "grower", label: __("Grower"), fieldtype: "Link", options: "Grower" },
	],
};
