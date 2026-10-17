// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.ui.form.on("Indent Batch", {
	refresh(frm) {
		if (frm.doc.docstatus === 1 && frm.doc.status !== "Cancelled") {
			const reprint = frm.doc.status === "Printed";
			frm.add_custom_button(reprint ? __("Reprint indents") : __("Print indents"), () => {
				const go = (reason) => open_url_post("/api/method/sugarcane.cane_indenting.api.print_pdf",
					{ batch: frm.doc.name, include_printed: reprint ? 1 : 0, reason: reason || "" });
				if (!reprint) return go();
				frappe.prompt({ fieldname: "reason", fieldtype: "Small Text", label: __("Why reprint?"), reqd: 1 },
					(v) => go(v.reason), __("Reprint indents"));
			}).addClass("btn-primary");
		}
		frm.add_custom_button(__("Open in React"), () => window.open(`/sugar/indenting/d/indent-batch/${encodeURIComponent(frm.doc.name)}`));
	},
});
