// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.ui.form.on("Cane Survey", {
	setup(frm) {
		frm.set_query("village", () => ({ filters: { circle: frm.doc.circle, is_active: 1 } }));
		frm.set_query("grower", () => ({ filters: { circle: frm.doc.circle || undefined, disabled: 0 } }));
		frm.set_query("season", () => ({ filters: { status: ["!=", "Closed"] } }));
	},
	circle(frm) {
		if (frm.doc.village) frm.set_value("village", null);
	},
	grower(frm) {
		if (!frm.doc.grower) return;
		frappe.db.get_value("Grower", frm.doc.grower, ["circle", "village"]).then(({ message }) => {
			if (message && !frm.doc.circle) frm.set_value("circle", message.circle);
			if (message && !frm.doc.village) frm.set_value("village", message.village);
		});
	},
	refresh(frm) {
		if (frm.doc.docstatus === 1 && frappe.user.has_role(["System Manager", "Cane Manager", "Cane Admin", "Circle Officer"])) {
			frm.add_custom_button(__("Re-check overlaps"), () =>
				frappe.call({
					method: "sugarcane.eagleeye_survey.overlaps.recheck_survey",
					args: { name: frm.doc.name },
					freeze: true,
					freeze_message: __("Checking this field against the season's surveys…"),
				}).then(({ message }) => {
					const n = (message.new_reviews || []).length;
					frappe.show_alert({
						message: n ? __("{0} new overlap review(s) opened", [n]) : __("No new overlaps (status: {0})", [__(message.overlap_status || "Clear")]),
						indicator: n ? "orange" : "green",
					});
					frm.reload_doc();
				}));
		}
		if (!frm.is_new()) {
			frm.add_custom_button(__("Open on Survey Map"), () =>
				window.open(`/sugar/survey?focus=${encodeURIComponent(frm.doc.name)}`, "_blank"));
		}
		const colours = { Clear: "green", "Under Review": "orange", Accepted: "blue", Rejected: "red" };
		if (frm.doc.overlap_status && frm.doc.docstatus === 1) {
			frm.dashboard.add_indicator(__("Overlap: {0}", [__(frm.doc.overlap_status)]), colours[frm.doc.overlap_status] || "gray");
		}
		if (frm.doc.calc_area_acres) {
			frm.dashboard.add_indicator(__("Measured {0} acres", [frm.doc.calc_area_acres]), "blue");
		}
	},
});
