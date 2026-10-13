/**
 * Frappe / ERPNext TypeScript domain types.
 *
 * These map 1:1 to ERPNext standard DocTypes and the custom Micromax
 * Import/Export DocTypes defined in the `micromax` Frappe app.
 */

export interface FrappeMeta {
  name: string;
  owner: string;
  creation: string;
  modified: string;
  modified_by: string;
  idx: number;
  docstatus: 0 | 1 | 2;
  parent?: string | null;
  parentfield?: string | null;
  parenttype?: string | null;
}

/** A row type (child table) carries parent fields plus its row fields. */
export type ChildRow<T> = T & {
  name: string;
  idx: number;
  parent: string;
  parentfield: string;
  parenttype: string;
  owner: string;
  creation: string;
  modified: string;
  modified_by: string;
  docstatus: 0 | 1 | 2;
};

// ---------------------------------------------------------------- LC Proforma

export interface LCProformaItem {
  item: string;
  item_name?: string;
  description?: string;
  buyer_style_no?: string;
  style_no?: string;
  color?: string;
  size?: string;
  hs_code?: string;
  country_of_origin?: string;
  quantity: number;
  uom?: string;
  rate: number;
  amount?: number;
  net_weight?: number;
  gross_weight?: number;
  cartons?: number;
    idx?: number;
}

// ------------------------------------------------------------- Export Shipment

export type ShipmentStatus =
  | "Planned"
  | "Booking"
  | "Stuffing"
  | "Shipped"
  | "In Transit"
  | "Arrived"
  | "Delivered"
  | "Closed";

export interface ExportShipment {
  shipment_no?: string;
  shipment_date?: string;
  customer: string;
  sales_order?: string;
  lc_proforma?: string;
  lc_no?: string;
  commercial_invoice_no?: string;
  packing_list_no?: string;
  bill_of_lading_no?: string;
  container_no?: string;
  shipping_line?: string;
  vessel?: string;
  port_of_loading?: string;
  port_of_discharge?: string;
  final_destination?: string;
  etd?: string;
  eta?: string;
  actual_shipment_date?: string;
  shipment_status?: ShipmentStatus;
  workflow_state?: string;
  name?: string;
}

// ------------------------------------------------------------- Import Shipment

export interface ImportShipment {
  shipment_no?: string;
  shipment_date?: string;
  supplier: string;
  purchase_order?: string;
  purchase_receipt?: string;
  import_cost_sheet?: string;
  bill_of_lading?: string;
  container_no?: string;
  shipping_line?: string;
  vessel?: string;
  port_of_loading?: string;
  port_of_discharge?: string;
  etd?: string;
  eta?: string;
  actual_arrival?: string;
  clearing_agent?: string;
  customs_declaration_no?: string;
  duty_amount?: number;
  tax_amount?: number;
  clearance_date?: string;
  shipment_status?: ShipmentStatus;
  workflow_state?: string;
  docstatus?: number;
  name?: string;
}

// ------------------------------------------------------- Import Cost Sheet Item

export interface ImportCostSheetItem {
  item: string;
  item_name?: string;
  quantity?: number;
  uom?: string;
  purchase_value?: number;
  freight?: number;
  insurance?: number;
  customs_duty?: number;
  additional_duty?: number;
  sales_tax?: number;
  regulatory_duty?: number;
  clearing_charges?: number;
  port_charges?: number;
  other_charges?: number;
  total_landed_cost?: number;
  landed_cost_per_unit?: number;
  idx?: number;
}

export interface ImportCostSheet {
  cost_sheet_date: string;
  company: string;
  supplier: string;
  purchase_order?: string;
  import_shipment?: string;
  purchase_receipt?: string;
  currency?: string;
  expense_account?: string;
  import_cost_sheet_items?: ImportCostSheetItem[];
  total_purchase_value?: number;
  total_landed_cost?: number;
  docstatus?: number;
  name?: string;
}

// ----------------------------------------------------------- Export Packing

export interface ExportPackingDetailsItem {
  carton_no?: string;
  item?: string;
  style?: string;
  color?: string;
  size?: string;
  quantity?: number;
  pieces_per_carton?: number;
  net_weight?: number;
  gross_weight?: number;
  dimensions?: string;
  volume_cbm?: number;
  idx?: number;
}

export interface ExportPackingDetails {
  packing_no?: string;
  packing_date?: string;
  sales_order: string;
  export_shipment?: string;
  customer?: string;
  lc_proforma?: string;
  export_packing_details?: ExportPackingDetailsItem[];
  total_cartons?: number;
  total_pieces?: number;
  total_net_weight?: number;
  total_gross_weight?: number;
  total_cbm?: number;
    name?: string;
}

export interface LCProforma {
  proforma_no?: string;
  proforma_date: string;
  company: string;
  customer: string;
  buyer_po_no?: string;
  export_order?: string;
  currency: string;
  exchange_rate?: number;
  lc_required?: boolean;
  lc_no?: string;
  lc_date?: string;
  lc_type?: string;
  lc_issuing_bank?: string;
  lc_advising_bank?: string;
  lc_confirming_bank?: string;
  lc_amount?: number;
  lc_currency?: string;
  lc_expiry_date?: string;
  lc_expiry_place?: string;
  latest_shipment_date?: string;
  partial_shipment_allowed?: boolean;
  transshipment_allowed?: boolean;
  port_of_loading?: string;
  port_of_discharge?: string;
  final_destination?: string;
  country_of_destination?: string;
  shipment_mode?: string;
  incoterm?: string;
  payment_terms?: string;
  beneficiary_bank?: string;
  bank_account?: string;
  swift_code?: string;
  bank_branch?: string;
  correspondent_bank?: string;
  lc_proforma_items?: LCProformaItem[];
  total_quantity?: number;
  total_cartons?: number;
  total_net_weight?: number;
  total_gross_weight?: number;
  total_proforma_value?: number;
  lc_status?: string;
  workflow_state?: string;
  amended_from?: string | null;
    name?: string;
}
// ------------------------------------------------------------- Purchase Order

