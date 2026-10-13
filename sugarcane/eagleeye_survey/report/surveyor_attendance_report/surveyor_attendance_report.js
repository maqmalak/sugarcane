// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Surveyor Attendance Report"] = {
	filters: [
	{ fieldname: "from_date", label: __("From Date"), fieldtype: "Date", default: frappe.datetime.add_days(frappe.datetime.get_today(), -14) },
	{ fieldname: "to_date", label: __("To Date"), fieldtype: "Date", default: frappe.datetime.get_today() },
	{ fieldname: "surveyor", label: __("Surveyor"), fieldtype: "Link", options: "User" },
	{ fieldname: "circle", label: __("Circle"), fieldtype: "Link", options: "Cane Circle" },
	{ fieldname: "status", label: __("Status"), fieldtype: "Select", options: "\nPresent\nHalf Day\nOut of Area\nAbsent" },
	],
};
