// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.ui.form.on("Survey Overlap Review", {
	refresh(frm) {
		if (frm.is_new() || frm.doc.status !== "Open") return;
		const decide = (status, label) =>
			frappe.confirm(__("{0}?", [label]), () => {
				frm.set_value("status", status);
				frm.save();
			});
		frm.add_custom_button(__("Accept Both"), () => decide("Accepted", __("Keep both surveys")), __("Decide"));
		frm.add_custom_button(__("Reject {0}", [frm.doc.survey]), () =>
			decide("Rejected Survey", __("Cancel survey {0}", [frm.doc.survey])), __("Decide"));
		frm.add_custom_button(__("Reject {0}", [frm.doc.other_survey]), () =>
			decide("Rejected Other Survey", __("Cancel survey {0}", [frm.doc.other_survey])), __("Decide"));
		frm.add_custom_button(__("Compare on Map"), () =>
			window.open(`/sugar/survey?focus=${encodeURIComponent(frm.doc.survey)}`, "_blank"));
	},
});
