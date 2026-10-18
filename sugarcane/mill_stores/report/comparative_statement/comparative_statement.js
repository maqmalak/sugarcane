// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Comparative Statement"] = {
	filters: [
		{ fieldname: "request_for_quotation", label: __("Inquiry (RFQ)"), fieldtype: "Link", options: "Request for Quotation" },
		{ fieldname: "item_code", label: __("Item"), fieldtype: "Link", options: "Item" },
		{ fieldname: "from_date", label: __("From"), fieldtype: "Date" },
		{ fieldname: "to_date", label: __("To"), fieldtype: "Date" },
	],
};
