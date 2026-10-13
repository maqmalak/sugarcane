import type { FormFieldMeta } from "@/components/forms/field-primitives";

/**
 * ERPNext-style form definitions for the custom micromax DocTypes.
 * Field names/options mirror the DocType JSON in the `micromax` Frappe app so
 * create/update payloads round-trip correctly through frappe-react-sdk.
 */

export const LC_PROFORMA_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_identification", label: "Basic Information", fieldtype: "Section Break" },
  { fieldname: "proforma_no", label: "Proforma No.", fieldtype: "Data", read_only: true },
  { fieldname: "proforma_date", label: "Proforma Date", fieldtype: "Date", reqd: true, default: "Today" },
  { fieldname: "column_break_0", fieldtype: "Column Break" },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "customer", label: "Customer / Buyer", fieldtype: "Link", options: "Customer", reqd: true },
  { fieldname: "buyer_po_no", label: "Buyer PO", fieldtype: "Data" },
  { fieldname: "export_order", label: "Export Order", fieldtype: "Link", options: "Sales Order", read_only: true },
  { fieldname: "currency", label: "Currency", fieldtype: "Link", options: "Currency", default: "USD" },
  { fieldname: "exchange_rate", label: "Exchange Rate", fieldtype: "Float", precision: 6 },

  { fieldname: "section_break_lc", label: "LC Information", fieldtype: "Section Break" },
  { fieldname: "lc_required", label: "LC Required", fieldtype: "Check", default: 0 },
  { fieldname: "lc_no", label: "LC Number", fieldtype: "Data" },
  { fieldname: "lc_date", label: "LC Date", fieldtype: "Date" },
  { fieldname: "lc_type", label: "LC Type", fieldtype: "Select", options: "\nIrrevocable\nRevocable\nStandby\nConfirmed Irrevocable" },
  { fieldname: "lc_issuing_bank", label: "Issuing Bank", fieldtype: "Data" },
  { fieldname: "lc_advising_bank", label: "Advising Bank", fieldtype: "Data" },
  { fieldname: "lc_confirming_bank", label: "Confirming Bank", fieldtype: "Data" },
  { fieldname: "col_break_lc1", fieldtype: "Column Break" },
  { fieldname: "lc_amount", label: "LC Amount", fieldtype: "Currency" },
  { fieldname: "lc_currency", label: "LC Currency", fieldtype: "Link", options: "Currency", default: "USD" },
  { fieldname: "lc_expiry_date", label: "LC Expiry Date", fieldtype: "Date" },
  { fieldname: "lc_expiry_place", label: "LC Expiry Place", fieldtype: "Data" },
  { fieldname: "latest_shipment_date", label: "Latest Shipment Date", fieldtype: "Date" },
  { fieldname: "partial_shipment_allowed", label: "Partial Shipment Allowed", fieldtype: "Check" },
  { fieldname: "transshipment_allowed", label: "Transshipment Allowed", fieldtype: "Check" },

  { fieldname: "section_break_shipment", label: "Shipment", fieldtype: "Section Break" },
  { fieldname: "port_of_loading", label: "Port of Loading", fieldtype: "Data" },
  { fieldname: "port_of_discharge", label: "Port of Discharge", fieldtype: "Data" },
  { fieldname: "final_destination", label: "Final Destination", fieldtype: "Data" },
  { fieldname: "country_of_destination", label: "Country", fieldtype: "Link", options: "Country" },
  { fieldname: "col_break_ship2", fieldtype: "Column Break" },
  { fieldname: "shipment_mode", label: "Shipment Mode", fieldtype: "Select", options: "\nSea\nAir\nRoad\nRail\nMultimodal" },
  { fieldname: "incoterm", label: "Incoterm", fieldtype: "Select", options: "EXW\nFCA\nFAS\nFOB\nCFR\nCIF\nCPT\nCIP\nDAP\nDPU\nDDP" },
  { fieldname: "payment_terms", label: "Payment Terms", fieldtype: "Link", options: "Payment Terms Template" },

  { fieldname: "section_break_banking", label: "Banking", fieldtype: "Section Break" },
  { fieldname: "beneficiary_bank", label: "Beneficiary Bank", fieldtype: "Data" },
  { fieldname: "bank_account", label: "Bank Account", fieldtype: "Link", options: "Bank Account" },
  { fieldname: "col_break_bank2", fieldtype: "Column Break" },
  { fieldname: "swift_code", label: "SWIFT Code", fieldtype: "Data" },
  { fieldname: "bank_branch", label: "Bank Branch", fieldtype: "Data" },
  { fieldname: "correspondent_bank", label: "Correspondent Bank", fieldtype: "Data" },

  { fieldname: "section_break_totals", label: "Totals", fieldtype: "Section Break" },
  { fieldname: "total_quantity", label: "Total Quantity", fieldtype: "Float", read_only: true },
  { fieldname: "total_cartons", label: "Total Cartons", fieldtype: "Int", read_only: true },
  { fieldname: "col_break_tot2", fieldtype: "Column Break" },
  { fieldname: "total_net_weight", label: "Total Net Weight", fieldtype: "Float", read_only: true },
  { fieldname: "total_gross_weight", label: "Total Gross Weight", fieldtype: "Float", read_only: true },
    { fieldname: "total_proforma_value", label: "Total Proforma Value", fieldtype: "Currency", read_only: true },
];

export const EXPORT_SHIPMENT_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_links", label: "Links", fieldtype: "Section Break" },
  { fieldname: "shipment_no", label: "Shipment No.", fieldtype: "Data", read_only: true },
  { fieldname: "shipment_date", label: "Shipment Date", fieldtype: "Date", default: "Today" },
  { fieldname: "customer", label: "Customer / Buyer", fieldtype: "Link", options: "Customer", reqd: true },
  { fieldname: "sales_order", label: "Sales Order", fieldtype: "Link", options: "Sales Order" },
  { fieldname: "lc_proforma", label: "LC Proforma", fieldtype: "Link", options: "LC Proforma" },
  { fieldname: "lc_no", label: "LC No.", fieldtype: "Data" },
  { fieldname: "commercial_invoice_no", label: "Commercial Invoice No.", fieldtype: "Data" },
  { fieldname: "packing_list_no", label: "Packing List No.", fieldtype: "Data" },
  { fieldname: "col_break_docs", fieldtype: "Column Break" },
  { fieldname: "bill_of_lading_no", label: "Bill of Lading No.", fieldtype: "Data" },
  { fieldname: "container_no", label: "Container No.", fieldtype: "Data" },
  { fieldname: "shipping_line", label: "Shipping Line", fieldtype: "Data" },
  { fieldname: "vessel", label: "Vessel", fieldtype: "Data" },
  { fieldname: "port_of_loading", label: "Port of Loading", fieldtype: "Data" },
  { fieldname: "port_of_discharge", label: "Port of Discharge", fieldtype: "Data" },
  { fieldname: "final_destination", label: "Final Destination", fieldtype: "Data" },
  { fieldname: "col_break_dates", fieldtype: "Column Break" },
  { fieldname: "etd", label: "ETD", fieldtype: "Datetime" },
  { fieldname: "eta", label: "ETA", fieldtype: "Datetime" },
  { fieldname: "actual_shipment_date", label: "Actual Shipment Date", fieldtype: "Date" },
  { fieldname: "shipment_status", label: "Shipment Status", fieldtype: "Select", options: "\nPlanned\nBooking\nStuffing\nShipped\nIn Transit\nArrived\nDelivered\nClosed" },
];
export const IMPORT_SHIPMENT_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_links", label: "Links", fieldtype: "Section Break" },
  { fieldname: "shipment_no", label: "Shipment No.", fieldtype: "Data", read_only: true },
  { fieldname: "shipment_date", label: "Shipment Date", fieldtype: "Date", default: "Today" },
  { fieldname: "supplier", label: "Supplier", fieldtype: "Link", options: "Supplier", reqd: true },
  { fieldname: "purchase_order", label: "Purchase Order", fieldtype: "Link", options: "Purchase Order" },
  { fieldname: "purchase_receipt", label: "Purchase Receipt", fieldtype: "Link", options: "Purchase Receipt" },
  { fieldname: "import_cost_sheet", label: "Import Cost Sheet", fieldtype: "Link", options: "Import Cost Sheet", read_only: true },
  { fieldname: "col_break_docs", fieldtype: "Column Break" },
  { fieldname: "bill_of_lading", label: "Bill of Lading", fieldtype: "Data" },
  { fieldname: "container_no", label: "Container No.", fieldtype: "Data" },
  { fieldname: "shipping_line", label: "Shipping Line", fieldtype: "Data" },
  { fieldname: "vessel", label: "Vessel", fieldtype: "Data" },
  { fieldname: "port_of_loading", label: "Port of Loading", fieldtype: "Data" },
  { fieldname: "port_of_discharge", label: "Port of Discharge", fieldtype: "Data" },
  { fieldname: "col_break_dates", fieldtype: "Column Break" },
  { fieldname: "etd", label: "ETD", fieldtype: "Datetime" },
  { fieldname: "eta", label: "ETA", fieldtype: "Datetime" },
  { fieldname: "actual_arrival", label: "Actual Arrival", fieldtype: "Date" },
  { fieldname: "section_break_clearing", label: "Clearing & Customs", fieldtype: "Section Break" },
  { fieldname: "clearing_agent", label: "Clearing Agent", fieldtype: "Link", options: "Supplier" },
  { fieldname: "customs_declaration_no", label: "Customs Declaration No.", fieldtype: "Data" },
  { fieldname: "col_break_clearing", fieldtype: "Column Break" },
  { fieldname: "duty_amount", label: "Duty Amount", fieldtype: "Currency" },
  { fieldname: "tax_amount", label: "Tax Amount", fieldtype: "Currency" },
  { fieldname: "clearance_date", label: "Clearance Date", fieldtype: "Date" },
  { fieldname: "shipment_status", label: "Shipment Status", fieldtype: "Select", options: "\nPlanned\nBooking\nStuffing\nShipped\nIn Transit\nArrived\nDelivered\nClosed" },
];