export interface PurchaseOrderItem {
  item_code: string;
  item_name?: string;
  description?: string;
  qty: number;
  received_qty?: number;
  rate?: number;
  amount?: number;
  uom?: string;
  stock_uom?: string;
  conversion_factor?: number;
  warehouse?: string;
  schedule_date?: string;
  idx?: number;
}

/**
 * Standard ERPNext Purchase Order (buying).
 * Child table fieldname is `items` (Purchase Order Item).
 */
export interface PurchaseOrder {
  name?: string;
  title?: string;
  naming_series?: string;
  supplier: string;
  supplier_name?: string;
  transaction_date: string;
  schedule_date?: string;
  company: string;
  currency: string;
  conversion_rate?: number;
  buying_price_list?: string;
  price_list_currency?: string;
  plc_conversion_rate?: number;
  status?: string;
  docstatus?: 0 | 1 | 2;
  per_received?: number;
  per_billed?: number;
  total_qty?: number;
  total?: number;
  net_total?: number;
  grand_total?: number;
  rounded_total?: number;
  base_grand_total?: number;
  taxes_and_charges?: string;
  apply_discount_on?: string;
  additional_discount_percentage?: number;
  discount_amount?: number;
  is_subcontracted?: 0 | 1 | boolean;
  set_warehouse?: string;
  supplier_warehouse?: string;
  incoterm?: string;
  named_place?: string;
  shipping_address?: string;
  billing_address?: string;
  payment_terms_template?: string;
  tc_name?: string;
  terms?: string;
  items?: PurchaseOrderItem[];
  amended_from?: string | null;
}

// ------------------------------------------------------------ Sales Order

export interface SalesOrderItem {
  item_code?: string;
  item_name?: string;
  description?: string;
  warehouse?: string;
  delivery_date?: string;
  uom?: string;
  stock_uom?: string;
  conversion_factor?: number;
  qty: number;
  delivered_qty?: number;
  produced_qty?: number;
  packed_qty?: number;
  rate?: number;
  amount?: number;
  style_no?: string;
  buyer_style_no?: string;
  buyer_color?: string;
  buyer_size?: string;
  season?: string;
  hs_code?: string;
  country_of_origin?: string;
  export_quantity?: number;
  carton_quantity?: number;
  net_weight?: number;
  gross_weight?: number;
  idx?: number;
}

/**
 * Standard ERPNext Sales Order plus the Micromax custom export fields added by
 * the `micromax` app (see install.py make_custom_fields).
 */
export interface SalesOrder {
  name: string;
  naming_series?: string;
  customer: string;
  customer_name?: string;
  transaction_date: string;
  delivery_date?: string;
  po_no?: string;
  buyer_po_no?: string;
  company: string;
  currency: string;
  conversion_rate?: number;
  set_warehouse?: string;
  net_total?: number;
  grand_total?: number;
  total_qty?: number;
  status?: string;
  docstatus: 0 | 1 | 2;
  per_delivered?: number;
  per_billed?: number;
  // Micromax custom fields
  export_status?: string;
  lc_proforma?: string;
  lc_no?: string;
  lc_date?: string;
  lc_issuing_bank?: string;
  lc_advising_bank?: string;
  lc_amount?: number;
  lc_currency?: string;
  lc_expiry_date?: string;
  latest_shipment_date?: string;
  port_of_loading?: string;
  port_of_discharge?: string;
  final_destination?: string;
  incoterm?: string;
  shipment_mode?: string;
  country_of_destination?: string;
  items?: SalesOrderItem[];
}

// ------------------------------------------------------------- Delivery Note

export interface DeliveryNoteItem {
  item_code?: string;
  item_name?: string;
  description?: string;
  cost_center?: string;
  qty: number;
  uom?: string;
  stock_uom?: string;
  conversion_factor?: number;
  rate?: number;
  amount?: number;
  warehouse?: string;
  against_sales_order?: string;
  so_detail?: string;
  idx?: number;
}

/** Standard ERPNext Delivery Note — the real stock-out event (decrements inventory, feeds COGS). */
export interface DeliveryNote {
  name?: string;
  naming_series?: string;
  customer: string;
  customer_name?: string;
  posting_date: string;
  company: string;
  currency: string;
  conversion_rate?: number;
  set_warehouse?: string;
  cost_center?: string;
  tc_name?: string;
  instructions?: string;
  net_total?: number;
  grand_total?: number;
  total_qty?: number;
  per_billed?: number;
  status?: string;
  docstatus?: 0 | 1 | 2;
  items?: DeliveryNoteItem[];
  amended_from?: string | null;
}

// ------------------------------------------------------------- Sales Invoice

export interface SalesInvoiceItem {
  item_code?: string;
  item_name?: string;
  description?: string;
  cost_center?: string;
  qty: number;
  uom?: string;
  stock_uom?: string;
  conversion_factor?: number;
  rate?: number;
  amount?: number;
  warehouse?: string;
  sales_order?: string;
  so_detail?: string;
  delivery_note?: string;
  dn_detail?: string;
  idx?: number;
}

/** Standard ERPNext Sales Invoice. */
export interface SalesInvoice {
  name?: string;
  naming_series?: string;
  customer: string;
  customer_name?: string;
  posting_date: string;
  due_date?: string;
  update_stock?: 0 | 1 | boolean;
  company: string;
  currency: string;
  conversion_rate?: number;
  selling_price_list?: string;
  cost_center?: string;
  net_total?: number;
  grand_total?: number;
  outstanding_amount?: number;
  payment_terms_template?: string;
  tc_name?: string;
  terms?: string;
  status?: string;
  docstatus?: 0 | 1 | 2;
  items?: SalesInvoiceItem[];
  amended_from?: string | null;
}

// ------------------------------------------------------------- Stock Entry

