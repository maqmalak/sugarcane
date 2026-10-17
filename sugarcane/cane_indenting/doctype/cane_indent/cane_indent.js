// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.ui.form.on("Cane Indent", {
	refresh(frm) {
		if (frm.doc.docstatus === 1 && ["Authorized", "Printed"].includes(frm.doc.status)) {
			frm.add_custom_button(frm.doc.print_count ? __("Reprint") : __("Print"), () => {
				const go = (reason) => open_url_post("/api/method/sugarcane.cane_indenting.api.print_pdf",
					{ names: JSON.stringify([frm.doc.name]), reason: reason || "" });
				if (!frm.doc.print_count) return go();
				frappe.prompt({ fieldname: "reason", fieldtype: "Small Text", label: __("Why reprint?"), reqd: 1 },
					(v) => go(v.reason), __("Reprint indent"));
			});
		}
	},
});
