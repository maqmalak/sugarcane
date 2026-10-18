// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Voucher Register"] = {
	filters: [
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date" },
		{ fieldname: "voucher_code", label: __("Voucher"), fieldtype: "Select", options: "\nJV\nBPV\nBRV\nCPV\nCRV" },
	],
};
