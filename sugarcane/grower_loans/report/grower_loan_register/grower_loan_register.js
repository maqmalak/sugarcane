// Copyright (c) 2026, MicroMax and contributors
// For license information, please see license.txt

frappe.query_reports["Grower Loan Register"] = {
	filters: [
		{ fieldname: "circle", label: __("Circle"), fieldtype: "Link", options: "Cane Circle" },
		{ fieldname: "status", label: __("Status"), fieldtype: "Select", options: "\nDraft\nApproved\nDisbursed\nRecovered\nWritten Off" },
		{ fieldname: "loan_type", label: __("Loan Type"), fieldtype: "Link", options: "Grower Loan Type" },
	],
};