export const IMPORT_COST_SHEET_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_links", label: "Links", fieldtype: "Section Break" },
  { fieldname: "cost_sheet_date", label: "Cost Sheet Date", fieldtype: "Date", default: "Today" },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "supplier", label: "Supplier", fieldtype: "Link", options: "Supplier", reqd: true },
  { fieldname: "purchase_order", label: "Purchase Order", fieldtype: "Link", options: "Purchase Order" },
  { fieldname: "import_shipment", label: "Import Shipment", fieldtype: "Link", options: "Import Shipment" },
  { fieldname: "purchase_receipt", label: "Purchase Receipt", fieldtype: "Link", options: "Purchase Receipt" },
  { fieldname: "col_break_1", fieldtype: "Column Break" },
  { fieldname: "currency", label: "Currency", fieldtype: "Link", options: "Currency", default: "USD", reqd: true },
  {
    fieldname: "expense_account",
    label: "Expense Account",
    fieldtype: "Link",
    options: "Account",
    description: "Used for each charge when generating a Landed Cost Voucher from this cost sheet. Falls back to Buying Settings › Default Landed Cost Expense Account if left blank.",
  },
  { fieldname: "total_purchase_value", label: "Total Purchase Value", fieldtype: "Currency", read_only: true },
  { fieldname: "total_landed_cost", label: "Total Landed Cost", fieldtype: "Currency", read_only: true },
];
/** Child-table column metadata (for the editable row grids). */
export const LC_PROFORMA_ITEM_COLUMNS: FormFieldMeta[] = [
  { fieldname: "item", label: "Item", fieldtype: "Link", options: "Item", reqd: true },
  { fieldname: "item_name", label: "Item Name", fieldtype: "Data", read_only: true },
  { fieldname: "style_no", label: "Style", fieldtype: "Data" },
  { fieldname: "color", label: "Color", fieldtype: "Data" },
  { fieldname: "size", label: "Size", fieldtype: "Data" },
  { fieldname: "hs_code", label: "HS Code", fieldtype: "Data" },
  { fieldname: "quantity", label: "Qty", fieldtype: "Float", reqd: true },
  { fieldname: "uom", label: "UOM", fieldtype: "Link", options: "UOM" },
  { fieldname: "rate", label: "Rate", fieldtype: "Currency", precision: 4 },
  { fieldname: "amount", label: "Amount", fieldtype: "Currency", read_only: true },
  { fieldname: "cartons", label: "Cartons", fieldtype: "Int" },
  { fieldname: "net_weight", label: "Net Wt.", fieldtype: "Float" },
  { fieldname: "gross_weight", label: "Gross Wt.", fieldtype: "Float" },
];

export const IMPORT_COST_ITEM_COLUMNS: FormFieldMeta[] = [
  { fieldname: "item", label: "Item", fieldtype: "Link", options: "Item", reqd: true },
  { fieldname: "item_name", label: "Item Name", fieldtype: "Data", read_only: true },
  { fieldname: "quantity", label: "Qty", fieldtype: "Float" },
  { fieldname: "uom", label: "UOM", fieldtype: "Link", options: "UOM" },
  { fieldname: "purchase_value", label: "Purchase Value", fieldtype: "Currency" },
  { fieldname: "freight", label: "Freight", fieldtype: "Currency" },
  { fieldname: "insurance", label: "Insurance", fieldtype: "Currency" },
  { fieldname: "customs_duty", label: "Customs Duty", fieldtype: "Currency" },
  { fieldname: "additional_duty", label: "Additional Duty", fieldtype: "Currency" },
  { fieldname: "sales_tax", label: "Sales Tax", fieldtype: "Currency" },
  { fieldname: "regulatory_duty", label: "Regulatory Duty", fieldtype: "Currency" },
  { fieldname: "clearing_charges", label: "Clearing", fieldtype: "Currency" },
  { fieldname: "port_charges", label: "Port Charges", fieldtype: "Currency" },
    { fieldname: "other_charges", label: "Other", fieldtype: "Currency" },
];

// ------------------------------------------------------------- Purchase Order (ERPNext standard)

export const PURCHASE_ORDER_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_basic", label: "Basic Information", fieldtype: "Section Break" },
  {
    fieldname: "naming_series",
    label: "Series",
    fieldtype: "Select",
    options: "PUR-ORD-.YYYY.-",
    reqd: true,
    default: "PUR-ORD-.YYYY.-",
  },
  { fieldname: "supplier", label: "Supplier", fieldtype: "Link", options: "Supplier", reqd: true },
  { fieldname: "supplier_name", label: "Supplier Name", fieldtype: "Data", read_only: true },
  { fieldname: "transaction_date", label: "Date", fieldtype: "Date", reqd: true, default: "Today" },
  { fieldname: "schedule_date", label: "Required By", fieldtype: "Date", reqd: true },
  { fieldname: "column_break_po_0", fieldtype: "Column Break" },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "currency", label: "Currency", fieldtype: "Link", options: "Currency", default: "USD", reqd: true },
  { fieldname: "conversion_rate", label: "Exchange Rate", fieldtype: "Float", precision: 6, default: 1, reqd: true },
  { fieldname: "buying_price_list", label: "Price List", fieldtype: "Link", options: "Price List" },

  { fieldname: "section_break_address", label: "Address & Contact", fieldtype: "Section Break" },
  { fieldname: "supplier_address", label: "Supplier Address", fieldtype: "Link", options: "Address" },
  { fieldname: "contact_person", label: "Contact Person", fieldtype: "Link", options: "Contact" },
  { fieldname: "column_break_po_1", fieldtype: "Column Break" },
  { fieldname: "shipping_address", label: "Shipping Address", fieldtype: "Link", options: "Address" },
  { fieldname: "billing_address", label: "Billing Address", fieldtype: "Link", options: "Address" },

  { fieldname: "section_break_terms", label: "Terms", fieldtype: "Section Break" },
  { fieldname: "set_warehouse", label: "Set Target Warehouse", fieldtype: "Link", options: "Warehouse" },
  { fieldname: "incoterm", label: "Incoterm", fieldtype: "Link", options: "Incoterm" },
  { fieldname: "named_place", label: "Named Place", fieldtype: "Data" },
  { fieldname: "column_break_po_2", fieldtype: "Column Break" },
  { fieldname: "payment_terms_template", label: "Payment Terms", fieldtype: "Link", options: "Payment Terms Template" },
  { fieldname: "tc_name", label: "Terms Template", fieldtype: "Link", options: "Terms and Conditions" },
  { fieldname: "terms", label: "Terms and Conditions", fieldtype: "Text Editor" },
];

export const PURCHASE_ORDER_ITEM_COLUMNS: FormFieldMeta[] = [
  { fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item", reqd: true },
  { fieldname: "item_name", label: "Item Name", fieldtype: "Data", read_only: true },
  { fieldname: "schedule_date", label: "Required By", fieldtype: "Date" },
  { fieldname: "qty", label: "Qty", fieldtype: "Float", reqd: true },
  { fieldname: "uom", label: "UOM", fieldtype: "Link", options: "UOM" },
  { fieldname: "rate", label: "Rate", fieldtype: "Currency", precision: 4 },
  { fieldname: "amount", label: "Amount", fieldtype: "Currency", read_only: true },
  { fieldname: "warehouse", label: "Warehouse", fieldtype: "Link", options: "Warehouse" },
  { fieldname: "description", label: "Description", fieldtype: "Data" },
];

// ------------------------------------------------------------ Purchase Receipt (ERPNext standard)

export const PURCHASE_RECEIPT_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_basic", label: "Basic Information", fieldtype: "Section Break" },
  {
    fieldname: "naming_series",
    label: "Series",
    fieldtype: "Select",
    options: "MAT-PRE-.YYYY.-",
    reqd: true,
    default: "MAT-PRE-.YYYY.-",
  },
  { fieldname: "supplier", label: "Supplier", fieldtype: "Link", options: "Supplier", reqd: true },
  { fieldname: "supplier_name", label: "Supplier Name", fieldtype: "Data", read_only: true },
  { fieldname: "supplier_delivery_note", label: "Supplier Delivery Note", fieldtype: "Data" },
  { fieldname: "posting_date", label: "Date", fieldtype: "Date", reqd: true, default: "Today" },
  { fieldname: "column_break_pr_0", fieldtype: "Column Break" },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "currency", label: "Currency", fieldtype: "Link", options: "Currency", default: "USD", reqd: true },
  { fieldname: "conversion_rate", label: "Exchange Rate", fieldtype: "Float", precision: 6, default: 1, reqd: true },
  { fieldname: "buying_price_list", label: "Price List", fieldtype: "Link", options: "Price List" },

  { fieldname: "section_break_pr_warehouse", label: "Warehouse", fieldtype: "Section Break" },
  { fieldname: "set_warehouse", label: "Accepted Warehouse", fieldtype: "Link", options: "Warehouse" },
  { fieldname: "column_break_pr_1", fieldtype: "Column Break" },
  { fieldname: "supplier_warehouse", label: "Supplier Warehouse", fieldtype: "Link", options: "Warehouse" },

  { fieldname: "section_break_pr_terms", label: "Terms", fieldtype: "Section Break" },
  { fieldname: "tc_name", label: "Terms Template", fieldtype: "Link", options: "Terms and Conditions" },
  { fieldname: "column_break_pr_2", fieldtype: "Column Break" },
  { fieldname: "instructions", label: "Instructions", fieldtype: "Text" },
  { fieldname: "terms", label: "Terms and Conditions", fieldtype: "Text Editor" },
];

