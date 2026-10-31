/**
 * Buying documents as one tabbed page each (view, edit and new, like the selling documents): Material Request (purchase
 * demand), Request for Quotation (inquiry), Supplier Quotation, Purchase Order, Purchase Receipt (GRN) and Purchase Invoice.
 * At-a-glance tiles from sugarcane.erp_insights.buying_insights; ledger, connections, activity and actions from DocFormPage.
 */
import { BookOpen, Boxes, ClipboardList, Coins, FileSignature, FileText, Landmark, Package, Quote, Receipt, ShoppingCart, SlidersHorizontal, Truck, Users } from "lucide-react";
import type { ChildTableSpec, DocConfig, DocValues, ExtraContext } from "@/components/doc/doc-config";
import {
  sec, colBreak, tab, data, date, float, currency, check, text, link, select, ro, req, when,
  nameCol, dateCol, moneyCol, statusCol, numCol, fmt, fmtMoney,
} from "@/components/doc/doc-helpers";
import { InsightsPanel } from "@/components/doc/insights-panel";
import { LedgerPanel } from "@/components/doc/ledger-panel";
import { postCall } from "@/services/frappe";
import { todayISO } from "@/utils/dates";
import { asNumber } from "@/utils/cn";
import { PAYMENT_SCHEDULE, computeTaxRows, termsFields } from "@/pages/Selling/selling-configs";

type BuyingDocType = "Purchase Order" | "Purchase Receipt" | "Purchase Invoice" | "Material Request" | "Request for Quotation" | "Supplier Quotation";
const dateOf = (v: DocValues) => v.transaction_date || v.posting_date || todayISO();

/* ---------------------------------------------------------------- shared behaviour */

/** Purchase tax template → its rows. */
async function purchaseTaxes(template: string) {
  if (!template) return {};
  const rows = await postCall<DocValues[]>("erpnext.controllers.accounts_controller.get_taxes_and_charges", {
    master_doctype: "Purchase Taxes and Charges Template", master_name: template,
  }).catch(() => []);
  return { taxes: rows ?? [] };
}

/** Supplier → currency, price list, taxes, terms, addresses, payable account (erpnext.accounts.party.get_party_details). */
const supplierEffect = (doctype: BuyingDocType) => async (supplier: string, v: DocValues) => {
  if (!supplier || !v.company) return;
  const d = await postCall<DocValues>("erpnext.accounts.party.get_party_details", {
    party: supplier, party_type: "Supplier", company: v.company, doctype, posting_date: dateOf(v),
  }).catch(() => ({}) as DocValues);
  const keep = ["supplier_name", "currency", "buying_price_list", "price_list_currency", "taxes_and_charges", "payment_terms_template",
    "supplier_address", "shipping_address", "contact_person", "tax_category", "tax_id", ...(doctype === "Purchase Invoice" ? ["credit_to"] : [])];
  const patch: DocValues = Object.fromEntries(keep.filter((k) => d[k] != null && d[k] !== "").map((k) => [k, d[k]]));
  if (patch.currency && patch.currency !== v.currency) patch.conversion_rate = patch.currency === "PKR" ? 1 : v.conversion_rate ?? 1;
  if (d.taxes_and_charges) Object.assign(patch, await purchaseTaxes(String(d.taxes_and_charges)));
  return patch;
};

