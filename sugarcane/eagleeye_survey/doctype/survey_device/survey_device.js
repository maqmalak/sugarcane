// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.ui.form.on("Survey Device", {
	refresh(frm) {
		if (frm.is_new()) return;
		if (frm.doc.status !== "Approved") {
			frm.add_custom_button(__("Approve"), () => frm.set_value("status", "Approved").then(() => frm.save())).addClass("btn-primary");
		}
		if (frm.doc.status !== "Blocked") {
			frm.add_custom_button(__("Block"), () => frm.set_value("status", "Blocked").then(() => frm.save()));
		}
	},
});