export const PURCHASE_RECEIPT_ITEM_COLUMNS: FormFieldMeta[] = [
  { fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item", reqd: true },
  { fieldname: "item_name", label: "Item Name", fieldtype: "Data", read_only: true },
  { fieldname: "purchase_order", label: "Purchase Order", fieldtype: "Link", options: "Purchase Order" },
  { fieldname: "received_qty", label: "Received Qty", fieldtype: "Float" },
  { fieldname: "qty", label: "Accepted Qty", fieldtype: "Float", reqd: true },
  { fieldname: "rejected_qty", label: "Rejected Qty", fieldtype: "Float" },
  { fieldname: "uom", label: "UOM", fieldtype: "Link", options: "UOM" },
  { fieldname: "rate", label: "Rate", fieldtype: "Currency", precision: 4 },
  { fieldname: "amount", label: "Amount", fieldtype: "Currency", read_only: true },
  { fieldname: "warehouse", label: "Accepted Warehouse", fieldtype: "Link", options: "Warehouse" },
  { fieldname: "rejected_warehouse", label: "Rejected Warehouse", fieldtype: "Link", options: "Warehouse" },
  { fieldname: "quality_inspection", label: "Quality Inspection", fieldtype: "Link", options: "Quality Inspection" },
];

// ------------------------------------------------------------ Purchase Invoice (ERPNext standard)

export const PURCHASE_INVOICE_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_basic", label: "Basic Information", fieldtype: "Section Break" },
  {
    fieldname: "naming_series",
    label: "Series",
    fieldtype: "Select",
    options: "ACC-PINV-.YYYY.-",
    reqd: true,
    default: "ACC-PINV-.YYYY.-",
  },
  { fieldname: "supplier", label: "Supplier", fieldtype: "Link", options: "Supplier", reqd: true },
  { fieldname: "supplier_name", label: "Supplier Name", fieldtype: "Data", read_only: true },
  { fieldname: "bill_no", label: "Supplier Invoice No", fieldtype: "Data" },
  { fieldname: "bill_date", label: "Supplier Invoice Date", fieldtype: "Date" },
  { fieldname: "posting_date", label: "Posting Date", fieldtype: "Date", reqd: true, default: "Today" },
  { fieldname: "due_date", label: "Due Date", fieldtype: "Date" },
  { fieldname: "column_break_pi_0", fieldtype: "Column Break" },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "currency", label: "Currency", fieldtype: "Link", options: "Currency", default: "USD" },
  { fieldname: "conversion_rate", label: "Exchange Rate", fieldtype: "Float", precision: 6, default: 1 },
  { fieldname: "buying_price_list", label: "Price List", fieldtype: "Link", options: "Price List" },
  { fieldname: "update_stock", label: "Update Stock", fieldtype: "Check", default: 0, description: "Receive stock directly through this invoice (no separate Purchase Receipt)." },

  { fieldname: "section_break_pi_warehouse", label: "Warehouse (used only when Update Stock is checked)", fieldtype: "Section Break" },
  { fieldname: "set_warehouse", label: "Accepted Warehouse", fieldtype: "Link", options: "Warehouse" },
  { fieldname: "column_break_pi_1", fieldtype: "Column Break" },
  { fieldname: "rejected_warehouse", label: "Rejected Warehouse", fieldtype: "Link", options: "Warehouse" },

  { fieldname: "section_break_pi_terms", label: "Terms", fieldtype: "Section Break" },
  { fieldname: "payment_terms_template", label: "Payment Terms", fieldtype: "Link", options: "Payment Terms Template" },
  { fieldname: "tc_name", label: "Terms Template", fieldtype: "Link", options: "Terms and Conditions" },
  { fieldname: "column_break_pi_2", fieldtype: "Column Break" },
  { fieldname: "terms", label: "Terms and Conditions", fieldtype: "Text Editor" },
];

export const PURCHASE_INVOICE_ITEM_COLUMNS: FormFieldMeta[] = [
  { fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item", reqd: true },
  { fieldname: "item_name", label: "Item Name", fieldtype: "Data", read_only: true },
  { fieldname: "purchase_order", label: "Purchase Order", fieldtype: "Link", options: "Purchase Order" },
  { fieldname: "purchase_receipt", label: "Purchase Receipt", fieldtype: "Link", options: "Purchase Receipt" },
  { fieldname: "qty", label: "Qty", fieldtype: "Float", reqd: true },
  { fieldname: "uom", label: "UOM", fieldtype: "Link", options: "UOM" },
  { fieldname: "rate", label: "Rate", fieldtype: "Currency", precision: 4 },
  { fieldname: "amount", label: "Amount", fieldtype: "Currency", read_only: true },
  { fieldname: "warehouse", label: "Accepted Warehouse", fieldtype: "Link", options: "Warehouse" },
  { fieldname: "expense_account", label: "Expense Account", fieldtype: "Link", options: "Account" },
];

// ------------------------------------------------------------ Landed Cost Voucher (ERPNext standard)

export const LANDED_COST_VOUCHER_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_lcv_basic", label: "Basic Information", fieldtype: "Section Break" },
  {
    fieldname: "naming_series",
    label: "Series",
    fieldtype: "Select",
    options: "MAT-LCV-.YYYY.-",
    reqd: true,
    default: "MAT-LCV-.YYYY.-",
  },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "posting_date", label: "Posting Date", fieldtype: "Date", reqd: true, default: "Today" },
  { fieldname: "column_break_lcv_0", fieldtype: "Column Break" },
  {
    fieldname: "distribute_charges_based_on",
    label: "Distribute Charges Based On",
    fieldtype: "Select",
    options: "Qty\nAmount\nDistribute Manually",
    reqd: true,
    default: "Qty",
  },
  { fieldname: "total_taxes_and_charges", label: "Total Landed Cost", fieldtype: "Currency", read_only: true },
];

/** "Vouchers" table — which submitted Purchase Receipt(s)/Invoice(s) this LCV applies to. */
export const LANDED_COST_RECEIPT_COLUMNS: FormFieldMeta[] = [
  {
    fieldname: "receipt_document_type",
    label: "Type",
    fieldtype: "Select",
    options: "Purchase Receipt\nPurchase Invoice",
    reqd: true,
  },
  { fieldname: "receipt_document", label: "Document", fieldtype: "Dynamic Link", options: "receipt_document_type", reqd: true },
  { fieldname: "supplier", label: "Supplier", fieldtype: "Data", read_only: true },
  { fieldname: "posting_date", label: "Posting Date", fieldtype: "Date", read_only: true },
  { fieldname: "grand_total", label: "Grand Total", fieldtype: "Currency", read_only: true },
];

/** "Receipt Items" table — read-only, populated server-side from the vouchers above. */
export const LANDED_COST_ITEM_COLUMNS: FormFieldMeta[] = [
  { fieldname: "item_code", label: "Item", fieldtype: "Data", read_only: true },
  { fieldname: "receipt_document", label: "From", fieldtype: "Data", read_only: true },
  { fieldname: "qty", label: "Qty", fieldtype: "Float", read_only: true },
  { fieldname: "rate", label: "Rate", fieldtype: "Currency", read_only: true },
  { fieldname: "amount", label: "Amount", fieldtype: "Currency", read_only: true },
  { fieldname: "applicable_charges", label: "Applicable Charges", fieldtype: "Currency", read_only: true },
  { fieldname: "cost_center", label: "Cost Center", fieldtype: "Data", read_only: true },
];

/** "Landed Cost" taxes table — the charges (freight, duty, insurance, ...) being allocated. */
export const LANDED_COST_TAXES_COLUMNS: FormFieldMeta[] = [
  { fieldname: "description", label: "Description", fieldtype: "Data", reqd: true },
  { fieldname: "expense_account", label: "Expense Account", fieldtype: "Link", options: "Account", reqd: true },
  { fieldname: "amount", label: "Amount", fieldtype: "Currency", reqd: true },
];

// ------------------------------------------------------------------ Journal Entry