/** Item → name, UOM, last / price-list rate, warehouse, expense account (erpnext.stock.get_item_details). */
const itemEffect = (doctype: BuyingDocType) => async (code: string, row: DocValues, v: DocValues) => {
  if (!code) return;
  const d = await postCall<DocValues>("erpnext.stock.get_item_details.get_item_details", {
    ctx: JSON.stringify({
      item_code: code, company: v.company, supplier: v.supplier, currency: v.currency || "PKR", conversion_rate: v.conversion_rate || 1,
      price_list: v.buying_price_list, price_list_currency: v.price_list_currency || v.currency, plc_conversion_rate: v.plc_conversion_rate || 1,
      doctype, transaction_date: dateOf(v), posting_date: dateOf(v), qty: row.qty || 1, warehouse: row.warehouse || v.set_warehouse,
    }),
  }).catch(() => ({}) as DocValues);
  const rate = asNumber(d.rate) || asNumber(d.price_list_rate) || asNumber(d.last_purchase_rate);
  const qty = asNumber(row.qty) || 1;
  return {
    item_name: d.item_name ?? code, description: d.description, uom: d.uom, stock_uom: d.stock_uom, conversion_factor: d.conversion_factor ?? 1,
    price_list_rate: d.price_list_rate, rate, qty, amount: rate * qty, warehouse: row.warehouse || d.warehouse,
    expense_account: d.expense_account, cost_center: d.cost_center, item_tax_template: d.item_tax_template,
    ...(doctype === "Purchase Receipt" ? { received_qty: qty, rejected_qty: 0 } : {}),
  };
};

const itemsSpec = (doctype: BuyingDocType, childDoctype: string, extraCols: ChildTableSpec["columns"] = [], extraDialog: ChildTableSpec["dialogColumns"] = [],
  priced = true): ChildTableSpec => ({
  tab: "Items",
  key: "items",
  label: "Items",
  doctype: childDoctype,
  minRows: 1,
  wide: true,
  columns: [
    req(link("item_code", "Item", "Item")),
    ro(data("item_name", "Item Name")),
    req(float("qty", "Qty")),
    link("uom", "UOM", "UOM"),
    ...(priced ? [currency("rate", "Rate"), ro(currency("amount", "Amount"))] : []),
    ...extraCols,
    link("warehouse", doctype === "Material Request" ? "For Warehouse" : "Warehouse", "Warehouse"),
  ],
  dialogColumns: [text("description", "Description"), ...(priced ? [ro(currency("price_list_rate", "Price List Rate")), float("discount_percentage", "Discount %"),
    link("item_tax_template", "Item Tax Template", "Item Tax Template")] : []), link("expense_account", "Expense Account", "Account"),
    link("cost_center", "Cost Center", "Cost Center"), ...extraDialog],
  newRow: (v) => ({ qty: 1, rate: 0, amount: 0, warehouse: v.set_warehouse, ...(v.schedule_date ? { schedule_date: v.schedule_date } : {}) }),
  linkEffects: { item_code: itemEffect(doctype) },
  totals: (rows) => [
    { label: "Qty", value: fmt(rows.reduce((s, r) => s + asNumber(r.qty), 0)), align: "right" },
    ...(priced ? [{ label: "Amount", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.qty) * asNumber(r.rate), 0)), align: "right" as const }] : []),
  ],
});

const TAXES: ChildTableSpec = {
  tab: "Taxes & Totals",
  key: "taxes",
  label: "Purchase Taxes and Charges",
  description: "GST, withholding, freight… Amounts update as you edit; the server recalculates them on save.",
  doctype: "Purchase Taxes and Charges",
  wide: true,
  columns: [select("category", "Consider For", ["Total", "Valuation", "Valuation and Total"]), select("add_deduct_tax", "Add / Deduct", ["Add", "Deduct"]),
    req(select("charge_type", "Type", ["Actual", "On Net Total", "On Previous Row Amount", "On Previous Row Total", "On Item Quantity"])),
    req(link("account_head", "Account Head", "Account")), req(data("description", "Description")), float("rate", "Rate (%)"),
    currency("tax_amount", "Amount"), ro(currency("total", "Total"))],
  newRow: () => ({ category: "Total", add_deduct_tax: "Add", charge_type: "On Net Total", rate: 0 }),
  totals: (rows) => [{ label: "Taxes", value: fmtMoney(rows.reduce((s, r) => s + (r.add_deduct_tax === "Deduct" ? -1 : 1) * asNumber(r.tax_amount), 0)), align: "right" }],
};

