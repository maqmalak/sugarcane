// Season-wide overlap re-check dialog, used by the Cane Survey and Survey Overlap Review lists
window.sugarcane_recheck_overlaps = function () {
	const d = new frappe.ui.Dialog({
		title: __("Re-check overlaps"),
		fields: [
			{ fieldname: "season", label: __("Season"), fieldtype: "Link", options: "Crushing Season" },
			{ fieldname: "circle", label: __("Circle (optional)"), fieldtype: "Link", options: "Cane Circle" },
			{ fieldtype: "HTML", options: `<p class="text-muted small">${__("Every submitted survey is checked again against the current tolerance in Sugar Settings. Pairs that already have a review (open or decided) are skipped, so running this twice opens nothing new.")}</p>` },
		],
		primary_action_label: __("Re-check"),
		primary_action(values) {
			d.hide();
			frappe.call({
				method: "sugarcane.eagleeye_survey.overlaps.recheck_season",
				args: values,
				freeze: true,
				freeze_message: __("Re-checking overlaps…"),
			}).then(({ message: m }) => {
				frappe.msgprint({
					title: __("Overlaps re-checked"),
					indicator: m.new_reviews ? "orange" : "green",
					message: __("{0} surveys checked at {1}% tolerance. {2} new review(s) opened; {3} open in total.", [m.checked, m.tolerance_pct, m.new_reviews, m.open_reviews]),
				});
				cur_list && cur_list.refresh();
			});
		},
	});
	frappe.db.get_single_value("Sugar Settings", "active_season").then((s) => d.set_value("season", s));
	d.show();
};
