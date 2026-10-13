// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.listview_settings["Cane Survey"] = {
	add_fields: ["overlap_status", "survey_for"],
	get_indicator(doc) {
		if (doc.docstatus === 2) return [__("Cancelled"), "red", "docstatus,=,2"];
		if (doc.docstatus === 0) return [__("Draft"), "gray", "docstatus,=,0"];
		const colours = { Clear: "green", "Under Review": "orange", Accepted: "blue", Rejected: "red" };
		return [__(doc.overlap_status || "Submitted"), colours[doc.overlap_status] || "blue", `overlap_status,=,${doc.overlap_status}`];
	},
	onload(list) {
		if (frappe.user.has_role(["System Manager", "Cane Manager", "Cane Admin", "Circle Officer"])) {
			list.page.add_inner_button(__("Re-check overlaps"), () =>
				frappe.require("/assets/sugarcane/js/recheck_overlaps.js", () => window.sugarcane_recheck_overlaps()));
		}
	},
};