export const JOURNAL_ENTRY_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_je_basic", label: "Basic Information", fieldtype: "Section Break" },
  {
    fieldname: "voucher_type",
    label: "Entry Type",
    fieldtype: "Select",
    options:
      "Journal Entry\nBank Entry\nCash Entry\nCredit Card Entry\nDebit Note\nCredit Note\nContra Entry\nExcise Entry\nWrite Off Entry\nOpening Entry\nDepreciation Entry\nExchange Rate Revaluation\nDeferred Revenue\nDeferred Expense",
    reqd: true,
    default: "Journal Entry",
  },
  {
    fieldname: "from_template",
    label: "From Template",
    fieldtype: "Link",
    options: "Journal Entry Template",
    description: "Optional — load a saved template's accounting lines below.",
  },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "posting_date", label: "Posting Date", fieldtype: "Date", reqd: true, default: "Today" },
  { fieldname: "column_break_je_0", fieldtype: "Column Break" },
  { fieldname: "total_debit", label: "Total Debit", fieldtype: "Currency", read_only: true },
  { fieldname: "total_credit", label: "Total Credit", fieldtype: "Currency", read_only: true },
  { fieldname: "section_break_je_remark", label: "Reference", fieldtype: "Section Break" },
  { fieldname: "user_remark", label: "Remark", fieldtype: "Text" },
  // Shown/hidden together via the "Toggle Extra Fields" header button — its own
  // (untitled) section so `user_remark` above stays full-width, while these pair
  // up side by side (each Column Break starts a new 2-field row).
  { fieldname: "section_break_je_extra", fieldtype: "Section Break" },
  { fieldname: "mode_of_payment", label: "Mode of Payment", fieldtype: "Link", options: "Mode of Payment", hidden: true },
  { fieldname: "bill_no", label: "Bill No", fieldtype: "Data", hidden: true },
  { fieldname: "column_break_je_extra_1", fieldtype: "Column Break" },
  { fieldname: "bill_date", label: "Bill Date", fieldtype: "Date", hidden: true },
  { fieldname: "due_date", label: "Due Date", fieldtype: "Date", hidden: true },
  { fieldname: "column_break_je_extra_2", fieldtype: "Column Break" },
  { fieldname: "is_opening", label: "Is Opening", fieldtype: "Select", options: "No\nYes", hidden: true },
  { fieldname: "pay_to_recd_from", label: "Pay To / Recd From", fieldtype: "Data", hidden: true },
];

/** Fieldnames toggled by the Journal Entry form's "Toggle Extra Fields" button. */
export const JOURNAL_ENTRY_EXTRA_FIELDNAMES = [
  "mode_of_payment",
  "bill_no",
  "bill_date",
  "due_date",
  "is_opening",
  "pay_to_recd_from",
] as const;

/** "Accounting Entries" table — the actual debit/credit lines. Must balance to save. */
export const JOURNAL_ENTRY_ACCOUNT_COLUMNS: FormFieldMeta[] = [
  { fieldname: "account", label: "Account", fieldtype: "Link", options: "Account", reqd: true },
  {
    fieldname: "party_type",
    label: "Party Type",
    fieldtype: "Select",
    options: "\nCustomer\nSupplier\nEmployee\nShareholder",
  },
  { fieldname: "party", label: "Party", fieldtype: "Dynamic Link", options: "party_type" },
  { fieldname: "cost_center", label: "Cost Center", fieldtype: "Link", options: "Cost Center" },
  { fieldname: "debit_in_account_currency", label: "Debit", fieldtype: "Currency" },
  { fieldname: "credit_in_account_currency", label: "Credit", fieldtype: "Currency" },
];

/** Extra Journal Entry Account fields shown only in the row-edit dialog — kept off the compact inline grid. */
export const JOURNAL_ENTRY_ACCOUNT_EXTRA_FIELDS: FormFieldMeta[] = [
  { fieldname: "bank_account", label: "Bank Account", fieldtype: "Link", options: "Bank Account" },
  { fieldname: "account_currency", label: "Account Currency", fieldtype: "Link", options: "Currency", read_only: true },
  { fieldname: "exchange_rate", label: "Exchange Rate", fieldtype: "Float" },
  { fieldname: "project", label: "Project", fieldtype: "Link", options: "Project" },
  {
    fieldname: "reference_type",
    label: "Reference Type",
    fieldtype: "Select",
    options:
      "\nSales Invoice\nPurchase Invoice\nJournal Entry\nSales Order\nPurchase Order\nExpense Claim\nAsset\nLoan\nPayroll Entry\nEmployee Advance",
  },
  { fieldname: "reference_name", label: "Reference Name", fieldtype: "Data" },
  { fieldname: "reference_due_date", label: "Reference Due Date", fieldtype: "Date" },
  { fieldname: "is_advance", label: "Is Advance", fieldtype: "Select", options: "No\nYes" },
  { fieldname: "user_remark", label: "Row Remark", fieldtype: "Text" },
];

// ------------------------------------------------------------ Payment Entry (ERPNext standard)

/**
 * Payment Entry fields — covers the core money-movement flow (Receive/Pay/
 * Internal Transfer, party + account resolution, amounts, reference/cheque
 * info). Tax-withholding, Payment Order and Auto Repeat fields are left out,
 * same "commercially useful subset" scope as the Purchase Invoice/Journal
 * Entry forms — the vendored ERPNext controller still computes and validates
 * the real base-currency/allocation totals server-side on save.
 */
export const PAYMENT_ENTRY_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_pe_basic", label: "Type of Payment", fieldtype: "Section Break" },
  {
    fieldname: "payment_type",
    label: "Payment Type",
    fieldtype: "Select",
    options: "Receive\nPay\nInternal Transfer",
    reqd: true,
    default: "Receive",
  },
  { fieldname: "posting_date", label: "Posting Date", fieldtype: "Date", reqd: true, default: "Today" },
  { fieldname: "title", label: "Title", fieldtype: "Data", hidden: true, description: "Optional label for this entry — defaults to the party name if left blank." },
  { fieldname: "column_break_pe_0", fieldtype: "Column Break" },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "mode_of_payment", label: "Mode of Payment", fieldtype: "Link", options: "Mode of Payment" },

  { fieldname: "section_break_pe_party", label: "Payment From / To", fieldtype: "Section Break" },
  { fieldname: "party_type", label: "Party Type", fieldtype: "Select", options: "Customer\nSupplier\nEmployee\nShareholder", reqd: true },
  { fieldname: "party", label: "Party", fieldtype: "Dynamic Link", options: "party_type", reqd: true },
  { fieldname: "party_name", label: "Party Name", fieldtype: "Data", read_only: true, hidden: true },
  { fieldname: "column_break_pe_1", fieldtype: "Column Break" },
  { fieldname: "contact_person", label: "Contact", fieldtype: "Link", options: "Contact" },
  { fieldname: "contact_email", label: "Contact Email", fieldtype: "Data" },

  {
    fieldname: "section_break_pe_accounts",
    label: "Accounts",
    fieldtype: "Section Break",
  },
  { fieldname: "paid_from", label: "Account Paid From", fieldtype: "Link", options: "Account", reqd: true },
  { fieldname: "paid_from_account_currency", label: "Account Currency (From)", fieldtype: "Link", options: "Currency", read_only: true },
  { fieldname: "column_break_pe_2", fieldtype: "Column Break" },
  { fieldname: "paid_to", label: "Account Paid To", fieldtype: "Link", options: "Account", reqd: true },
  { fieldname: "paid_to_account_currency", label: "Account Currency (To)", fieldtype: "Link", options: "Currency", read_only: true },
  // Bank Details folded in as a third row here (rather than its own Section
  // Break) — a lone Section Break with just one field per side of its own
  // Column Break renders as two separate single-field rows (see FrappeForm's
  // layout algorithm: each column-group gets its own grid, so a 1-field
  // group wastes its second cell instead of sharing a row with the next
  // group). Grouped under Accounts like this, the two bank fields land in
  // one shared 2-column row instead.
  { fieldname: "column_break_pe_bank", fieldtype: "Column Break" },
  { fieldname: "bank_account", label: "Company Bank Account", fieldtype: "Link", options: "Bank Account" },
  { fieldname: "party_bank_account", label: "Party Bank Account", fieldtype: "Link", options: "Bank Account" },

  { fieldname: "section_break_pe_amounts", label: "Amount", fieldtype: "Section Break" },
  { fieldname: "paid_amount", label: "Paid Amount", fieldtype: "Currency", reqd: true },
  { fieldname: "source_exchange_rate", label: "Source Exchange Rate", fieldtype: "Float", precision: 6, default: 1 },
  { fieldname: "column_break_pe_3", fieldtype: "Column Break" },
  { fieldname: "received_amount", label: "Received Amount", fieldtype: "Currency", reqd: true },
  { fieldname: "target_exchange_rate", label: "Target Exchange Rate", fieldtype: "Float", precision: 6, default: 1 },

  { fieldname: "section_break_pe_ref", label: "Transaction ID", fieldtype: "Section Break" },
  { fieldname: "reference_no", label: "Cheque/Reference No", fieldtype: "Data" },
  { fieldname: "reference_date", label: "Cheque/Reference Date", fieldtype: "Date" },
  { fieldname: "clearance_date", label: "Clearance Date", fieldtype: "Date", description: "When the cheque/transfer actually cleared the bank." },
  { fieldname: "column_break_pe_4", fieldtype: "Column Break" },
  { fieldname: "project", label: "Project", fieldtype: "Link", options: "Project" },
  { fieldname: "cost_center", label: "Cost Center", fieldtype: "Link", options: "Cost Center" },

  // Its own section (no Column Break) so the layout engine gives it the full
  // row instead of squeezing it into one half of a 2-column grid.
  { fieldname: "section_break_pe_remarks", label: "Remarks", fieldtype: "Section Break" },
  { fieldname: "remarks", label: "Remarks", fieldtype: "Text" },
];

