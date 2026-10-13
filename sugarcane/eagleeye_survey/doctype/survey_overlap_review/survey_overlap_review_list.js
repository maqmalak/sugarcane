// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.listview_settings["Survey Overlap Review"] = {
	get_indicator(doc) {
		const colours = { Open: "orange", Accepted: "blue", "Rejected Survey": "red", "Rejected Other Survey": "red" };
		return [__(doc.status), colours[doc.status] || "gray", `status,=,${doc.status}`];
	},
	onload(list) {
		if (!frappe.user.has_role(["System Manager", "Cane Manager", "Cane Admin", "Circle Officer"])) return;
		list.page.add_inner_button(__("Re-check overlaps"), () =>
			frappe.require("/assets/sugarcane/js/recheck_overlaps.js", () => window.sugarcane_recheck_overlaps()));
	},
};