/** Live line amounts, tax rows and totals; the server recomputes them on save. */
const computeBuying = (v: DocValues, rows: Record<string, DocValues[]>) => {
  const items: DocValues[] = (rows.items ?? []).map((r) => ({ ...r, amount: asNumber(r.qty) * asNumber(r.rate) }));
  const total = items.reduce((s, r) => s + asNumber(r.amount), 0);
  const totalQty = items.reduce((s, r) => s + asNumber(r.qty), 0);
  const discount = asNumber(v.discount_amount) || (total * asNumber(v.additional_discount_percentage)) / 100;
  const onNet = v.apply_discount_on === "Net Total";
  const netTotal = onNet ? total - discount : total;
  const tax = computeTaxRows(rows.taxes ?? [], netTotal, totalQty);
  return {
    rows: { items, taxes: tax.rows },
    values: { total_qty: totalQty, total, net_total: netTotal, total_taxes_and_charges: tax.taxes, grand_total: netTotal + tax.taxes - (onNet ? 0 : discount) },
  };
};

const totalsFields = () => [
  sec("Tax template"),
  link("taxes_and_charges", "Purchase Taxes Template", "Purchase Taxes and Charges Template"),
  link("tax_category", "Tax Category", "Tax Category"),
  colBreak(),
  select("apply_discount_on", "Apply Additional Discount On", ["", "Grand Total", "Net Total"]),
  float("additional_discount_percentage", "Additional Discount %"),
  currency("discount_amount", "Discount Amount"),
  sec("Totals"),
  ro(float("total_qty", "Total Quantity")),
  ro(currency("total", "Total")),
  ro(currency("net_total", "Net Total")),
  colBreak(),
  ro(currency("total_taxes_and_charges", "Total Taxes and Charges")),
  ro(currency("grand_total", "Grand Total")),
  ro(currency("rounded_total", "Rounded Total")),
  ro(data("in_words", "In Words")),
];

const supplierSection = (doctype: BuyingDocType, series: string[]) => [
  sec("Supplier"),
  req(select("naming_series", "Series", series)),
  req(link("supplier", "Supplier", "Supplier")),
  ro(data("supplier_name", "Supplier Name")),
  colBreak(),
  req(link("company", "Company", "Company")),
  ...(doctype === "Purchase Order" || doctype === "Supplier Quotation" ? [req(date("transaction_date", doctype === "Purchase Order" ? "Order Date" : "Date"))] : [req(date("posting_date", "Posting Date"))]),
];

const currencySection = () => [
  sec("Currency and price list"),
  req(link("currency", "Currency", "Currency")),
  req(float("conversion_rate", "Exchange Rate")),
  colBreak(),
  link("buying_price_list", "Price List", "Price List"),
];

const moreTab = () => [
  tab("More"),
  sec("Addresses"),
  link("supplier_address", "Supplier Address", "Address"),
  link("shipping_address", "Shipping Address", "Address"),
  colBreak(),
  link("contact_person", "Contact Person", "Contact"),
  sec("Accounting dimensions"),
  link("project", "Project", "Project"),
  colBreak(),
  link("cost_center", "Cost Center", "Cost Center"),
];

const linkEffects = (doctype: BuyingDocType): DocConfig["linkEffects"] => ({
  supplier: supplierEffect(doctype),
  taxes_and_charges: (t: string) => purchaseTaxes(t),
});

const insights = (doctype: BuyingDocType) => (c: ExtraContext) => (
  <InsightsPanel method="sugarcane.erp_insights.buying_insights.get_buying_insights" args={{ doctype, name: c.name }}
    cacheKey={!c.isNew && c.name ? `buying-insights:${doctype}:${c.name}:${c.values.modified ?? ""}` : null} currency={c.values.currency || "PKR"} />
);
const ledger = (doctype: BuyingDocType) => (c: ExtraContext) => <LedgerPanel doctype={doctype} name={c.name} docstatus={c.docstatus} />;

