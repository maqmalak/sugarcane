// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Grower Trial Balance"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date" },
		{ fieldname: "circle", label: __("Circle"), fieldtype: "Link", options: "Cane Circle" },
	],
};
