// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["ELP Journey Time"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date", default: frappe.datetime.add_days(frappe.datetime.get_today(), -6) },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date", default: frappe.datetime.get_today() },
		{ fieldname: "circle", label: __("Circle"), fieldtype: "Link", options: "Cane Circle" },
		{ fieldname: "point_name", label: __("Point"), fieldtype: "Data" },
	],
};
