// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["ELP Pending Registrations"] = {
	filters: [
		{ fieldname: "date", label: __("Date"), fieldtype: "Date", default: frappe.datetime.get_today() },
		{ fieldname: "circle", label: __("Circle"), fieldtype: "Link", options: "Cane Circle" },
	],
};
