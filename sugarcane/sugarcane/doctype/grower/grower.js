// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.ui.form.on("Grower", {
	setup(frm) {
		frm.set_query("village", () => ({ filters: { circle: frm.doc.circle, is_active: 1 } }));
		frm.set_query("account", "accounts", (doc, cdt, cdn) => {
			const row = locals[cdt][cdn];
			return { filters: { company: row.company, account_type: "Payable", is_group: 0 } };
		});
	},
	circle(frm) {
		if (frm.doc.village) frm.set_value("village", null);
	},
	cnic(frm) {
		const digits = (frm.doc.cnic || "").replace(/[\s-]/g, "");
		if (/^\d{13}$/.test(digits)) {
			const dashed = `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
			if (dashed !== frm.doc.cnic) frm.set_value("cnic", dashed);
		}
	},
	refresh(frm) {
		if (frm.is_new()) {
			frm.set_intro(__("The grower ID is made on save: circle code - village code - serial, e.g. 001-001-0001."), "blue");
			return;
		}
		frm.add_custom_button(__("Grower Ledger"), () =>
			frappe.set_route("query-report", "General Ledger", {
				party_type: "Grower", party: [frm.doc.name], group_by: "Group by Voucher (Consolidated)",
			}), __("View"));
		frm.add_custom_button(__("Passbook"), () =>
			frappe.set_route("List", "Grower Passbook", { grower: frm.doc.name }), __("View"));
	},
});