/** "Taxes and Charges" table (Advance Taxes and Charges) — bank charges, withholding, etc. applied to the payment. */
export const PAYMENT_ENTRY_TAX_COLUMNS: FormFieldMeta[] = [
  { fieldname: "charge_type", label: "Type", fieldtype: "Select", options: "Actual\nOn Paid Amount\nOn Previous Row Amount\nOn Previous Row Total", reqd: true },
  { fieldname: "account_head", label: "Account Head", fieldtype: "Link", options: "Account", reqd: true },
  { fieldname: "description", label: "Description", fieldtype: "Data", reqd: true },
  { fieldname: "rate", label: "Rate (%)", fieldtype: "Float", description: "Ignored for Type \"Actual\" — set Tax Amount directly instead." },
  { fieldname: "add_deduct_tax", label: "Add/Deduct", fieldtype: "Select", options: "Add\nDeduct", reqd: true, default: "Add" },
  { fieldname: "tax_amount", label: "Tax Amount", fieldtype: "Currency", read_only: true, description: "Editable only for Type \"Actual\" — every other type computes this from Rate on save." },
  { fieldname: "total", label: "Total", fieldtype: "Currency", read_only: true },
];

/** "References" table — outstanding invoices/orders this payment is allocated against. */
export const PAYMENT_ENTRY_REFERENCE_COLUMNS: FormFieldMeta[] = [
  {
    fieldname: "reference_doctype",
    label: "Type",
    fieldtype: "Select",
    options: "Sales Invoice\nPurchase Invoice\nSales Order\nPurchase Order\nJournal Entry",
    reqd: true,
  },
  { fieldname: "reference_name", label: "Reference", fieldtype: "Dynamic Link", options: "reference_doctype", reqd: true },
  { fieldname: "due_date", label: "Due Date", fieldtype: "Date", read_only: true },
  { fieldname: "total_amount", label: "Grand Total", fieldtype: "Currency", read_only: true },
  { fieldname: "outstanding_amount", label: "Outstanding", fieldtype: "Currency", read_only: true },
  { fieldname: "allocated_amount", label: "Allocated", fieldtype: "Currency" },
];

/** "Deductions or Loss" table — TDS, bank charges, write-offs, exchange loss, etc. */
export const PAYMENT_ENTRY_DEDUCTION_COLUMNS: FormFieldMeta[] = [
  { fieldname: "account", label: "Account", fieldtype: "Link", options: "Account", reqd: true },
  { fieldname: "cost_center", label: "Cost Center", fieldtype: "Link", options: "Cost Center" },
  { fieldname: "amount", label: "Amount", fieldtype: "Currency", reqd: true },
  { fieldname: "description", label: "Description", fieldtype: "Data" },
];

// ------------------------------------------------------------ Sales Order (ERPNext standard + micromax export fields)

/**
 * Sales Order fields — core commercial fields plus the micromax app's export
 * custom fields (buyer PO, LC Proforma linkage, shipment/incoterm/destination)
 * already declared on the `SalesOrder` TS type and used read-only today by
 * the Export Orders list. Field types/options match the real custom field
 * definitions in `apps/micromax/micromax/install.py` exactly (e.g. `incoterm`
 * and `shipment_mode` are micromax-defined Selects here, not the core Link).
 */
export const SALES_ORDER_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_so_basic", label: "Basic Information", fieldtype: "Section Break" },
  {
    fieldname: "naming_series",
    label: "Series",
    fieldtype: "Select",
    options: "SAL-ORD-.YYYY.-",
    reqd: true,
    default: "SAL-ORD-.YYYY.-",
  },
  { fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer", reqd: true },
  { fieldname: "customer_name", label: "Customer Name", fieldtype: "Data", read_only: true },
  { fieldname: "transaction_date", label: "Date", fieldtype: "Date", reqd: true, default: "Today" },
  { fieldname: "delivery_date", label: "Delivery Date", fieldtype: "Date", reqd: true },
  { fieldname: "column_break_so_0", fieldtype: "Column Break" },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "currency", label: "Currency", fieldtype: "Link", options: "Currency", default: "USD", reqd: true },
  { fieldname: "conversion_rate", label: "Exchange Rate", fieldtype: "Float", precision: 6, default: 1, reqd: true },
  { fieldname: "po_no", label: "Customer's PO No", fieldtype: "Data" },

  { fieldname: "section_break_so_buyer", label: "Buyer Reference", fieldtype: "Section Break" },
  { fieldname: "buyer_po_no", label: "Buyer PO No.", fieldtype: "Data" },
  { fieldname: "export_status", label: "Export Status", fieldtype: "Select", options: "\nPlanned\nIn Production\nReady to Ship\nShipped\nClosed" },
  { fieldname: "column_break_so_1", fieldtype: "Column Break" },
  { fieldname: "set_warehouse", label: "Set Source Warehouse", fieldtype: "Link", options: "Warehouse" },

  { fieldname: "section_break_so_lc", label: "LC Details", fieldtype: "Section Break" },
  { fieldname: "lc_proforma", label: "LC Proforma", fieldtype: "Link", options: "LC Proforma" },
  { fieldname: "lc_no", label: "LC No.", fieldtype: "Data" },
  { fieldname: "lc_date", label: "LC Date", fieldtype: "Date" },
  { fieldname: "lc_amount", label: "LC Amount", fieldtype: "Currency" },
  { fieldname: "column_break_so_2", fieldtype: "Column Break" },
  { fieldname: "lc_currency", label: "LC Currency", fieldtype: "Link", options: "Currency" },
  { fieldname: "lc_issuing_bank", label: "LC Issuing Bank", fieldtype: "Data" },
  { fieldname: "lc_advising_bank", label: "LC Advising Bank", fieldtype: "Data" },
  { fieldname: "lc_expiry_date", label: "LC Expiry Date", fieldtype: "Date" },

  { fieldname: "section_break_so_shipment", label: "Shipment", fieldtype: "Section Break" },
  { fieldname: "latest_shipment_date", label: "Latest Shipment Date", fieldtype: "Date" },
  { fieldname: "port_of_loading", label: "Port of Loading", fieldtype: "Data" },
  { fieldname: "port_of_discharge", label: "Port of Discharge", fieldtype: "Data" },
  { fieldname: "final_destination", label: "Final Destination", fieldtype: "Data" },
  { fieldname: "column_break_so_3", fieldtype: "Column Break" },
  { fieldname: "incoterm", label: "Incoterm", fieldtype: "Select", options: "EXW\nFCA\nFAS\nFOB\nCFR\nCIF\nCPT\nCIP\nDAP\nDPU\nDDP" },
  { fieldname: "shipment_mode", label: "Shipment Mode", fieldtype: "Select", options: "\nSea\nAir\nRoad\nRail\nMultimodal" },
  { fieldname: "country_of_destination", label: "Country of Destination", fieldtype: "Link", options: "Country" },
];

export const SALES_ORDER_ITEM_COLUMNS: FormFieldMeta[] = [
  { fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item", reqd: true },
  { fieldname: "item_name", label: "Item Name", fieldtype: "Data", read_only: true },
  { fieldname: "delivery_date", label: "Delivery Date", fieldtype: "Date" },
  { fieldname: "qty", label: "Qty", fieldtype: "Float", reqd: true },
  { fieldname: "uom", label: "UOM", fieldtype: "Link", options: "UOM" },
  { fieldname: "rate", label: "Rate", fieldtype: "Currency", precision: 4 },
  { fieldname: "amount", label: "Amount", fieldtype: "Currency", read_only: true },
  { fieldname: "warehouse", label: "Warehouse", fieldtype: "Link", options: "Warehouse" },
  { fieldname: "description", label: "Description", fieldtype: "Data" },
];

// ------------------------------------------------------------ Delivery Note (ERPNext standard)

/** Delivery Note — the real stock-out event; decrements inventory and drives COGS on submit. */
export const DELIVERY_NOTE_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_dn_basic", label: "Basic Information", fieldtype: "Section Break" },
  {
    fieldname: "naming_series",
    label: "Series",
    fieldtype: "Select",
    options: "MAT-DN-.YYYY.-",
    reqd: true,
    default: "MAT-DN-.YYYY.-",
  },
  { fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer", reqd: true },
  { fieldname: "customer_name", label: "Customer Name", fieldtype: "Data", read_only: true },
  { fieldname: "posting_date", label: "Date", fieldtype: "Date", reqd: true, default: "Today" },
  { fieldname: "column_break_dn_0", fieldtype: "Column Break" },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "currency", label: "Currency", fieldtype: "Link", options: "Currency", default: "USD", reqd: true },
  { fieldname: "conversion_rate", label: "Exchange Rate", fieldtype: "Float", precision: 6, default: 1, reqd: true },
  { fieldname: "set_warehouse", label: "Source Warehouse", fieldtype: "Link", options: "Warehouse" },
  {
    fieldname: "cost_center",
    label: "Cost Center",
    fieldtype: "Link",
    options: "Cost Center",
    description: "Applied to every line item. Required whenever the company has no default cost center configured.",
  },

  { fieldname: "section_break_dn_terms", label: "Terms", fieldtype: "Section Break" },
  { fieldname: "tc_name", label: "Terms Template", fieldtype: "Link", options: "Terms and Conditions" },
  { fieldname: "column_break_dn_1", fieldtype: "Column Break" },
  { fieldname: "instructions", label: "Instructions", fieldtype: "Text" },
];