type Summary = { label: string; value: string | number; tone?: any };
const supplierSummary = (label: string, extra?: (v: DocValues) => Summary) => (v: DocValues): Summary[] => [
  { label: "Supplier", value: v.supplier_name || v.supplier || "—", tone: "sky" },
  { label, value: fmtMoney(v.grand_total), tone: "emerald" },
  extra ? extra(v) : { label: "Currency", value: `${v.currency || "PKR"}${asNumber(v.conversion_rate) && asNumber(v.conversion_rate) !== 1 ? ` @ ${fmt(v.conversion_rate, 4)}` : ""}`, tone: "indigo" },
];

/* ============================================================================ Material Request (purchase demand) */

export const MATERIAL_REQUEST_CONFIG: DocConfig = {
  doctype: "Material Request",
  base: "/import/material-requests",
  singular: "Purchase Demand",
  plural: "Purchase Demands",
  subtitle: "Department demands to purchase, transfer or issue stock",
  icon: ClipboardList,
  submittable: true,
  listFields: ["name", "title", "material_request_type", "transaction_date", "schedule_date", "per_ordered", "status", "docstatus", "modified"],
  columns: [nameCol("Demand", (r) => r.title), dateCol("transaction_date", "Date"), dateCol("schedule_date", "Required by"), numCol("per_ordered", "% Ordered", 1), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "title"],
  statusField: "status",
  statuses: ["Draft", "Pending", "Partially Ordered", "Ordered", "Issued", "Transferred", "Received", "Stopped", "Cancelled"],
  dateField: "transaction_date",
  sort: { key: "transaction_date", dir: "desc" },
  fields: [
    tab("Demand"),
    sec("Demand"),
    req(select("naming_series", "Series", ["PD-.YY.-.#####", "MAT-MR-.YYYY.-"])),
    req(select("material_request_type", "Purpose", ["Purchase", "Material Transfer", "Material Issue", "Manufacture", "Customer Provided"])),
    data("title", "Title"),
    colBreak(),
    req(link("company", "Company", "Company")),
    req(date("transaction_date", "Date")),
    req(date("schedule_date", "Required By")),
    sec("Warehouses"),
    link("set_warehouse", "Set Target Warehouse", "Warehouse"),
    colBreak(),
    when(link("set_from_warehouse", "Set Source Warehouse", "Warehouse"), (v) => v.material_request_type === "Material Transfer"),
    tab("Items"),
    tab("Terms"),
    sec("Terms"),
    link("tc_name", "Terms Template", "Terms and Conditions"),
    text("terms", "Terms and Conditions"),
  ],
  children: [itemsSpec("Material Request", "Material Request Item", [req(date("schedule_date", "Required By")), ro(float("ordered_qty", "Ordered"))], [], false)],
  tabIcons: { Demand: ClipboardList, Items: Boxes, Terms: FileSignature },
  tabPanels: { Demand: { before: insights("Material Request") } },
  defaults: ({ company }) => ({ company, naming_series: "PD-.YY.-.#####", material_request_type: "Purchase", transaction_date: todayISO(), schedule_date: todayISO() }),
  summary: (v) => [
    { label: "Purpose", value: v.material_request_type || "—", tone: "sky" },
    { label: "Required by", value: v.schedule_date || "—", tone: "amber" },
    { label: "Ordered", value: `${fmt(v.per_ordered, 0)}%`, tone: "emerald" },
  ],
  titleOf: (v) => (v.name ? `${v.name}${v.title ? ` · ${v.title}` : ""}` : "New Purchase Demand"),
};

/* ============================================================================ Request for Quotation (inquiry) */

