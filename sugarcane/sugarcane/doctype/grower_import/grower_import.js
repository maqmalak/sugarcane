// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.ui.form.on("Grower Import", {
	setup(frm) {
		frappe.realtime.on("grower_import_done", (data) => {
			if (data.name === frm.doc.name) frm.reload_doc();
		});
	},
	refresh(frm) {
		frm.add_custom_button(__("Download Template"), () => {
			window.open(
				"/api/method/sugarcane.sugarcane.doctype.grower_import.grower_import.download_template"
			);
		});
		if (!frm.is_new() && frm.doc.import_file && !["Queued", "In Progress"].includes(frm.doc.status)) {
			frm.add_custom_button(
				frm.doc.status === "Draft" ? __("Start Import") : __("Import Again"),
				() => frm.call("start_import").then(() => frm.reload_doc()),
			).addClass("btn-primary");
		}
		const colors = {
			Completed: "green", "Completed with Errors": "orange", Failed: "red", Queued: "blue", "In Progress": "blue",
		};
		if (colors[frm.doc.status]) frm.page.set_indicator(__(frm.doc.status), colors[frm.doc.status]);
		if (frm.doc.status === "Completed with Errors") {
			frm.set_intro(
				__("{0} rows failed. Download <b>Rows with Errors</b>, fix them and import that file again.", [frm.doc.failed_rows]),
				"orange",
			);
		}
	},
});