export const DELIVERY_NOTE_ITEM_COLUMNS: FormFieldMeta[] = [
  { fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item", reqd: true },
  { fieldname: "item_name", label: "Item Name", fieldtype: "Data", read_only: true },
  { fieldname: "against_sales_order", label: "Sales Order", fieldtype: "Link", options: "Sales Order", read_only: true },
  { fieldname: "qty", label: "Qty", fieldtype: "Float", reqd: true },
  { fieldname: "uom", label: "UOM", fieldtype: "Link", options: "UOM" },
  { fieldname: "rate", label: "Rate", fieldtype: "Currency", precision: 4 },
  { fieldname: "amount", label: "Amount", fieldtype: "Currency", read_only: true },
  { fieldname: "warehouse", label: "Warehouse", fieldtype: "Link", options: "Warehouse", reqd: true },
  { fieldname: "description", label: "Description", fieldtype: "Data" },
];

// ------------------------------------------------------------ Sales Invoice (ERPNext standard)

export const SALES_INVOICE_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_si_basic", label: "Basic Information", fieldtype: "Section Break" },
  {
    fieldname: "naming_series",
    label: "Series",
    fieldtype: "Select",
    options: "ACC-SINV-.YYYY.-",
    reqd: true,
    default: "ACC-SINV-.YYYY.-",
  },
  { fieldname: "customer", label: "Customer", fieldtype: "Link", options: "Customer", reqd: true },
  { fieldname: "customer_name", label: "Customer Name", fieldtype: "Data", read_only: true },
  { fieldname: "posting_date", label: "Posting Date", fieldtype: "Date", reqd: true, default: "Today" },
  { fieldname: "due_date", label: "Due Date", fieldtype: "Date" },
  { fieldname: "column_break_si_0", fieldtype: "Column Break" },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "currency", label: "Currency", fieldtype: "Link", options: "Currency", default: "USD" },
  { fieldname: "conversion_rate", label: "Exchange Rate", fieldtype: "Float", precision: 6, default: 1 },
  { fieldname: "selling_price_list", label: "Price List", fieldtype: "Link", options: "Price List" },
  { fieldname: "update_stock", label: "Update Stock", fieldtype: "Check", default: 0, description: "Deliver stock directly through this invoice (no separate Delivery Note)." },
  {
    fieldname: "cost_center",
    label: "Cost Center",
    fieldtype: "Link",
    options: "Cost Center",
    description: "Applied to every line item. Required whenever the company has no default cost center configured.",
  },

  { fieldname: "section_break_si_terms", label: "Terms", fieldtype: "Section Break" },
  { fieldname: "payment_terms_template", label: "Payment Terms", fieldtype: "Link", options: "Payment Terms Template" },
  { fieldname: "tc_name", label: "Terms Template", fieldtype: "Link", options: "Terms and Conditions" },
  { fieldname: "column_break_si_1", fieldtype: "Column Break" },
  { fieldname: "terms", label: "Terms and Conditions", fieldtype: "Text Editor" },
];

export const SALES_INVOICE_ITEM_COLUMNS: FormFieldMeta[] = [
  { fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item", reqd: true },
  { fieldname: "item_name", label: "Item Name", fieldtype: "Data", read_only: true },
  { fieldname: "sales_order", label: "Sales Order", fieldtype: "Link", options: "Sales Order" },
  { fieldname: "delivery_note", label: "Delivery Note", fieldtype: "Link", options: "Delivery Note", read_only: true },
  { fieldname: "qty", label: "Qty", fieldtype: "Float", reqd: true },
  { fieldname: "uom", label: "UOM", fieldtype: "Link", options: "UOM" },
  { fieldname: "rate", label: "Rate", fieldtype: "Currency", precision: 4 },
  { fieldname: "amount", label: "Amount", fieldtype: "Currency", read_only: true },
  { fieldname: "warehouse", label: "Warehouse", fieldtype: "Link", options: "Warehouse" },
];

// ------------------------------------------------------------ Stock Entry (ERPNext standard)

/**
 * Stock Entry — scoped to core movement purposes only (Material Receipt /
 * Issue / Transfer); Manufacture/Repack are BOM-driven and belong to the
 * separate Production module, out of scope here.
 */
export const STOCK_ENTRY_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_se_basic", label: "Basic Information", fieldtype: "Section Break" },
  {
    fieldname: "naming_series",
    label: "Series",
    fieldtype: "Select",
    options: "MAT-STE-.YYYY.-",
    reqd: true,
    default: "MAT-STE-.YYYY.-",
  },
  {
    fieldname: "purpose",
    label: "Purpose",
    fieldtype: "Select",
    options: "Material Receipt\nMaterial Issue\nMaterial Transfer",
    reqd: true,
    default: "Material Transfer",
  },
  { fieldname: "posting_date", label: "Posting Date", fieldtype: "Date", reqd: true, default: "Today" },
  { fieldname: "column_break_se_0", fieldtype: "Column Break" },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },

  { fieldname: "section_break_se_warehouse", label: "Warehouses", fieldtype: "Section Break" },
  { fieldname: "from_warehouse", label: "Source Warehouse", fieldtype: "Link", options: "Warehouse" },
  { fieldname: "column_break_se_1", fieldtype: "Column Break" },
  { fieldname: "to_warehouse", label: "Target Warehouse", fieldtype: "Link", options: "Warehouse" },

  { fieldname: "section_break_se_more", label: "More Information", fieldtype: "Section Break" },
  {
    fieldname: "cost_center",
    label: "Cost Center",
    fieldtype: "Link",
    options: "Cost Center",
    description: "Applied to every line item. Required whenever the company has no default cost center configured.",
  },
  { fieldname: "column_break_se_2", fieldtype: "Column Break" },
  { fieldname: "remarks", label: "Remarks", fieldtype: "Text" },
];

export const STOCK_ENTRY_ITEM_COLUMNS: FormFieldMeta[] = [
  { fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item", reqd: true },
  { fieldname: "item_name", label: "Item Name", fieldtype: "Data", read_only: true },
  { fieldname: "s_warehouse", label: "Source Warehouse", fieldtype: "Link", options: "Warehouse" },
  { fieldname: "t_warehouse", label: "Target Warehouse", fieldtype: "Link", options: "Warehouse" },
  { fieldname: "qty", label: "Qty", fieldtype: "Float", reqd: true },
  { fieldname: "uom", label: "UOM", fieldtype: "Link", options: "UOM" },
  { fieldname: "basic_rate", label: "Basic Rate", fieldtype: "Currency", precision: 4 },
  { fieldname: "basic_amount", label: "Basic Amount", fieldtype: "Currency", read_only: true },
];

// ------------------------------------------------------------ Material Request (ERPNext standard)

/**
 * Material Request — scoped to Purchase / Material Transfer / Material Issue
 * (matches Stock Entry's purpose scoping); Manufacture/Subcontracting/
 * Customer Provided are out of scope here.
 */
export const MATERIAL_REQUEST_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_mr_basic", label: "Basic Information", fieldtype: "Section Break" },
  {
    fieldname: "naming_series",
    label: "Series",
    fieldtype: "Select",
    options: "MAT-MR-.YYYY.-",
    reqd: true,
    default: "MAT-MR-.YYYY.-",
  },
  { fieldname: "title", label: "Title", fieldtype: "Data" },
  {
    fieldname: "material_request_type",
    label: "Type",
    fieldtype: "Select",
    options: "Purchase\nMaterial Transfer\nMaterial Issue",
    reqd: true,
    default: "Purchase",
  },
  { fieldname: "transaction_date", label: "Date", fieldtype: "Date", reqd: true, default: "Today" },
  { fieldname: "column_break_mr_0", fieldtype: "Column Break" },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "schedule_date", label: "Required By", fieldtype: "Date" },

  { fieldname: "section_break_mr_warehouse", label: "Warehouses", fieldtype: "Section Break" },
  {
    fieldname: "set_warehouse",
    label: "Target Warehouse",
    fieldtype: "Link",
    options: "Warehouse",
    description: "Applied to every line item — where stock should arrive (Purchase) or move to (Material Transfer).",
  },
  { fieldname: "column_break_mr_1", fieldtype: "Column Break" },
  {
    fieldname: "set_from_warehouse",
    label: "Source Warehouse",
    fieldtype: "Link",
    options: "Warehouse",
    description: "Applied to every line item — where stock should be taken from (Material Issue / Material Transfer).",
  },
];