export interface StockEntryItem {
  item_code?: string;
  item_name?: string;
  description?: string;
  cost_center?: string;
  qty: number;
  uom?: string;
  stock_uom?: string;
  conversion_factor?: number;
  s_warehouse?: string;
  t_warehouse?: string;
  basic_rate?: number;
  basic_amount?: number;
  amount?: number;
  material_request?: string;
  material_request_item?: string;
  idx?: number;
}

/**
 * Standard ERPNext Stock Entry — scoped to core movement purposes (Material
 * Receipt / Issue / Transfer) for this app; Manufacture/Repack (BOM-driven)
 * are out of scope here and belong to the separate Production module.
 */
export interface StockEntry {
  name?: string;
  naming_series?: string;
  company: string;
  posting_date: string;
  stock_entry_type?: string;
  purpose?: "Material Receipt" | "Material Issue" | "Material Transfer" | string;
  from_warehouse?: string;
  to_warehouse?: string;
  cost_center?: string;
  total_amount?: number;
  remarks?: string;
  docstatus?: 0 | 1 | 2;
  items?: StockEntryItem[];
  amended_from?: string | null;
}

// ------------------------------------------------------------- Material Request

export interface MaterialRequestItem {
  item_code?: string;
  item_name?: string;
  description?: string;
  cost_center?: string;
  qty: number;
  uom?: string;
  stock_uom?: string;
  conversion_factor?: number;
  warehouse?: string;
  from_warehouse?: string;
  schedule_date?: string;
  rate?: number;
  amount?: number;
  ordered_qty?: number;
  idx?: number;
}

/**
 * Standard ERPNext Material Request — scoped to Purchase / Material Transfer
 * / Material Issue for this app (matches Stock Entry's purpose scoping);
 * Manufacture/Subcontracting/Customer Provided are out of scope here. A
 * submitted "Purchase" type request can chain into a Purchase Order or a
 * Request for Quotation via mapped-doc "Create" actions.
 */
export interface MaterialRequest {
  name?: string;
  naming_series?: string;
  title?: string;
  material_request_type?: "Purchase" | "Material Transfer" | "Material Issue" | string;
  transaction_date: string;
  schedule_date?: string;
  company: string;
  set_warehouse?: string;
  set_from_warehouse?: string;
  status?: string;
  per_ordered?: number;
  per_received?: number;
  docstatus?: 0 | 1 | 2;
  items?: MaterialRequestItem[];
  amended_from?: string | null;
}

// ------------------------------------------------------- Request for Quotation

export interface RequestForQuotationItem {
  item_code?: string;
  item_name?: string;
  description?: string;
  qty: number;
  uom?: string;
  stock_uom?: string;
  conversion_factor?: number;
  warehouse?: string;
  schedule_date?: string;
  material_request?: string;
  material_request_item?: string;
  idx?: number;
}

export interface RequestForQuotationSupplier {
  supplier: string;
  supplier_name?: string;
  contact?: string;
  email_id?: string;
  send_email?: 0 | 1 | boolean;
  email_sent?: 0 | 1 | boolean;
  quote_status?: string;
  idx?: number;
}

/**
 * Standard ERPNext Request for Quotation. This app has no Supplier Quotation
 * module, so the usual RFQ -> Supplier Quotation -> Purchase Order chain is
 * simplified to a direct "Create Purchase Order" action on the RFQ Detail
 * page — a client-side prefill only (Purchase Order Item has no RFQ link
 * field, so unlike Material Request there's no server-traceable connection).
 */
export interface RequestForQuotation {
  name?: string;
  naming_series?: string;
  title?: string;
  company: string;
  transaction_date: string;
  schedule_date?: string;
  subject: string;
  message_for_supplier?: string;
  status?: "Draft" | "Submitted" | "Cancelled" | string;
  docstatus?: 0 | 1 | 2;
  suppliers?: RequestForQuotationSupplier[];
  items?: RequestForQuotationItem[];
  amended_from?: string | null;
}

// ------------------------------------------------------------- Stock Ledger Entry

/** A single Stock Ledger Entry row — read-only, surfaced via the Stock Ledger report. */
export interface StockLedgerEntry {
  name?: string;
  item_code?: string;
  item_name?: string;
  warehouse?: string;
  posting_date?: string;
  posting_time?: string;
  voucher_type?: string;
  voucher_no?: string;
  actual_qty?: number;
  qty_after_transaction?: number;
  incoming_rate?: number;
  valuation_rate?: number;
  stock_value?: number;
  stock_value_difference?: number;
  company?: string;
  batch_no?: string;
}

// ------------------------------------------------------------- Masters

export interface Item {
  name: string;
  item_code?: string;
  item_name?: string;
  item_group?: string;
  stock_uom?: string;
  standard_rate?: number;
  description?: string;
  disabled?: boolean;
  image?: string;
  color?: string;
  size?: string;
  style?: string;
  hs_code?: string;
}

export interface Customer {
  name: string;
  customer_name?: string;
  territory?: string;
  customer_group?: string;
  currency?: string;
  disabled?: boolean;
}

export interface Supplier {
  name: string;
  supplier_name?: string;
  supplier_group?: string;
  country?: string;
  disabled?: boolean;
}

export interface ItemGroup {
  name: string;
  item_group_name?: string;
  parent_item_group?: string;
  is_group?: 0 | 1 | boolean;
  lft?: number;
}

export interface CustomerGroup {
  name: string;
  customer_group_name?: string;
  parent_customer_group?: string;
  is_group?: 0 | 1 | boolean;
  default_price_list?: string;
  payment_terms?: string;
  lft?: number;
}

export interface SupplierGroup {
  name: string;
  supplier_group_name?: string;
  parent_supplier_group?: string;
  is_group?: 0 | 1 | boolean;
  payment_terms?: string;
  lft?: number;
}