export const RFQ_CONFIG: DocConfig = {
  doctype: "Request for Quotation",
  base: "/import/rfqs",
  singular: "Inquiry (RFQ)",
  plural: "Inquiries (RFQ)",
  subtitle: "One inquiry sent to several suppliers; their quotations go on the comparative statement",
  icon: Quote,
  submittable: true,
  listFields: ["name", "transaction_date", "schedule_date", "status", "docstatus", "modified"],
  columns: [nameCol("Inquiry"), dateCol("transaction_date", "Date"), dateCol("schedule_date", "Required by"), statusCol("status", "Status", "Draft")],
  searchFields: ["name"],
  statusField: "status",
  statuses: ["Draft", "Submitted", "Cancelled"],
  dateField: "transaction_date",
  sort: { key: "transaction_date", dir: "desc" },
  fields: [
    tab("Inquiry"),
    sec("Inquiry"),
    req(select("naming_series", "Series", ["INQ-.YY.-.#####", "PUR-RFQ-.YYYY.-"])),
    req(link("company", "Company", "Company")),
    colBreak(),
    req(date("transaction_date", "Date")),
    date("schedule_date", "Required By"),
    sec("Message to suppliers"),
    link("email_template", "Email Template", "Email Template"),
    text("message_for_supplier", "Message for Supplier"),
    tab("Suppliers"),
    tab("Items"),
    tab("Terms"),
    sec("Terms"),
    link("tc_name", "Terms Template", "Terms and Conditions"),
    text("terms", "Terms and Conditions"),
  ],
  children: [
    { tab: "Suppliers", key: "suppliers", label: "Suppliers", doctype: "Request for Quotation Supplier", minRows: 1,
      columns: [req(link("supplier", "Supplier", "Supplier")), ro(data("supplier_name", "Supplier Name")), data("email_id", "Email"), check("send_email", "Send Email"),
        ro(data("quote_status", "Quote Status"))],
      newRow: () => ({ send_email: 1 }) },
    itemsSpec("Request for Quotation", "Request for Quotation Item", [date("schedule_date", "Required By")], [], false),
  ],
  tabIcons: { Inquiry: Quote, Suppliers: Users, Items: Boxes, Terms: FileSignature },
  tabPanels: { Inquiry: { before: insights("Request for Quotation") } },
  defaults: ({ company }) => ({ company, naming_series: "INQ-.YY.-.#####", transaction_date: todayISO(),
    message_for_supplier: "Please send us your best rates and delivery time for the items below." }),
  summary: (v) => [
    { label: "Date", value: v.transaction_date || "—", tone: "sky" },
    { label: "Required by", value: v.schedule_date || "—", tone: "amber" },
    { label: "Status", value: v.status || "Draft", tone: "indigo" },
  ],
  titleOf: (v) => v.name || "New Inquiry",
};

/* ============================================================================ Supplier Quotation */

export const SUPPLIER_QUOTATION_CONFIG: DocConfig = {
  doctype: "Supplier Quotation",
  base: "/import/supplier-quotations",
  singular: "Supplier Quotation",
  plural: "Supplier Quotations",
  subtitle: "Rates quoted against an inquiry — compared on the comparative statement",
  icon: FileText,
  submittable: true,
  listFields: ["name", "supplier", "supplier_name", "transaction_date", "valid_till", "grand_total", "currency", "status", "docstatus", "modified"],
  columns: [nameCol("Quotation", (r) => r.supplier_name || r.supplier), dateCol("transaction_date", "Date"), dateCol("valid_till", "Valid till"), moneyCol("grand_total", "Total"), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "supplier", "supplier_name"],
  statusField: "status",
  statuses: ["Draft", "Submitted", "Ordered", "Stopped", "Expired", "Cancelled"],
  dateField: "transaction_date",
  sort: { key: "transaction_date", dir: "desc" },
  fields: [
    tab("Quotation"),
    ...supplierSection("Supplier Quotation", ["SQ-.YY.-.#####", "PUR-SQTN-.YYYY.-"]),
    date("valid_till", "Valid Till"),
    ...currencySection(),
    tab("Items"),
    tab("Taxes & Totals"),
    ...totalsFields(),
    tab("Terms"),
    ...termsFields(),
    ...moreTab(),
  ],
  children: [itemsSpec("Supplier Quotation", "Supplier Quotation Item", [ro(link("request_for_quotation", "RFQ", "Request for Quotation"))]), TAXES],
  linkEffects: linkEffects("Supplier Quotation"),
  compute: computeBuying,
  tabIcons: { Quotation: FileText, Items: Boxes, "Taxes & Totals": Coins, Terms: FileSignature, More: SlidersHorizontal },
  tabPanels: { Quotation: { before: insights("Supplier Quotation") } },
  defaults: ({ company }) => ({ company, naming_series: "SQ-.YY.-.#####", transaction_date: todayISO(), currency: "PKR", conversion_rate: 1 }),
  summary: supplierSummary("Quoted total"),
  titleOf: (v) => (v.name ? `${v.name}${v.supplier_name ? ` · ${v.supplier_name}` : ""}` : "New Supplier Quotation"),
};