export const MATERIAL_REQUEST_ITEM_COLUMNS: FormFieldMeta[] = [
  { fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item", reqd: true },
  { fieldname: "item_name", label: "Item Name", fieldtype: "Data", read_only: true },
  { fieldname: "qty", label: "Qty", fieldtype: "Float", reqd: true },
  { fieldname: "uom", label: "UOM", fieldtype: "Link", options: "UOM" },
  { fieldname: "schedule_date", label: "Required By", fieldtype: "Date" },
  { fieldname: "warehouse", label: "Warehouse", fieldtype: "Link", options: "Warehouse" },
  { fieldname: "from_warehouse", label: "From Warehouse", fieldtype: "Link", options: "Warehouse" },
];

// -------------------------------------------------------- Request for Quotation (ERPNext standard)

export const RFQ_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_rfq_basic", label: "Basic Information", fieldtype: "Section Break" },
  {
    fieldname: "naming_series",
    label: "Series",
    fieldtype: "Select",
    options: "PUR-RFQ-.YYYY.-",
    reqd: true,
    default: "PUR-RFQ-.YYYY.-",
  },
  { fieldname: "title", label: "Title", fieldtype: "Data" },
  { fieldname: "subject", label: "Subject", fieldtype: "Data", reqd: true },
  { fieldname: "transaction_date", label: "Date", fieldtype: "Date", reqd: true, default: "Today" },
  { fieldname: "column_break_rfq_0", fieldtype: "Column Break" },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "schedule_date", label: "Required By", fieldtype: "Date" },

  { fieldname: "section_break_rfq_message", label: "Message for Supplier", fieldtype: "Section Break" },
  { fieldname: "message_for_supplier", label: "Message", fieldtype: "Text Editor" },
];

export const RFQ_ITEM_COLUMNS: FormFieldMeta[] = [
  { fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item", reqd: true },
  { fieldname: "item_name", label: "Item Name", fieldtype: "Data", read_only: true },
  { fieldname: "qty", label: "Qty", fieldtype: "Float", reqd: true },
  { fieldname: "uom", label: "UOM", fieldtype: "Link", options: "UOM" },
  { fieldname: "schedule_date", label: "Required By", fieldtype: "Date" },
  { fieldname: "warehouse", label: "Warehouse", fieldtype: "Link", options: "Warehouse" },
];

/**
 * RFQ Supplier rows never default `send_email` on — submitting the RFQ only
 * emails suppliers whose row has it checked (see
 * request_for_quotation.py::send_to_supplier), so leaving it off keeps
 * submission safe even with no Contact/email on file.
 */
export const RFQ_SUPPLIER_COLUMNS: FormFieldMeta[] = [
  { fieldname: "supplier", label: "Supplier", fieldtype: "Link", options: "Supplier", reqd: true },
  { fieldname: "supplier_name", label: "Supplier Name", fieldtype: "Data", read_only: true },
  { fieldname: "contact", label: "Contact", fieldtype: "Link", options: "Contact" },
  { fieldname: "email_id", label: "Email", fieldtype: "Data" },
  { fieldname: "send_email", label: "Send Email", fieldtype: "Check", default: 0 },
  { fieldname: "quote_status", label: "Quote Status", fieldtype: "Select", options: "Pending\nReceived", read_only: true },
];

/**
 * CRM Lead fields — mirrors the field set on the installed Frappe CRM app's
 * `CRM Lead` doctype (see apps/crm/crm/fcrm/doctype/crm_lead/crm_lead.json in
 * the backend container). Only the fields useful for a compact create/edit
 * form are included; SLA/sync-only fields are left off.
 */
export const CRM_LEAD_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_person", label: "Contact", fieldtype: "Section Break" },
  { fieldname: "salutation", label: "Salutation", fieldtype: "Link", options: "Salutation" },
  { fieldname: "first_name", label: "First Name", fieldtype: "Data", reqd: true },
  { fieldname: "last_name", label: "Last Name", fieldtype: "Data" },
  { fieldname: "column_break_person", fieldtype: "Column Break" },
  { fieldname: "email", label: "Email", fieldtype: "Data" },
  { fieldname: "mobile_no", label: "Mobile No.", fieldtype: "Data" },
  { fieldname: "phone", label: "Phone", fieldtype: "Data" },
  { fieldname: "gender", label: "Gender", fieldtype: "Link", options: "Gender" },

  // micromax custom fields — a second person at the same organization (install.py).
  { fieldname: "second_contact_section", label: "Second Contact Person", fieldtype: "Section Break" },
  { fieldname: "second_contact_name", label: "Person Name", fieldtype: "Data" },
  { fieldname: "second_contact_gender", label: "Gender", fieldtype: "Link", options: "Gender" },
  { fieldname: "second_contact_designation", label: "Designation", fieldtype: "Data" },
  { fieldname: "second_contact_column_break", fieldtype: "Column Break" },
  { fieldname: "second_contact_email", label: "Email", fieldtype: "Data" },
  { fieldname: "second_contact_mobile", label: "Cell No", fieldtype: "Data" },

  { fieldname: "section_break_org", label: "Organization", fieldtype: "Section Break" },
  { fieldname: "organization", label: "Organization", fieldtype: "Link", options: "CRM Organization" },
  { fieldname: "job_title", label: "Job Title", fieldtype: "Data" },
  { fieldname: "website", label: "Website", fieldtype: "Data" },
  { fieldname: "column_break_org", fieldtype: "Column Break" },
  { fieldname: "no_of_employees", label: "No. of Employees", fieldtype: "Select", options: "1-10\n11-50\n51-200\n201-500\n501-1000\n1000+" },
  // Repurposed for the donor-prospecting spreadsheet's "Expected Amount"
  // (expected donation) rather than the company's own revenue — reusing the
  // stock field instead of adding a new one, per instruction.
  { fieldname: "annual_revenue", label: "Expected Amount", fieldtype: "Currency" },
  // Repurposed for the spreadsheet's "Segment" (e.g. "Food / Personal Care").
  { fieldname: "industry", label: "Segment", fieldtype: "Link", options: "CRM Industry" },

  { fieldname: "section_break_qualify", label: "Qualification", fieldtype: "Section Break" },
  { fieldname: "status", label: "Status", fieldtype: "Link", options: "CRM Lead Status" },
  { fieldname: "source", label: "Source", fieldtype: "Link", options: "CRM Lead Source" },
  { fieldname: "column_break_qualify", fieldtype: "Column Break" },
  { fieldname: "lead_owner", label: "Lead Owner", fieldtype: "Link", options: "User" },
  // Repurposed for the spreadsheet's "City" — reusing the stock Territory
  // Link instead of adding a new free-text field, per instruction.
  { fieldname: "territory", label: "City", fieldtype: "Link", options: "CRM Territory" },

  {
    fieldname: "section_break_fundraising",
    label: "Fundraising Details",
    fieldtype: "Section Break",
  },
  { fieldname: "priority", label: "Priority", fieldtype: "Select", options: "\nA+\nA\nB\nC" },
  { fieldname: "csr_department", label: "CSR/ESG Department", fieldtype: "Data" },
  { fieldname: "address", label: "Address", fieldtype: "Text" },
  { fieldname: "column_break_fundraising", fieldtype: "Column Break" },
  { fieldname: "focus_area", label: "Focus Area", fieldtype: "Data" },
  { fieldname: "education_focus", label: "Education Focus", fieldtype: "Data" },
  { fieldname: "first_contact_date", label: "First Contact", fieldtype: "Date" },
  { fieldname: "proposed_ask", label: "Proposed Ask", fieldtype: "Text" },
  { fieldname: "remarks", label: "Remarks", fieldtype: "Text" },

  { fieldname: "section_break_lost", label: "Lost Details", fieldtype: "Section Break" },
  { fieldname: "lost_reason", label: "Lost Reason", fieldtype: "Link", options: "CRM Lost Reason" },
  { fieldname: "lost_notes", label: "Lost Notes", fieldtype: "Text" },
];

/**
 * CRM Deal fields — mirrors `CRM Deal` (apps/crm/crm/fcrm/doctype/crm_deal/crm_deal.json).
 */