export interface Company {
  name: string;
  company_name?: string;
  abbr?: string;
  is_group?: 0 | 1 | boolean;
  parent_company?: string;
  domain?: string;
  tax_id?: string;
  country?: string;
  default_currency?: string;
  phone_no?: string;
  email?: string;
  website?: string;
  default_bank_account?: string;
  default_cash_account?: string;
  default_receivable_account?: string;
  default_payable_account?: string;
  default_income_account?: string;
  default_expense_account?: string;
  round_off_account?: string;
  round_off_cost_center?: string;
  write_off_account?: string;
  cost_center?: string;
  credit_limit?: number;
  payment_terms?: string;
  default_selling_terms?: string;
  default_buying_terms?: string;
  enable_perpetual_inventory?: 0 | 1 | boolean;
  default_inventory_account?: string;
  stock_adjustment_account?: string;
  default_warehouse?: string;
  valuation_method?: "FIFO" | "Moving Average" | "LIFO";
}

export interface AccountsSettings {
  name: string;
  determine_address_tax_category_from?: string;
  credit_controller?: string;
  check_supplier_invoice_uniqueness?: 0 | 1 | boolean;
  make_payment_via_journal_entry?: 0 | 1 | boolean;
  unlink_payment_on_cancellation_of_invoice?: 0 | 1 | boolean;
  unlink_advance_payment_on_cancelation_of_order?: 0 | 1 | boolean;
  book_asset_depreciation_entry_automatically?: 0 | 1 | boolean;
  show_inclusive_tax_in_print?: 0 | 1 | boolean;
  show_payment_schedule_in_print?: 0 | 1 | boolean;
  allow_stale?: 0 | 1 | boolean;
  stale_days?: number;
  automatically_fetch_payment_terms?: 0 | 1 | boolean;
  over_billing_allowance?: number;
  role_allowed_to_over_bill?: string;
  enable_common_party_accounting?: 0 | 1 | boolean;
  show_balance_in_coa?: 0 | 1 | boolean;
  merge_similar_account_heads?: 0 | 1 | boolean;
  general_ledger_remarks_length?: number;
  enable_immutable_ledger?: 0 | 1 | boolean;
  default_ageing_range?: string;
  enable_discounts_and_margin?: 0 | 1 | boolean;
  enable_accounting_dimensions?: 0 | 1 | boolean;
}

export interface GlobalDefaults {
  name: string;
  default_company?: string;
  country?: string;
  default_distance_unit?: string;
  default_currency?: string;
  hide_currency_symbol?: 0 | 1 | boolean;
  disable_rounded_total?: 0 | 1 | boolean;
  disable_in_words?: 0 | 1 | boolean;
  use_posting_datetime_for_naming_documents?: 0 | 1 | boolean;
}

export interface AccountingDimension {
  name: string;
  label?: string;
  fieldname?: string;
  document_type?: string;
  disabled?: 0 | 1 | boolean;
}

export interface SellingSettings {
  name: string;
  cust_master_name?: string;
  customer_group?: string;
  territory?: string;
  selling_price_list?: string;
  so_required?: "No" | "Yes";
  dn_required?: "No" | "Yes";
  maintain_same_sales_rate?: 0 | 1 | boolean;
  editable_price_list_rate?: 0 | 1 | boolean;
  allow_multiple_items?: 0 | 1 | boolean;
  validate_selling_price?: 0 | 1 | boolean;
  hide_tax_id?: 0 | 1 | boolean;
  allow_negative_rates_for_items?: 0 | 1 | boolean;
  enable_discount_accounting?: 0 | 1 | boolean;
}

export interface BuyingSettings {
  name: string;
  supp_master_name?: string;
  supplier_group?: string;
  buying_price_list?: string;
  po_required?: "No" | "Yes";
  pr_required?: "No" | "Yes";
  maintain_same_rate?: 0 | 1 | boolean;
  allow_multiple_items?: 0 | 1 | boolean;
  bill_for_rejected_quantity_in_purchase_invoice?: 0 | 1 | boolean;
  disable_last_purchase_rate?: 0 | 1 | boolean;
  allow_negative_rates_for_items?: 0 | 1 | boolean;
  over_transfer_allowance?: number;
  blanket_order_allowance?: number;
}

export interface HRSettings {
  name: string;
  retirement_age?: string;
  emp_created_by?: string;
  standard_working_hours?: number;
  expense_approver_mandatory_in_expense_claim?: 0 | 1 | boolean;
  leave_approver_mandatory_in_leave_application?: 0 | 1 | boolean;
  send_leave_notification?: 0 | 1 | boolean;
  send_holiday_reminders?: 0 | 1 | boolean;
  send_birthday_reminders?: 0 | 1 | boolean;
  send_work_anniversary_reminders?: 0 | 1 | boolean;
  allow_employee_checkin_from_mobile_app?: 0 | 1 | boolean;
  allow_geolocation_tracking?: 0 | 1 | boolean;
  restrict_backdated_leave_application?: 0 | 1 | boolean;
  prevent_self_leave_approval?: 0 | 1 | boolean;
  prevent_self_expense_approval?: 0 | 1 | boolean;
}

export interface PayrollSettings {
  name: string;
  payroll_based_on?: "Leave" | "Attendance";
  consider_unmarked_attendance_as?: "Present" | "Absent";
  max_working_hours_against_timesheet?: number;
  include_holidays_in_total_working_days?: 0 | 1 | boolean;
  daily_wages_fraction_for_half_day?: number;
  email_salary_slip_to_employee?: 0 | 1 | boolean;
  encrypt_salary_slips_in_emails?: 0 | 1 | boolean;
  show_leave_balances_in_salary_slip?: 0 | 1 | boolean;
  process_payroll_accounting_entry_based_on_employee?: 0 | 1 | boolean;
  create_overtime_slip?: 0 | 1 | boolean;
}

// ------------------------------------------------------------- Misc / users

export interface FrappeUserRoleRow {
  role: string;
}

export interface FrappeUser {
  name: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  user_image?: string;
  email?: string;
  language?: string;
  time_zone?: string;
  user_type?: string;
  enabled?: number;
  last_login?: string;
  creation?: string;
  /** Child table (`Has Role`) — only present when the full doc is loaded via get_doc. */
  roles?: FrappeUserRoleRow[];
  default_company?: string;
}