/* ============================================================================ Purchase Order */

export const PURCHASE_ORDER_CONFIG: DocConfig = {
  doctype: "Purchase Order",
  base: "/import/purchase-orders",
  singular: "Purchase Order",
  plural: "Purchase Orders",
  subtitle: "Local and import orders to suppliers — items, rates, taxes, delivery and payment terms",
  icon: ShoppingCart,
  submittable: true,
  listFields: ["name", "supplier", "supplier_name", "transaction_date", "schedule_date", "grand_total", "currency", "per_received", "per_billed", "status", "docstatus", "modified"],
  columns: [nameCol("Order", (r) => r.supplier_name || r.supplier), dateCol("transaction_date", "Date"), dateCol("schedule_date", "Required by"), moneyCol("grand_total", "Total"),
    numCol("per_received", "% Received", 1), numCol("per_billed", "% Billed", 1), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "supplier", "supplier_name"],
  statusField: "status",
  statuses: ["Draft", "To Receive and Bill", "To Bill", "To Receive", "Completed", "On Hold", "Closed", "Cancelled"],
  dateField: "transaction_date",
  sort: { key: "transaction_date", dir: "desc" },
  fields: [
    tab("Order"),
    ...supplierSection("Purchase Order", ["PO-.YY.-.#####", "IPO-.YY.-.#####", "PUR-ORD-.YYYY.-"]),
    req(date("schedule_date", "Required By")),
    sec("Receiving"),
    link("set_warehouse", "Set Target Warehouse", "Warehouse"),
    colBreak(),
    check("is_subcontracted", "Is Subcontracted"),
    ...currencySection(),
    tab("Items"),
    tab("Taxes & Totals"),
    ...totalsFields(),
    tab("Terms"),
    ...termsFields(),
    tab("Ledger"),
    ...moreTab(),
  ],
  children: [itemsSpec("Purchase Order", "Purchase Order Item", [req(date("schedule_date", "Required By")), ro(float("received_qty", "Received")),
    ro(link("material_request", "Demand", "Material Request"))]), TAXES, PAYMENT_SCHEDULE],
  linkEffects: linkEffects("Purchase Order"),
  compute: computeBuying,
  tabIcons: { Order: ShoppingCart, Items: Boxes, "Taxes & Totals": Coins, Terms: FileSignature, Ledger: BookOpen, More: SlidersHorizontal },
  tabPanels: { Order: { before: insights("Purchase Order") }, Ledger: { before: ledger("Purchase Order") } },
  defaults: ({ company }) => ({ company, naming_series: "PO-.YY.-.#####", transaction_date: todayISO(), schedule_date: todayISO(), currency: "PKR", conversion_rate: 1 }),
  summary: supplierSummary("Grand total", (v) => ({ label: "Received", value: `${fmt(v.per_received, 0)}%`, tone: asNumber(v.per_received) >= 100 ? "emerald" : "amber" })),
  titleOf: (v) => (v.name ? `${v.name}${v.supplier_name ? ` · ${v.supplier_name}` : ""}` : "New Purchase Order"),
};

/* ============================================================================ Purchase Receipt (GRN) */

