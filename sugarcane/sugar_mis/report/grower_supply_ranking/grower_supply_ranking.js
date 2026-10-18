// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Grower Supply Ranking"] = {
	filters: [
		{ fieldname: "season", label: __("Season"), fieldtype: "Link", options: "Crushing Season" },
		{ fieldname: "circle", label: __("Circle"), fieldtype: "Link", options: "Cane Circle" },
		{ fieldname: "top", label: __("Top"), fieldtype: "Int", default: 100 },
	],
};