export interface FrappeRole {
  name: string;
  disabled?: 0 | 1;
  desk_access?: 0 | 1;
}

// ---------------------------------------------------- Purchase Receipt / Invoice

/** Standard ERPNext Purchase Receipt Item. Child fieldname is `items`. */
export interface PurchaseReceiptItem {
  item_code: string;
  item_name?: string;
  description?: string;
  received_qty?: number;
  qty: number;
  rejected_qty?: number;
  uom?: string;
  stock_uom?: string;
  conversion_factor?: number;
  rate?: number;
  amount?: number;
  warehouse?: string;
  rejected_warehouse?: string;
  quality_inspection?: string;
  purchase_order?: string;
  purchase_order_item?: string;
  schedule_date?: string;
  idx?: number;
}

/**
 * Standard ERPNext Purchase Receipt (buying / stock).
 * Child table fieldname is `items` (Purchase Receipt Item).
 */
export interface PurchaseReceipt {
  name?: string;
  naming_series?: string;
  supplier: string;
  supplier_name?: string;
  supplier_delivery_note?: string;
  posting_date: string;
  posting_time?: string;
  company: string;
  currency: string;
  conversion_rate?: number;
  buying_price_list?: string;
  set_warehouse?: string;
  supplier_warehouse?: string;
  taxes_and_charges?: string;
  apply_discount_on?: string;
  additional_discount_percentage?: number;
  discount_amount?: number;
  status?: string;
  docstatus?: 0 | 1 | 2;
  per_billed?: number;
  per_returned?: number;
  instructions?: string;
  total?: number;
  net_total?: number;
  grand_total?: number;
  rounded_total?: number;
  base_grand_total?: number;
  tc_name?: string;
  terms?: string;
  items?: PurchaseReceiptItem[];
  amended_from?: string | null;
}

/** Standard ERPNext Purchase Invoice Item. Child fieldname is `items`. */
export interface PurchaseInvoiceItem {
  item_code: string;
  item_name?: string;
  description?: string;
  received_qty?: number;
  qty: number;
  rejected_qty?: number;
  uom?: string;
  stock_uom?: string;
  conversion_factor?: number;
  rate?: number;
  amount?: number;
  warehouse?: string;
  rejected_warehouse?: string;
  quality_inspection?: string;
  expense_account?: string;
  purchase_order?: string;
  po_detail?: string;
  purchase_receipt?: string;
  pr_detail?: string;
  idx?: number;
}

/**
 * Standard ERPNext Purchase Invoice (accounts / buying).
 * Child table fieldname is `items` (Purchase Invoice Item).
 */
export interface PurchaseInvoice {
  name?: string;
  naming_series?: string;
  supplier: string;
  supplier_name?: string;
  posting_date: string;
  due_date?: string;
  is_paid?: 0 | 1 | boolean;
  update_stock?: 0 | 1 | boolean;
  on_hold?: 0 | 1 | boolean;
  company: string;
  cost_center?: string;
  bill_no?: string;
  bill_date?: string;
  currency: string;
  conversion_rate?: number;
  buying_price_list?: string;
  set_warehouse?: string;
  rejected_warehouse?: string;
  taxes_and_charges?: string;
  apply_discount_on?: string;
  additional_discount_percentage?: number;
  discount_amount?: number;
  total?: number;
  net_total?: number;
  grand_total?: number;
  rounded_total?: number;
  outstanding_amount?: number;
  payment_terms_template?: string;
  tc_name?: string;
  terms?: string;
  credit_to?: string;
  status?: string;
  docstatus?: 0 | 1 | 2;
  items?: PurchaseInvoiceItem[];
  amended_from?: string | null;
}

// ----------------------------------------------------------------- GL Entry

/** Standard ERPNext General Ledger Entry (accounting journal row). */
export interface GLEntry {
  name: string;
  posting_date?: string;
  account?: string;
  party_type?: string;
  party?: string;
  cost_center?: string;
  debit?: number;
  credit?: number;
  account_currency?: string;
  debit_in_account_currency?: number;
  credit_in_account_currency?: number;
  against?: string;
  against_voucher_type?: string;
  against_voucher?: string;
  voucher_type?: string;
  voucher_no?: string;
  remarks?: string;
  is_cancelled?: 0 | 1 | boolean;
}

// ------------------------------------------------------------- Payment Entry

/** Standard ERPNext Payment Entry Reference (the "references" allocation table). */
export interface PaymentEntryReference {
  name?: string;
  reference_doctype: string;
  reference_name: string;
  due_date?: string;
  bill_no?: string;
  total_amount?: number;
  outstanding_amount?: number;
  allocated_amount?: number;
  exchange_rate?: number;
  payment_term?: string;
  idx?: number;
}

/** Standard ERPNext Payment Entry Deduction (the "deductions" table — TDS, bank charges, write-offs, ...). */
export interface PaymentEntryDeduction {
  name?: string;
  account: string;
  cost_center?: string;
  amount: number;
  description?: string;
  idx?: number;
}

/** "Advance Taxes and Charges" — Payment Entry's own tax/charge line, distinct from (but shaped like) Purchase/Sales Taxes and Charges. */
export interface PaymentEntryTax {
  name?: string;
  charge_type: "Actual" | "On Paid Amount" | "On Previous Row Amount" | "On Previous Row Total" | string;
  account_head: string;
  description: string;
  rate?: number;
  add_deduct_tax?: "Add" | "Deduct" | string;
  tax_amount?: number;
  total?: number;
  base_tax_amount?: number;
  base_total?: number;
  idx?: number;
}

/**
 * Standard ERPNext Payment Entry — full core field set for a compact
 * create/edit form (advance-tax-withholding, payment-order and auto-repeat
 * fields are intentionally left out, same "commercially useful subset, not
 * a literal 1:1 DocType mirror" scope as the Purchase Invoice/Journal Entry
 * forms).
 */
