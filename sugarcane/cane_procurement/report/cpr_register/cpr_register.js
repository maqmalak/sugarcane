// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["CPR Register"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date" },
		{ fieldname: "circle", label: __("Circle"), fieldtype: "Link", options: "Cane Circle" },
		{ fieldname: "entry_type", label: __("Entry"), fieldtype: "Select", options: "\nELP Verified\nGate" },
		{ fieldname: "payment_status", label: __("Payment"), fieldtype: "Select", options: "\nUnpaid\nPaid" },
	],
};
