// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Depot Dispatch Register"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date" },
		{ fieldname: "depot", label: __("Depot"), fieldtype: "Link", options: "Cane Depot" },
		{ fieldname: "status", label: __("Status"), fieldtype: "Select", options: "\nLoading\nIn Transit\nAt Mill\nReceived\nCancelled" },
	],
};