export interface PaymentEntry {
  name: string;
  naming_series?: string;
  title?: string;
  payment_type?: "Receive" | "Pay" | "Internal Transfer" | string;
  posting_date?: string;
  company?: string;
  mode_of_payment?: string;
  party_type?: string;
  party?: string;
  party_name?: string;
  contact_person?: string;
  contact_email?: string;
  bank_account?: string;
  party_bank_account?: string;
  paid_from?: string;
  paid_from_account_currency?: string;
  paid_from_account_type?: string;
  paid_to?: string;
  paid_to_account_currency?: string;
  paid_to_account_type?: string;
  paid_amount?: number;
  base_paid_amount?: number;
  source_exchange_rate?: number;
  received_amount?: number;
  base_received_amount?: number;
  target_exchange_rate?: number;
  total_allocated_amount?: number;
  base_total_allocated_amount?: number;
  unallocated_amount?: number;
  difference_amount?: number;
  reference_no?: string;
  reference_date?: string;
  clearance_date?: string;
  project?: string;
  cost_center?: string;
  remarks?: string;
  status?: "Draft" | "Submitted" | "Cancelled" | string;
  docstatus?: 0 | 1 | 2;
  purchase_taxes_and_charges_template?: string;
  sales_taxes_and_charges_template?: string;
  total_taxes_and_charges?: number;
  base_total_taxes_and_charges?: number;
  references?: PaymentEntryReference[];
  deductions?: PaymentEntryDeduction[];
  taxes?: PaymentEntryTax[];
}

// ---------------------------------------------------------- Landed Cost Voucher

export type LandedCostReceiptDocType = "Purchase Invoice" | "Purchase Receipt";

/** Standard ERPNext Landed Cost Purchase Receipt (the "Vouchers" child table). */
export interface LandedCostPurchaseReceipt {
  receipt_document_type: LandedCostReceiptDocType;
  receipt_document: string;
  supplier?: string;
  posting_date?: string;
  grand_total?: number;
  idx?: number;
}

/** Standard ERPNext Landed Cost Item (read-only, server-populated from the receipts above). */
export interface LandedCostItem {
  item_code: string;
  description?: string;
  receipt_document_type?: LandedCostReceiptDocType;
  receipt_document?: string;
  qty?: number;
  rate?: number;
  amount?: number;
  applicable_charges?: number;
  purchase_receipt_item?: string;
  cost_center?: string;
  is_fixed_asset?: 0 | 1 | boolean;
  idx?: number;
}

/** Standard ERPNext Landed Cost Taxes and Charges (the charges being allocated). */
export interface LandedCostTaxesAndCharges {
  description: string;
  amount: number;
  expense_account?: string;
  account_currency?: string;
  base_amount?: number;
  idx?: number;
}

/**
 * Standard ERPNext Landed Cost Voucher.
 * Distributes freight/duty/insurance/etc. charges across the items of one or
 * more submitted Purchase Receipts / stock-updating Purchase Invoices, and
 * updates their item valuation rates + GL entries on submit.
 */
export interface LandedCostVoucher {
  name?: string;
  naming_series?: string;
  company: string;
  posting_date: string;
  purchase_receipts: LandedCostPurchaseReceipt[];
  items?: LandedCostItem[];
  taxes: LandedCostTaxesAndCharges[];
  total_taxes_and_charges?: number;
  distribute_charges_based_on: "Qty" | "Amount" | "Distribute Manually";
  docstatus?: 0 | 1 | 2;
  amended_from?: string | null;
}

// -------------------------------------------------------------- Accounting

/** Chart of Accounts node. Tree via `parent_account` (nested-set `lft`/`rgt` under the hood). */
export interface Account {
  name: string;
  account_name?: string;
  account_number?: string;
  parent_account?: string;
  is_group?: 0 | 1 | boolean;
  root_type?: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
  report_type?: "Balance Sheet" | "Profit and Loss";
  account_type?: string;
  account_currency?: string;
  company?: string;
  disabled?: 0 | 1 | boolean;
  /**
   * "CPS Applicable" tag (micromax custom field) — set on the Expense accounts whose GL
   * postings feed the Production dashboard's cost-per-spindle figures.
   */
  cps_applicable?: 0 | 1 | boolean;
  lft?: number;
  rgt?: number;
}

export interface CostCenter {
  name: string;
  cost_center_name?: string;
  cost_center_number?: string;
  parent_cost_center?: string;
  is_group?: 0 | 1 | boolean;
  company?: string;
  disabled?: 0 | 1 | boolean;
  lft?: number;
  rgt?: number;
}

export interface AccountCategory {
  name: string;
  account_category_name?: string;
  root_type?: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
  description?: string;
}

export interface TermsAndConditions {
  name: string;
  title?: string;
  terms?: string;
  selling?: 0 | 1 | boolean;
  buying?: 0 | 1 | boolean;
  disabled?: 0 | 1 | boolean;
}

export interface JournalEntryTemplateAccount {
  name?: string;
  account?: string;
  party_type?: string;
  party?: string;
  cost_center?: string;
  project?: string;
}

export interface JournalEntryTemplate {
  name: string;
  template_title?: string;
  voucher_type?: string;
  company?: string;
  is_opening?: "No" | "Yes";
  multi_currency?: 0 | 1 | boolean;
  naming_series?: string;
  accounts?: JournalEntryTemplateAccount[];
}

export interface FiscalYear {
  name: string;
  year?: string;
  year_start_date?: string;
  year_end_date?: string;
  disabled?: 0 | 1 | boolean;
}

export interface PaymentTerm {
  name: string;
  payment_term_name?: string;
  invoice_portion?: number;
  mode_of_payment?: string;
  due_date_based_on?: string;
  credit_days?: number;
  credit_months?: number;
  description?: string;
  discount_type?: "Percentage" | "Amount";
  discount?: number;
  discount_validity_based_on?: string;
  discount_validity?: number;
}

