// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.ui.form.on("Sugar Settings", {
	setup(frm) {
		const by_company = (extra = {}) => () => ({ filters: { company: frm.doc.company, is_group: 0, ...extra } });
		[
			"grower_payable_account", "cane_purchase_clearing_account", "tpt_payable_account", "road_cess_payable_account",
			"grower_loan_account", "cash_counter_account", "cane_purchase_govt_account", "subsidy_purchase_account",
			"additional_subsidy_account", "road_cess_expense_account",
		].forEach((f) => frm.set_query(f, by_company()));
		frm.set_query("cost_center", by_company());
		frm.set_query("cane_yard_warehouse", by_company());
		frm.set_query("active_season", () => ({ filters: { company: frm.doc.company } }));
	},
	refresh(frm) {
		if (frm.doc.company) {
			frm.add_custom_button(__("Set Up Accounts"), () =>
				frappe.call({
					method: "sugarcane.sugarcane.doctype.sugar_settings.sugar_settings.setup_accounts",
					freeze: true,
					freeze_message: __("Creating cane ledgers, warehouse and item…"),
				}).then(() => {
					frappe.show_alert({ message: __("Cane accounts are ready"), indicator: "green" });
					frm.reload_doc();
				})
			);
		}
	},
});
