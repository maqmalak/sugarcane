// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Grower Ledger"] = {
	filters: [
		{ fieldname: "grower", label: __("Grower"), fieldtype: "Link", options: "Grower" },
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date" },
	],
};