export interface ModeOfPaymentAccount {
  name?: string;
  company?: string;
  default_account?: string;
}

export interface ModeOfPayment {
  name: string;
  mode_of_payment?: string;
  type?: string;
  enabled?: 0 | 1 | boolean;
  accounts?: ModeOfPaymentAccount[];
}

export interface TaxTemplateRow {
  name?: string;
  charge_type?: string;
  row_id?: string;
  account_head?: string;
  cost_center?: string;
  description?: string;
  rate?: number;
  included_in_print_rate?: 0 | 1 | boolean;
  /** Purchase Taxes and Charges only. */
  category?: string;
  /** Purchase Taxes and Charges only. */
  add_deduct_tax?: "Add" | "Deduct";
}

/** Sales/Purchase Taxes and Charges Template — same shape for both doctypes. */
export interface TaxTemplate {
  name: string;
  title?: string;
  company?: string;
  is_default?: 0 | 1 | boolean;
  disabled?: 0 | 1 | boolean;
  tax_category?: string;
  taxes?: TaxTemplateRow[];
}

export interface JournalEntryAccountRow {
  account: string;
  party_type?: string;
  party?: string;
  cost_center?: string;
  debit_in_account_currency?: number;
  credit_in_account_currency?: number;
  reference_type?: string;
  reference_name?: string;
  user_remark?: string;
  idx?: number;
}

export interface JournalEntry {
  name?: string;
  naming_series?: string;
  voucher_type?: string;
  from_template?: string;
  company: string;
  posting_date: string;
  accounts: JournalEntryAccountRow[];
  total_debit?: number;
  total_credit?: number;
  difference?: number;
  user_remark?: string;
  multi_currency?: 0 | 1 | boolean;
  docstatus?: 0 | 1 | 2;
  amended_from?: string | null;
}

/** A single `frappe.desk.query_report.run` column descriptor. */
export interface QueryReportColumn {
  fieldname: string;
  label: string;
  fieldtype?: string;
  width?: number;
  options?: string;
  hidden?: 0 | 1;
}

export interface QueryReportSummaryItem {
  label: string;
  value: number | string;
  datatype?: string;
  currency?: string;
  indicator?: "Green" | "Red" | "Blue" | "Orange" | "Gray";
}

/** Result of running any standard ERPNext script report (General Ledger, Trial Balance, ...). */
export interface QueryReportChart {
  data: { labels: string[]; datasets: { name: string; values: number[] }[] };
  type?: "bar" | "line";
  currency?: string;
}

export interface QueryReportResult {
  columns: QueryReportColumn[];
  result: Record<string, unknown>[];
  report_summary?: QueryReportSummaryItem[];
  chart?: QueryReportChart;
}

/** A report configured to run as a background job — `run` alone returns this shape until the job completes. */
export interface PreparedReportDoc {
  name: string;
  status: "Queued" | "Started" | "Completed" | "Error" | "Failed";
}

/** Raw `frappe.desk.query_report.run` response before we know whether it ran synchronously or as a Prepared Report. */
export interface RawQueryReportResponse extends Partial<QueryReportResult> {
  prepared_report?: boolean;
  doc?: PreparedReportDoc | null;
}

// ----------------------------------------------------------------- Activity (Comment / ToDo / Version)

export interface FrappeComment {
  name: string;
  comment_type: "Comment" | "Info" | "Workflow" | string;
  reference_doctype: string;
  reference_name: string;
  content: string;
  comment_by?: string;
  comment_email?: string;
  owner: string;
  creation: string;
}

export interface FrappeToDo {
  name: string;
  allocated_to: string;
  reference_type: string;
  reference_name: string;
  description?: string;
  status: "Open" | "Closed" | "Cancelled";
  priority?: "Low" | "Medium" | "High" | "Urgent";
  assigned_by?: string;
  date?: string;
  creation: string;
}

export interface FrappeVersion {
  name: string;
  ref_doctype: string;
  docname: string;
  data: string;
  owner: string;
  creation: string;
}

// ------ CRM (Frappe CRM app: CRM Lead / CRM Deal / CRM Task / FCRM Note / CRM Call Log / CRM Organization / CRM Notification / CRM View Settings / CRM Dashboard) + core Frappe Event (meeting calendar)

export interface CrmLead {
  name?: string;
  naming_series?: string;
  salutation?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  lead_name?: string;
  gender?: string;
  status?: string;
  email?: string;
  website?: string;
  mobile_no?: string;
  phone?: string;
  no_of_employees?: string;
  annual_revenue?: number;
  lead_owner?: string;
  source?: string;
  industry?: string;
  image?: string;
  job_title?: string;
  organization?: string;
  converted?: 0 | 1;
  territory?: string;
  lost_reason?: string;
  lost_notes?: string;
  total?: number;
  net_total?: number;
  owner?: string;
  creation?: string;
  modified?: string;
  _assign?: string;
  priority?: string;
  csr_department?: string;
  address?: string;
  focus_area?: string;
  education_focus?: string;
  proposed_ask?: string;
  first_contact_date?: string;
  remarks?: string;
  second_contact_name?: string;
  second_contact_gender?: string;
  second_contact_designation?: string;
  second_contact_email?: string;
  second_contact_mobile?: string;
}

export interface CrmDeal {
  name?: string;
  naming_series?: string;
  organization?: string;
  organization_name?: string;
  probability?: number;
  annual_revenue?: number;
  website?: string;
  next_step?: string;
  lead?: string;
  lead_name?: string;
  deal_owner?: string;
  email?: string;
  mobile_no?: string;
  phone?: string;
  status?: string;
  industry?: string;
  salutation?: string;
  first_name?: string;
  last_name?: string;
  gender?: string;
  contact?: string;
  currency?: string;
  exchange_rate?: number;
  deal_value?: number;
  expected_deal_value?: number;
  expected_closure_date?: string;
  closed_date?: string;
  territory?: string;
  source?: string;
  job_title?: string;
  lost_reason?: string;
  lost_notes?: string;
  total?: number;
  net_total?: number;
  owner?: string;
  creation?: string;
  modified?: string;
  _assign?: string;
}

