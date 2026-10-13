// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Cane Survey Detail"] = {
	filters: [
	{ fieldname: "season", label: __("Season"), fieldtype: "Link", options: "Crushing Season" },
	{ fieldname: "from_date", label: __("From Date"), fieldtype: "Date" },
	{ fieldname: "to_date", label: __("To Date"), fieldtype: "Date" },
	{ fieldname: "zone", label: __("Zone"), fieldtype: "Link", options: "Sugar Zone" },
	{ fieldname: "circle", label: __("Circle"), fieldtype: "Link", options: "Cane Circle" },
	{ fieldname: "village", label: __("Village"), fieldtype: "Link", options: "Cane Village",
		get_query: () => ({ filters: { circle: frappe.query_report.get_filter_value("circle") || undefined } }) },
	{ fieldname: "variety", label: __("Variety"), fieldtype: "Link", options: "Cane Variety" },
	{ fieldname: "crop_type", label: __("Plant / Ratoon"), fieldtype: "Select", options: "\nPlant\nRatoon" },
	{ fieldname: "survey_for", label: __("Survey For"), fieldtype: "Select", options: "Company\nCompetitor\nAll", default: "Company" },
	],
};