export const PURCHASE_RECEIPT_CONFIG: DocConfig = {
  doctype: "Purchase Receipt",
  base: "/purchase/receipts",
  singular: "Goods Receipt (GRN)",
  plural: "Goods Receipts (GRN)",
  subtitle: "Goods received from suppliers into the stores — accepted, rejected, quality inspection",
  icon: Package,
  submittable: true,
  listFields: ["name", "supplier", "supplier_name", "posting_date", "grand_total", "total_qty", "per_billed", "is_return", "status", "docstatus", "modified"],
  columns: [nameCol("Receipt", (r) => r.supplier_name || r.supplier), dateCol("posting_date", "Date"), numCol("total_qty", "Qty", 0), moneyCol("grand_total", "Total"),
    numCol("per_billed", "% Billed", 1), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "supplier", "supplier_name", "supplier_delivery_note", "lr_no"],
  statusField: "status",
  statuses: ["Draft", "To Bill", "Completed", "Return", "Return Issued", "Closed", "Cancelled"],
  dateField: "posting_date",
  sort: { key: "posting_date", dir: "desc" },
  fields: [
    tab("Receipt"),
    ...supplierSection("Purchase Receipt", ["GRN-.YY.-.#####", "MAT-PRE-.YYYY.-", "MAT-PR-RET-.YYYY.-"]),
    data("supplier_delivery_note", "Supplier Delivery Note"),
    check("is_return", "Is Return"),
    when(link("return_against", "Return Against", "Purchase Receipt"), (v) => Boolean(v.is_return)),
    sec("Stores"),
    link("set_warehouse", "Accepted Warehouse", "Warehouse"),
    colBreak(),
    link("rejected_warehouse", "Rejected Warehouse", "Warehouse"),
    ...currencySection(),
    tab("Items"),
    tab("Taxes & Totals"),
    ...totalsFields(),
    tab("Transport"),
    sec("Transporter"),
    data("transporter_name", "Transporter Name"),
    data("lr_no", "Vehicle / LR No"),
    colBreak(),
    date("lr_date", "LR Date"),
    tab("Ledger"),
    ...moreTab(),
  ],
  children: [itemsSpec("Purchase Receipt", "Purchase Receipt Item",
    [float("received_qty", "Received"), float("rejected_qty", "Rejected"), ro(link("purchase_order", "PO", "Purchase Order"))],
    [link("rejected_warehouse", "Rejected Warehouse", "Warehouse"), link("quality_inspection", "Quality Inspection", "Quality Inspection"), link("batch_no", "Batch", "Batch")]), TAXES],
  linkEffects: linkEffects("Purchase Receipt"),
  compute: computeBuying,
  tabIcons: { Receipt: Package, Items: Boxes, "Taxes & Totals": Coins, Transport: Truck, Ledger: BookOpen, More: SlidersHorizontal },
  tabPanels: { Receipt: { before: insights("Purchase Receipt") }, Ledger: { before: ledger("Purchase Receipt") } },
  defaults: ({ company }) => ({ company, naming_series: "GRN-.YY.-.#####", posting_date: todayISO(), currency: "PKR", conversion_rate: 1 }),
  summary: supplierSummary("Received value", (v) => ({ label: "Billed", value: `${fmt(v.per_billed, 0)}%`, tone: asNumber(v.per_billed) >= 100 ? "emerald" : "amber" })),
  titleOf: (v) => (v.name ? `${v.name}${v.supplier_name ? ` · ${v.supplier_name}` : ""}` : "New Goods Receipt"),
};

/* ============================================================================ Purchase Invoice */