export interface CrmTask {
  name?: string;
  title: string;
  /** Distinguishes the generic Tasks list from the Lead/Deal Follow-ups
   * mechanism — both live on the same CRM Task doctype. Blank/legacy rows
   * (created before this field existed) are treated as belonging to both
   * lists rather than silently dropped from either. */
  task_category?: "Task" | "Follow-up";
  priority?: "Low" | "Medium" | "High";
  status?: "Backlog" | "Todo" | "In Progress" | "Done" | "Cancelled";
  start_date?: string;
  due_date?: string;
  description?: string;
  assigned_to?: string;
  reference_doctype?: string;
  reference_docname?: string;
  creation?: string;
  modified?: string;
}

export interface CrmNote {
  name?: string;
  title?: string;
  content?: string;
  reference_doctype?: string;
  reference_docname?: string;
  owner?: string;
  creation?: string;
  modified?: string;
}

export interface CrmCallLog {
  name?: string;
  id?: string;
  from?: string;
  to?: string;
  status?: string;
  type?: "Incoming" | "Outgoing";
  medium?: string;
  telephony_medium?: string;
  start_time?: string;
  end_time?: string;
  duration?: number;
  recording_url?: string;
  note?: string;
  receiver?: string;
  caller?: string;
  reference_doctype?: string;
  reference_docname?: string;
}

export interface CrmContactRow {
  name?: string;
  contact?: string;
  full_name?: string;
  email?: string;
  mobile_no?: string;
  phone?: string;
  gender?: string;
  is_primary?: 0 | 1;
}

export interface CrmOrganization {
  name?: string;
  organization_name?: string;
  website?: string;
  organization_logo?: string;
  no_of_employees?: string;
  annual_revenue?: number;
  industry?: string;
  territory?: string;
  currency?: string;
  address?: string;
  exchange_rate?: number;
  modified?: string;
}

export interface CrmNotification {
  name?: string;
  type?: string;
  from_user?: string;
  to_user?: string;
  read?: 0 | 1;
  message?: string;
  notification_text?: string;
  reference_doctype?: string;
  reference_name?: string;
  creation?: string;
}

/** A `CRM Prospect Scrape` review-queue row (custom `micromax` doctype, not vendored crm). */
export interface CrmProspectScrape {
  name?: string;
  source_url?: string;
  status?: "Pending Review" | "Approved" | "Rejected" | "Converted";
  research_source?: string;
  last_research_date?: string;
  donor_name?: string;
  donor_type?: string;
  segment?: string;
  website?: string;
  donor_profile_url?: string;
  country?: string;
  city?: string;
  address?: string;
  csr_department?: string;
  focus_area?: string;
  proposed_ask?: string;
  focal_person?: string;
  designation?: string;
  email?: string;
  phone?: string;
  contact_source?: string;
  social_media?: string;
  raw_extract?: string;
  scrape_error?: string;
  converted_lead?: string;
  modified?: string;
  creation?: string;
}

/** A single widget entry from `CRM Dashboard.layout` (a JSON array). */
export interface CrmDashboardWidget {
  name: string;
  type: "number_chart" | "axis_chart" | "donut_chart" | "spacer";
  tooltip?: string;
  layout: { x: number; y: number; w: number; h: number; i: string };
  data?: unknown;
}

/** One column of a kanban board, as returned by `crm.api.doc.get_data`. */
export interface CrmKanbanColumn {
  name: string;
  count?: number;
  title?: string;
  color?: string;
}

/** Per-user list/kanban view config (`CRM View Settings` doctype). */
export interface CrmViewSettings {
  name?: string;
  user?: string;
  dt?: string;
  label?: string;
  type?: "list" | "kanban" | "group_by";
  columns?: string;
  rows?: string;
  filters?: string;
  order_by?: string;
  kanban_columns?: string;
  kanban_fields?: string;
  column_field?: string;
  group_by_field?: string;
  title_field?: string;
  route_name?: string;
  icon?: string;
  pinned?: 0 | 1;
  public?: 0 | 1;
  is_default?: 0 | 1;
  is_standard?: 0 | 1;
  load_default_columns?: 0 | 1;
}

export interface FrappeEventParticipant {
  name?: string;
  reference_doctype?: string;
  reference_docname?: string;
  email?: string;
}

/** Core Frappe `Event` doctype — used here for CRM meetings/calendar (no CRM-specific meeting doctype exists). */
export interface FrappeEvent {
  name?: string;
  subject: string;
  event_category?: "Event" | "Meeting" | "Call" | "Sent/Received Email" | "Other";
  event_type?: "Private" | "Public";
  starts_on?: string;
  ends_on?: string;
  all_day?: 0 | 1;
  status?: "Open" | "Completed" | "Closed" | "Cancelled";
  location?: string;
  description?: string;
  color?: string;
  reference_doctype?: string;
  reference_docname?: string;
  event_participants?: FrappeEventParticipant[];
  owner?: string;
  modified?: string;
}

export type DocTypeName =
  | "Item"
  | "Customer"
  | "Supplier"
  | "Company"
  | "Sales Order"
  | "Purchase Order"
  | "BOM"
  | "Work Order"
  | "Stock Entry"
  | "Material Request"
  | "Request for Quotation"
  | "Stock Ledger Entry"
  | "Purchase Receipt"
  | "Delivery Note"
  | "Sales Invoice"
  | "Purchase Invoice"
  | "LC Proforma"
  | "Export Shipment"
  | "Import Shipment"
  | "Import Cost Sheet"
  | "Export Packing Details"
  | "Landed Cost Voucher"
  | "Payment Entry"
  | "GL Entry"
  | "CRM Lead"
  | "CRM Deal"
  | "CRM Task"
  | "FCRM Note"
  | "CRM Call Log"
  | "CRM Organization"
  | "CRM Notification"
  | "CRM Prospect Scrape"
  | "Event";