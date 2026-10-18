// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Mill Stoppage Report"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date" },
		{ fieldname: "category", label: __("Category"), fieldtype: "Select", options: "\nMechanical\nElectrical\nProcess\nNo Cane\nPower\nPlanned Cleaning\nOther" },
	],
};