export const PURCHASE_INVOICE_CONFIG: DocConfig = {
  doctype: "Purchase Invoice",
  base: "/purchase/invoices",
  singular: "Purchase Invoice",
  plural: "Purchase Invoices",
  subtitle: "Supplier bills — expense or stock, input tax, withholding and payment",
  icon: Receipt,
  submittable: true,
  listFields: ["name", "supplier", "supplier_name", "posting_date", "due_date", "grand_total", "outstanding_amount", "is_return", "status", "docstatus", "modified"],
  columns: [nameCol("Invoice", (r) => r.supplier_name || r.supplier), dateCol("posting_date", "Date"), dateCol("due_date", "Due"), moneyCol("grand_total", "Total"),
    moneyCol("outstanding_amount", "Outstanding"), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "supplier", "supplier_name", "bill_no"],
  statusField: "status",
  statuses: ["Draft", "Unpaid", "Partly Paid", "Overdue", "Paid", "Return", "Debit Note Issued", "Cancelled"],
  dateField: "posting_date",
  sort: { key: "posting_date", dir: "desc" },
  fields: [
    tab("Invoice"),
    ...supplierSection("Purchase Invoice", ["PI-.YY.-.#####", "IPI-.YY.-.#####", "SPI-.YY.-.#####", "ACC-PINV-.YYYY.-", "ACC-PINV-RET-.YYYY.-"]),
    date("due_date", "Payment Due Date"),
    sec("Supplier's bill"),
    data("bill_no", "Supplier Invoice No"),
    colBreak(),
    date("bill_date", "Supplier Invoice Date"),
    check("is_return", "Is Return (Debit Note)"),
    when(link("return_against", "Return Against", "Purchase Invoice"), (v) => Boolean(v.is_return)),
    sec("Stock"),
    check("update_stock", "Update Stock (receive on this invoice)"),
    colBreak(),
    when(link("set_warehouse", "Accepted Warehouse", "Warehouse"), (v) => Boolean(v.update_stock)),
    ...currencySection(),
    tab("Items"),
    tab("Taxes & Totals"),
    ...totalsFields(),
    sec("Withholding tax"),
    check("apply_tds", "Apply Tax Withholding"),
    colBreak(),
    when(link("tax_withholding_category", "Withholding Category", "Tax Withholding Category"), (v) => Boolean(v.apply_tds)),
    tab("Payments"),
    sec("Payment"),
    ro(currency("outstanding_amount", "Outstanding Amount")),
    ro(currency("total_advance", "Total Advance")),
    colBreak(),
    currency("write_off_amount", "Write Off Amount"),
    tab("Terms"),
    ...termsFields(),
    tab("Accounting"),
    sec("Accounting"),
    req(link("credit_to", "Credit To (Payable)", "Account")),
    link("cost_center", "Cost Center", "Cost Center"),
    colBreak(),
    link("project", "Project", "Project"),
    select("is_opening", "Is Opening Entry", ["No", "Yes"]),
    sec("Remarks"),
    text("remarks", "Remarks"),
    tab("Ledger"),
    tab("More"),
    sec("Addresses"),
    link("supplier_address", "Supplier Address", "Address"),
    colBreak(),
    link("contact_person", "Contact Person", "Contact"),
  ],
  children: [
    itemsSpec("Purchase Invoice", "Purchase Invoice Item", [ro(link("purchase_order", "PO", "Purchase Order")), ro(link("purchase_receipt", "GRN", "Purchase Receipt"))]),
    TAXES,
    { ...PAYMENT_SCHEDULE, tab: "Payments" },
  ],
  linkEffects: linkEffects("Purchase Invoice"),
  compute: computeBuying,
  tabIcons: { Invoice: Receipt, Items: Boxes, "Taxes & Totals": Coins, Payments: Landmark, Terms: FileSignature, Accounting: Landmark, Ledger: BookOpen, More: SlidersHorizontal },
  tabPanels: { Invoice: { before: insights("Purchase Invoice") }, Ledger: { before: ledger("Purchase Invoice") } },
  defaults: ({ company }) => ({ company, naming_series: "PI-.YY.-.#####", posting_date: todayISO(), currency: "PKR", conversion_rate: 1 }),
  summary: (v) => [
    { label: "Supplier", value: v.supplier_name || v.supplier || "—", tone: "sky" },
    { label: "Grand total", value: fmtMoney(v.grand_total), tone: "emerald" },
    { label: "Outstanding", value: fmtMoney(v.outstanding_amount), tone: asNumber(v.outstanding_amount) > 0 ? "rose" : "emerald" },
  ],
  titleOf: (v) => (v.name ? `${v.name}${v.supplier_name ? ` · ${v.supplier_name}` : ""}` : "New Purchase Invoice"),
};