export const CRM_DEAL_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_org", label: "Organization", fieldtype: "Section Break" },
  { fieldname: "organization", label: "Organization", fieldtype: "Link", options: "CRM Organization", reqd: true },
  { fieldname: "website", label: "Website", fieldtype: "Data" },
  { fieldname: "industry", label: "Industry", fieldtype: "Link", options: "CRM Industry" },
  { fieldname: "column_break_org", fieldtype: "Column Break" },
  { fieldname: "annual_revenue", label: "Annual Revenue", fieldtype: "Currency" },
  { fieldname: "no_of_employees", label: "No. of Employees", fieldtype: "Select", options: "1-10\n11-50\n51-200\n201-500\n501-1000\n1000+" },
  { fieldname: "lead", label: "From Lead", fieldtype: "Link", options: "CRM Lead", read_only: true },

  { fieldname: "section_break_person", label: "Primary Contact", fieldtype: "Section Break" },
  { fieldname: "salutation", label: "Salutation", fieldtype: "Link", options: "Salutation" },
  { fieldname: "first_name", label: "First Name", fieldtype: "Data" },
  { fieldname: "last_name", label: "Last Name", fieldtype: "Data" },
  { fieldname: "column_break_person", fieldtype: "Column Break" },
  { fieldname: "email", label: "Primary Email", fieldtype: "Data" },
  { fieldname: "mobile_no", label: "Primary Mobile No.", fieldtype: "Data" },
  { fieldname: "phone", label: "Primary Phone", fieldtype: "Data" },

  { fieldname: "section_break_deal", label: "Deal", fieldtype: "Section Break" },
  { fieldname: "status", label: "Status", fieldtype: "Link", options: "CRM Deal Status" },
  { fieldname: "deal_owner", label: "Deal Owner", fieldtype: "Link", options: "User" },
  { fieldname: "probability", label: "Probability (%)", fieldtype: "Float" },
  { fieldname: "column_break_deal", fieldtype: "Column Break" },
  { fieldname: "currency", label: "Currency", fieldtype: "Link", options: "Currency", default: "USD" },
  { fieldname: "deal_value", label: "Deal Value", fieldtype: "Currency" },
  { fieldname: "expected_deal_value", label: "Expected Deal Value", fieldtype: "Currency" },
  { fieldname: "expected_closure_date", label: "Expected Closure Date", fieldtype: "Date" },

  { fieldname: "section_break_qualify", label: "Qualification", fieldtype: "Section Break" },
  { fieldname: "source", label: "Source", fieldtype: "Link", options: "CRM Lead Source" },
  { fieldname: "territory", label: "Territory", fieldtype: "Link", options: "CRM Territory" },
  { fieldname: "column_break_qualify", fieldtype: "Column Break" },
  { fieldname: "next_step", label: "Next Step", fieldtype: "Data" },
  { fieldname: "closed_date", label: "Closed Date", fieldtype: "Date", read_only: true },

  { fieldname: "section_break_lost", label: "Lost Details", fieldtype: "Section Break" },
  { fieldname: "lost_reason", label: "Lost Reason", fieldtype: "Link", options: "CRM Lost Reason" },
  { fieldname: "lost_notes", label: "Lost Notes", fieldtype: "Text" },
];

/**
 * CRM Task fields (follow-ups/reminders — `CRM Task`), used both standalone
 * (Follow-ups page) and embedded in a Lead/Deal detail page's quick-add form.
 */
export const CRM_TASK_FIELDS: FormFieldMeta[] = [
  { fieldname: "title", label: "Title", fieldtype: "Data", reqd: true },
  { fieldname: "status", label: "Status", fieldtype: "Select", options: "Backlog\nTodo\nIn Progress\nDone\nCancelled", default: "Todo" },
  { fieldname: "column_break_task", fieldtype: "Column Break" },
  { fieldname: "priority", label: "Priority", fieldtype: "Select", options: "Low\nMedium\nHigh", default: "Medium" },
  { fieldname: "due_date", label: "Due Date & Reminder Time", fieldtype: "Datetime", reqd: true },
  {
    fieldname: "assigned_to",
    label: "Assigned To",
    fieldtype: "Link",
    options: "User",
    description: "The automatic overdue/due-soon reminder only fires for an assigned follow-up.",
  },
  { fieldname: "section_break_task_desc", label: "Description", fieldtype: "Section Break" },
  { fieldname: "description", label: "Description", fieldtype: "Text Editor" },
];

/** FCRM Note fields, used for the Lead/Deal detail page's quick-add Note form. */
export const CRM_NOTE_FIELDS: FormFieldMeta[] = [
  { fieldname: "title", label: "Title", fieldtype: "Data", reqd: true },
  { fieldname: "content", label: "Content", fieldtype: "Text Editor", reqd: true },
];

/**
 * `CRM Prospect Scrape` review-queue row — edited by hand before
 * "Convert to Lead" (see `mm_core.crm_scraper`). Scraper-filled fields stay
 * editable here since the heuristics are best-effort, not authoritative.
 */
export const CRM_PROSPECT_SCRAPE_FIELDS: FormFieldMeta[] = [
  { fieldname: "section_break_identity", label: "Identity", fieldtype: "Section Break" },
  { fieldname: "donor_name", label: "Donor Name", fieldtype: "Data" },
  { fieldname: "donor_type", label: "Donor Type", fieldtype: "Select", options: "\nCorporate\nFoundation\nNGO\nGovernment\nTrust\nIndividual\nInternational Agency\nOther" },
  { fieldname: "segment", label: "Segment", fieldtype: "Data" },
  { fieldname: "column_break_identity", fieldtype: "Column Break" },
  { fieldname: "website", label: "Website", fieldtype: "Data" },
  { fieldname: "donor_profile_url", label: "Donor Profile URL", fieldtype: "Data" },

  { fieldname: "section_break_location", label: "Location", fieldtype: "Section Break" },
  { fieldname: "country", label: "Country", fieldtype: "Data" },
  { fieldname: "city", label: "City", fieldtype: "Data" },
  { fieldname: "column_break_location", fieldtype: "Column Break" },
  { fieldname: "address", label: "Address", fieldtype: "Text" },

  { fieldname: "section_break_fundraising", label: "Fundraising", fieldtype: "Section Break" },
  { fieldname: "csr_department", label: "CSR/ESG Department", fieldtype: "Data" },
  { fieldname: "focus_area", label: "Focus Area", fieldtype: "Data" },
  { fieldname: "column_break_fundraising", fieldtype: "Column Break" },
  { fieldname: "proposed_ask", label: "Proposed Ask", fieldtype: "Text" },

  { fieldname: "section_break_contact", label: "Contact", fieldtype: "Section Break" },
  { fieldname: "focal_person", label: "Focal Person", fieldtype: "Data" },
  { fieldname: "designation", label: "Designation", fieldtype: "Data" },
  { fieldname: "column_break_contact", fieldtype: "Column Break" },
  { fieldname: "email", label: "Email", fieldtype: "Data" },
  { fieldname: "phone", label: "Phone", fieldtype: "Data" },
  { fieldname: "contact_source", label: "Contact Source", fieldtype: "Data" },
  { fieldname: "social_media", label: "Social Media", fieldtype: "Text" },

  { fieldname: "section_break_review", label: "Review", fieldtype: "Section Break" },
  { fieldname: "status", label: "Status", fieldtype: "Select", options: "Pending Review\nApproved\nRejected\nConverted" },
  { fieldname: "raw_extract", label: "Raw Extract", fieldtype: "Text", read_only: true },
  { fieldname: "scrape_error", label: "Scrape Error", fieldtype: "Data", read_only: true },
];

/**
 * Create/edit forms for the CRM master records. Each is the single definition used BOTH by that
 * record's own management page and by the "+" quick-create dialog on a Link field pointing at it
 * (components/forms/link-quick-create.tsx), so the two can't drift apart.
 */

// CRM Organization.no_of_employees is a Select, so the server rejects anything outside its option list.
// The last bucket ("Above 500") is added to that list by micromax.install.make_crm_organization_employee_options
// (runs on install/migrate); the crm app's own "501-1000" / "1000+" stay valid for existing records.
export const ORGANIZATION_EMPLOYEE_RANGES = ["1-10", "11-50", "51-200", "201-500", "Above 500"];

export const CRM_ORGANIZATION_FORM_FIELDS: FormFieldMeta[] = [
  { fieldname: "organization_name", label: "Organization Name", fieldtype: "Data", reqd: true },
  { fieldname: "website", label: "Website", fieldtype: "Data" },
  // CRM Organization links to the crm app's own CRM Industry / CRM Territory doctypes — NOT the core
  // "Industry" / ERPNext "Territory" ones, which have different (or no) records, so the picker showed
  // none of the values managed on the Industries / Territories pages (e.g. "Automotive").
  { fieldname: "industry", label: "Industry", fieldtype: "Link", options: "CRM Industry" },
  { fieldname: "no_of_employees", label: "No. of Employees", fieldtype: "Select", options: ORGANIZATION_EMPLOYEE_RANGES.join("\n") },
  { fieldname: "annual_revenue", label: "Annual Revenue", fieldtype: "Currency" },
  { fieldname: "territory", label: "Territory", fieldtype: "Link", options: "CRM Territory" },
  { fieldname: "address", label: "Address", fieldtype: "Text" },
];

export const CRM_TERRITORY_FORM_FIELDS: FormFieldMeta[] = [
  { fieldname: "territory_name", label: "Territory Name", fieldtype: "Data", reqd: true },
  { fieldname: "territory_manager", label: "Territory Manager", fieldtype: "Link", options: "User" },
  { fieldname: "is_group", label: "Is Group", fieldtype: "Check" },
];

export const CRM_INDUSTRY_FORM_FIELDS: FormFieldMeta[] = [
  { fieldname: "industry", label: "Industry", fieldtype: "Data", reqd: true },
];

export const CRM_LEAD_SOURCE_FORM_FIELDS: FormFieldMeta[] = [
  { fieldname: "source_name", label: "Source Name", fieldtype: "Data", reqd: true },
  { fieldname: "details", label: "Details", fieldtype: "Text Editor" },
];

export const CRM_LOST_REASON_FORM_FIELDS: FormFieldMeta[] = [
  { fieldname: "lost_reason", label: "Lost Reason", fieldtype: "Data", reqd: true },
  { fieldname: "description", label: "Description", fieldtype: "Text Editor" },
];
