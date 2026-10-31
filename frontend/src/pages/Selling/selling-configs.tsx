import { BookOpen, Boxes, ClipboardList, Coins, FileSignature, FileText, Handshake, Landmark, Receipt, Ship, SlidersHorizontal, Truck } from "lucide-react";
import type { ChildTableSpec, DocConfig, DocValues, ExtraContext } from "@/components/doc/doc-config";
import {
  sec, colBreak, tab, data, date, float, currency, check, text, richText, link, select, ro, req, when,
  nameCol, dateCol, moneyCol, statusCol, numCol, fmt, fmtMoney,
} from "@/components/doc/doc-helpers";
import { InsightsPanel } from "@/components/doc/insights-panel";
import { LedgerPanel } from "@/components/doc/ledger-panel";
import { postCall } from "@/services/frappe";
import { todayISO } from "@/utils/dates";
import { asNumber } from "@/utils/cn";

export type SellingDocType = "Sales Order" | "Delivery Note" | "Sales Invoice" | "Quotation" | "Blanket Order";
type DocType = SellingDocType;
export const INCOTERMS = ["", "EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const dateOf = (v: DocValues) => v.transaction_date || v.posting_date || todayISO();

/* ---------------------------------------------------------------- shared behaviour */

/** Customer → currency, price list, taxes, terms, addresses (erpnext.accounts.party.get_party_details). */
export const customerEffect = (doctype: DocType) => async (customer: string, v: DocValues) => {
  if (!customer || !v.company) return;
  const d = await postCall<DocValues>("erpnext.accounts.party.get_party_details", {
    party: customer, party_type: doctype === "Quotation" ? v.quotation_to || "Customer" : "Customer", company: v.company, doctype, posting_date: dateOf(v),
  }).catch(() => ({}) as DocValues);
  const keep = ["customer_name", "currency", "selling_price_list", "price_list_currency", "taxes_and_charges", "payment_terms_template", "territory", "customer_group",
    "customer_address", "shipping_address_name", "contact_person", "tax_category", "tax_id", ...(doctype === "Sales Invoice" ? ["debit_to"] : [])];
  const patch: DocValues = Object.fromEntries(keep.filter((k) => d[k] != null && d[k] !== "").map((k) => [k, d[k]]));
  if (patch.currency && patch.currency !== v.currency) patch.conversion_rate = patch.currency === "PKR" ? 1 : v.conversion_rate ?? 1;
  if (d.taxes_and_charges) Object.assign(patch, await taxesFromTemplate(String(d.taxes_and_charges)));
  return patch;
};

/** Sales tax template → its rows (the desk's taxes_and_charges trigger). */
export async function taxesFromTemplate(template: string) {
  if (!template) return {};
  const rows = await postCall<DocValues[]>("erpnext.controllers.accounts_controller.get_taxes_and_charges", {
    master_doctype: "Sales Taxes and Charges Template", master_name: template,
  }).catch(() => []);
  return { taxes: rows ?? [] };
}

/** Item → name, UOM, price-list rate, warehouse, accounts (erpnext.stock.get_item_details). */
const itemEffect = (doctype: DocType) => async (code: string, row: DocValues, v: DocValues) => {
  if (!code) return;
  const d = await postCall<DocValues>("erpnext.stock.get_item_details.get_item_details", {
    ctx: JSON.stringify({
      item_code: code, company: v.company, customer: v.customer || (v.quotation_to === "Customer" ? v.party_name : undefined), currency: v.currency || "PKR", conversion_rate: v.conversion_rate || 1,
      price_list: v.selling_price_list, price_list_currency: v.price_list_currency || v.currency, plc_conversion_rate: v.plc_conversion_rate || 1,
      doctype, transaction_date: dateOf(v), posting_date: dateOf(v), qty: row.qty || 1, warehouse: row.warehouse || v.set_warehouse,
    }),
  }).catch(() => ({}) as DocValues);
  const rate = asNumber(d.rate) || asNumber(d.price_list_rate);
  const qty = asNumber(row.qty) || 1;
  return {
    item_name: d.item_name ?? code, description: d.description, uom: d.uom, stock_uom: d.stock_uom, conversion_factor: d.conversion_factor ?? 1,
    price_list_rate: d.price_list_rate, rate, qty, amount: rate * qty, warehouse: row.warehouse || d.warehouse,
    income_account: d.income_account, expense_account: d.expense_account, cost_center: d.cost_center, item_tax_template: d.item_tax_template,
  };
};

export const itemsSpec = (doctype: DocType, childDoctype: string, extraCols: ChildTableSpec["columns"] = [], extraDialog: ChildTableSpec["dialogColumns"] = []): ChildTableSpec => ({
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
    currency("rate", "Rate"),
    ro(currency("amount", "Amount")),
    ...extraCols,
    link("warehouse", "Warehouse", "Warehouse"),
  ],
  dialogColumns: [ro(currency("price_list_rate", "Price List Rate")), float("discount_percentage", "Discount %"), text("description", "Description"),
    link("item_tax_template", "Item Tax Template", "Item Tax Template"), ...extraDialog],
  newRow: (v) => ({ qty: 1, rate: 0, amount: 0, warehouse: v.set_warehouse, ...(doctype === "Sales Order" ? { delivery_date: v.delivery_date } : {}) }),
  linkEffects: { item_code: itemEffect(doctype) },
  totals: (rows) => [
    { label: "Qty", value: fmt(rows.reduce((s, r) => s + asNumber(r.qty), 0)), align: "right" },
    { label: "Amount", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.qty) * asNumber(r.rate), 0)), align: "right" },
  ],
});

export const TAXES: ChildTableSpec = {
  tab: "Taxes & Totals",
  key: "taxes",
  label: "Sales Taxes and Charges",
  description: "GST, further tax, freight… Amounts update as you edit; the server recalculates them on save.",
  doctype: "Sales Taxes and Charges",
  wide: true,
  columns: [req(select("charge_type", "Type", ["Actual", "On Net Total", "On Previous Row Amount", "On Previous Row Total", "On Item Quantity"])),
    req(link("account_head", "Account Head", "Account")), req(data("description", "Description")), float("rate", "Rate (%)"),
    currency("tax_amount", "Amount"), ro(currency("total", "Total"))],
  newRow: () => ({ charge_type: "On Net Total", rate: 0 }),
  totals: (rows) => [{ label: "Taxes", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.tax_amount), 0)), align: "right" }],
};

export const PAYMENT_SCHEDULE: ChildTableSpec = {
  tab: "Terms",
  key: "payment_schedule",
  label: "Payment Schedule",
  doctype: "Payment Schedule",
  columns: [link("payment_term", "Payment Term", "Payment Term"), req(date("due_date", "Due Date")), float("invoice_portion", "Portion (%)"), currency("payment_amount", "Amount"), ro(currency("outstanding", "Outstanding"))],
  totals: (rows) => [{ label: "Scheduled", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.payment_amount), 0)), align: "right" }],
};

/**
 * Tax rows computed as ERPNext does (erpnext/public/js/controllers/taxes_and_totals.js), so a template's rows
 * show their amounts as soon as it's picked. Rows are applied in order; "On Previous Row …" uses row_id (the
 * 1-based row it refers to); "Deduct" rows subtract. The server recomputes everything on save.
 */
export function computeTaxRows(taxRows: DocValues[], base: number, totalQty: number) {
  const amounts: number[] = [];
  const totals: number[] = [];
  const rows = taxRows.map((r, i) => {
    const rate = asNumber(r.rate);
    const ref = Math.max(0, Math.min(i, asNumber(r.row_id) || i)) - 1; // previous row index (row_id is 1-based)
    let amt: number;
    switch (r.charge_type) {
      case "On Net Total": amt = (base * rate) / 100; break;
      case "On Previous Row Amount": amt = ref >= 0 ? (amounts[ref] * rate) / 100 : 0; break;
      case "On Previous Row Total": amt = ref >= 0 ? (totals[ref] * rate) / 100 : 0; break;
      case "On Item Quantity": amt = totalQty * rate; break;
      default: amt = asNumber(r.tax_amount); // Actual: the amount as entered
    }
    amt = Math.round(amt * 100) / 100;
    const signed = r.add_deduct_tax === "Deduct" ? -amt : amt;
    amounts.push(amt);
    totals.push((i ? totals[i - 1] : base) + signed);
    return { ...r, tax_amount: amt, total: totals[i] };
  });
  return { rows, taxes: totals.length ? totals[totals.length - 1] - base : 0 };
}

/** Live line amounts, tax rows and totals; the server recomputes them on save. */
export const computeSelling = (v: DocValues, rows: Record<string, DocValues[]>) => {
  const items: DocValues[] = (rows.items ?? []).map((r) => ({ ...r, amount: asNumber(r.qty) * asNumber(r.rate) }));
  const total = items.reduce((s, r) => s + asNumber(r.amount), 0);
  const totalQty = items.reduce((s, r) => s + asNumber(r.qty), 0);
  const discount = asNumber(v.discount_amount) || (total * asNumber(v.additional_discount_percentage)) / 100;
  // ERPNext applies the additional discount either before tax ("Net Total") or after it ("Grand Total", the default).
  const onNet = v.apply_discount_on === "Net Total";
  const netTotal = onNet ? total - discount : total;
  const tax = computeTaxRows(rows.taxes ?? [], netTotal, totalQty);
  return {
    rows: { items, taxes: tax.rows },
    values: {
      total_qty: totalQty, total, net_total: netTotal, total_taxes_and_charges: tax.taxes,
      grand_total: netTotal + tax.taxes - (onNet ? 0 : discount),
    },
  };
};

export const totalsFields = () => [
  sec("Tax template"),
  link("taxes_and_charges", "Sales Taxes Template", "Sales Taxes and Charges Template"),
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

export const termsFields = () => [
  sec("Payment terms"),
  link("payment_terms_template", "Payment Terms Template", "Payment Terms Template"),
  colBreak(),
  link("tc_name", "Terms Template", "Terms and Conditions"),
  sec("Terms and conditions"),
  richText("terms", "Terms and Conditions"),
];

const commonLinkEffects = (doctype: DocType): DocConfig["linkEffects"] => ({
  customer: customerEffect(doctype),
  taxes_and_charges: (t: string) => taxesFromTemplate(t),
});

const insights = (doctype: DocType) => (c: ExtraContext) => (
  <InsightsPanel method="sugarcane.erp_insights.selling_insights.get_selling_insights" args={{ doctype, name: c.name }}
    cacheKey={!c.isNew && c.name ? `selling-insights:${doctype}:${c.name}:${c.values.modified ?? ""}` : null} currency={c.values.currency || "PKR"} />
);
const ledger = (doctype: DocType) => (c: ExtraContext) => <LedgerPanel doctype={doctype} name={c.name} docstatus={c.docstatus} />;

const summary = (label: string) => (v: DocValues): { label: string; value: string | number; tone?: any }[] => [
  { label: "Customer", value: v.customer_name || v.customer || "—", tone: "sky" },
  { label: label, value: fmtMoney(v.grand_total), tone: "emerald" },
  { label: "Currency", value: `${v.currency || "PKR"}${asNumber(v.conversion_rate) && asNumber(v.conversion_rate) !== 1 ? ` @ ${fmt(v.conversion_rate, 4)}` : ""}`, tone: "indigo" },
];

/* ============================================================================ Sales Order */

export const SALES_ORDER_CONFIG: DocConfig = {
  doctype: "Sales Order",
  base: "/selling/sales-orders",
  singular: "Sales Order",
  plural: "Sales Orders",
  subtitle: "Confirmed customer orders — yarn, quantities, prices, delivery and export terms",
  icon: Handshake,
  submittable: true,
  listFields: ["name", "customer", "customer_name", "transaction_date", "delivery_date", "grand_total", "currency", "per_delivered", "per_billed", "status", "docstatus", "modified"],
  columns: [nameCol("Order", (r) => r.customer_name || r.customer), dateCol("transaction_date", "Date"), dateCol("delivery_date", "Delivery"), moneyCol("grand_total", "Total"),
    numCol("per_delivered", "% Delivered", 1), numCol("per_billed", "% Billed", 1), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "customer", "customer_name", "po_no"],
  statusField: "status",
  statuses: ["Draft", "To Deliver and Bill", "To Bill", "To Deliver", "Completed", "On Hold", "Closed", "Cancelled"],
  dateField: "transaction_date",
  sort: { key: "transaction_date", dir: "desc" },
  fields: [
    tab("Order"),
    sec("Customer"),
    req(select("naming_series", "Series", ["SAL-ORD-.YYYY.-"])),
    req(link("customer", "Customer", "Customer")),
    ro(data("customer_name", "Customer Name")),
    data("po_no", "Customer's PO No"),
    colBreak(),
    req(link("company", "Company", "Company")),
    req(date("transaction_date", "Order Date")),
    req(date("delivery_date", "Delivery Date")),
    select("order_type", "Order Type", ["Sales", "Maintenance", "Shopping Cart"]),
    sec("Currency and price list"),
    req(link("currency", "Currency", "Currency")),
    req(float("conversion_rate", "Exchange Rate")),
    colBreak(),
    link("selling_price_list", "Price List", "Price List"),
    link("set_warehouse", "Source Warehouse", "Warehouse"),
    tab("Items"),
    tab("Taxes & Totals"),
    ...totalsFields(),
    tab("Export & LC"),
    sec("Buyer"),
    data("buyer_po_no", "Buyer PO No"),
    select("export_status", "Export Status", ["", "Planned", "In Production", "Ready to Ship", "Shipped", "Closed"]),
    colBreak(),
    link("lc_proforma", "LC Proforma", "LC Proforma"),
    sec("Letter of credit"),
    data("lc_no", "LC No"),
    date("lc_date", "LC Date"),
    currency("lc_amount", "LC Amount"),
    link("lc_currency", "LC Currency", "Currency"),
    colBreak(),
    data("lc_issuing_bank", "Issuing Bank"),
    data("lc_advising_bank", "Advising Bank"),
    date("lc_expiry_date", "LC Expiry Date"),
    sec("Shipment"),
    date("latest_shipment_date", "Latest Shipment Date"),
    data("port_of_loading", "Port of Loading"),
    data("port_of_discharge", "Port of Discharge"),
    data("final_destination", "Final Destination"),
    colBreak(),
    select("incoterm", "Incoterm", INCOTERMS),
    select("shipment_mode", "Shipment Mode", ["", "Sea", "Air", "Road", "Rail", "Multimodal"]),
    link("country_of_destination", "Country of Destination", "Country"),
    tab("Terms"),
    ...termsFields(),
    tab("Ledger"),
    tab("More"),
    sec("Addresses"),
    link("customer_address", "Customer Address", "Address"),
    link("shipping_address_name", "Shipping Address", "Address"),
    colBreak(),
    link("contact_person", "Contact Person", "Contact"),
    sec("Sales"),
    link("territory", "Territory", "Territory"),
    link("sales_partner", "Sales Partner", "Sales Partner"),
    colBreak(),
    link("project", "Project", "Project"),
    link("cost_center", "Cost Center", "Cost Center"),
  ],
  children: [itemsSpec("Sales Order", "Sales Order Item", [req(date("delivery_date", "Delivery Date")), ro(float("delivered_qty", "Delivered"))]), TAXES, PAYMENT_SCHEDULE],
  linkEffects: commonLinkEffects("Sales Order"),
  compute: computeSelling,
  tabIcons: { Order: ClipboardList, Items: Boxes, "Taxes & Totals": Coins, "Export & LC": Ship, Terms: FileSignature, Ledger: BookOpen, More: SlidersHorizontal },
  tabPanels: { Order: { before: insights("Sales Order") }, Ledger: { before: ledger("Sales Order") } },
  defaults: ({ company }) => ({ company, naming_series: "SAL-ORD-.YYYY.-", transaction_date: todayISO(), delivery_date: todayISO(), currency: "PKR", conversion_rate: 1, order_type: "Sales" }),
  summary: summary("Grand total"),
  titleOf: (v) => (v.name ? `${v.name}${v.customer_name ? ` · ${v.customer_name}` : ""}` : "New Sales Order"),
};

/* ============================================================================ Delivery Note */

export const DELIVERY_NOTE_CONFIG: DocConfig = {
  doctype: "Delivery Note",
  base: "/selling/delivery-notes",
  singular: "Delivery Note",
  plural: "Delivery Notes",
  subtitle: "Yarn dispatched to the customer — stock out, transport and billing status",
  icon: Truck,
  submittable: true,
  listFields: ["name", "customer", "customer_name", "posting_date", "grand_total", "total_qty", "per_billed", "is_return", "status", "docstatus", "modified"],
  columns: [nameCol("Delivery", (r) => r.customer_name || r.customer), dateCol("posting_date", "Date"), numCol("total_qty", "Qty", 0), moneyCol("grand_total", "Total"),
    numCol("per_billed", "% Billed", 1), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "customer", "customer_name", "lr_no", "vehicle_no"],
  statusField: "status",
  statuses: ["Draft", "To Bill", "Completed", "Return", "Return Issued", "Closed", "Cancelled"],
  dateField: "posting_date",
  sort: { key: "posting_date", dir: "desc" },
  fields: [
    tab("Delivery"),
    sec("Customer"),
    req(select("naming_series", "Series", ["MAT-DN-.YYYY.-", "MAT-DN-RET-.YYYY.-"])),
    req(link("customer", "Customer", "Customer")),
    ro(data("customer_name", "Customer Name")),
    data("po_no", "Customer's PO No"),
    colBreak(),
    req(link("company", "Company", "Company")),
    req(date("posting_date", "Posting Date")),
    data("posting_time", "Posting Time"),
    check("set_posting_time", "Edit Posting Date and Time"),
    sec("Stock"),
    link("set_warehouse", "Source Warehouse", "Warehouse"),
    check("is_return", "Is Return"),
    colBreak(),
    when(link("return_against", "Return Against", "Delivery Note"), (v) => Boolean(v.is_return)),
    sec("Currency and price list"),
    req(link("currency", "Currency", "Currency")),
    req(float("conversion_rate", "Exchange Rate")),
    colBreak(),
    link("selling_price_list", "Price List", "Price List"),
    tab("Items"),
    tab("Taxes & Totals"),
    ...totalsFields(),
    tab("Transport"),
    sec("Transporter"),
    link("transporter", "Transporter", "Supplier"),
    data("transporter_name", "Transporter Name"),
    data("driver_name", "Driver Name"),
    colBreak(),
    data("vehicle_no", "Vehicle No"),
    data("lr_no", "LR / Bilty No"),
    date("lr_date", "LR Date"),
    link("driver", "Driver", "Driver"),
    tab("Ledger"),
    tab("More"),
    sec("Addresses"),
    link("customer_address", "Customer Address", "Address"),
    link("shipping_address_name", "Shipping Address", "Address"),
    colBreak(),
    link("contact_person", "Contact Person", "Contact"),
    sec("Accounting"),
    link("project", "Project", "Project"),
    colBreak(),
    link("cost_center", "Cost Center", "Cost Center"),
    sec("Terms"),
    link("tc_name", "Terms Template", "Terms and Conditions"),
    richText("terms", "Terms and Conditions"),
  ],
  children: [itemsSpec("Delivery Note", "Delivery Note Item", [ro(link("against_sales_order", "Sales Order", "Sales Order"))], [link("batch_no", "Batch", "Batch"), link("quality_inspection", "Quality Inspection", "Quality Inspection")]), TAXES],
  linkEffects: commonLinkEffects("Delivery Note"),
  compute: computeSelling,
  tabIcons: { Delivery: Truck, Items: Boxes, "Taxes & Totals": Coins, Transport: Ship, Ledger: BookOpen, More: SlidersHorizontal },
  tabPanels: { Delivery: { before: insights("Delivery Note") }, Ledger: { before: ledger("Delivery Note") } },
  defaults: ({ company }) => ({ company, naming_series: "MAT-DN-.YYYY.-", posting_date: todayISO(), currency: "PKR", conversion_rate: 1 }),
  summary: summary("Grand total"),
  titleOf: (v) => (v.name ? `${v.name}${v.customer_name ? ` · ${v.customer_name}` : ""}` : "New Delivery Note"),
};

/* ============================================================================ Sales Invoice */

export const SALES_INVOICE_CONFIG: DocConfig = {
  doctype: "Sales Invoice",
  base: "/selling/sales-invoices",
  singular: "Sales Invoice",
  plural: "Sales Invoices",
  subtitle: "Customer bills — revenue, receivable, taxes and collection",
  icon: Receipt,
  submittable: true,
  listFields: ["name", "customer", "customer_name", "posting_date", "due_date", "grand_total", "outstanding_amount", "is_return", "status", "docstatus", "modified"],
  columns: [nameCol("Invoice", (r) => r.customer_name || r.customer), dateCol("posting_date", "Date"), dateCol("due_date", "Due"), moneyCol("grand_total", "Total"),
    moneyCol("outstanding_amount", "Outstanding"), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "customer", "customer_name", "po_no"],
  statusField: "status",
  statuses: ["Draft", "Unpaid", "Partly Paid", "Overdue", "Paid", "Return", "Credit Note Issued", "Cancelled"],
  dateField: "posting_date",
  sort: { key: "posting_date", dir: "desc" },
  fields: [
    tab("Invoice"),
    sec("Customer"),
    req(select("naming_series", "Series", ["ACC-SINV-.YYYY.-", "ACC-SINV-RET-.YYYY.-"])),
    req(link("customer", "Customer", "Customer")),
    ro(data("customer_name", "Customer Name")),
    data("po_no", "Customer's PO No"),
    colBreak(),
    req(link("company", "Company", "Company")),
    req(date("posting_date", "Posting Date")),
    date("due_date", "Payment Due Date"),
    check("is_return", "Is Return (Credit Note)"),
    when(link("return_against", "Return Against", "Sales Invoice"), (v) => Boolean(v.is_return)),
    sec("Stock"),
    check("update_stock", "Update Stock (deliver on this invoice)"),
    colBreak(),
    when(link("set_warehouse", "Source Warehouse", "Warehouse"), (v) => Boolean(v.update_stock)),
    sec("Currency and price list"),
    req(link("currency", "Currency", "Currency")),
    req(float("conversion_rate", "Exchange Rate")),
    colBreak(),
    link("selling_price_list", "Price List", "Price List"),
    tab("Items"),
    tab("Taxes & Totals"),
    ...totalsFields(),
    tab("Payments"),
    sec("Collection"),
    ro(currency("outstanding_amount", "Outstanding Amount")),
    ro(currency("total_advance", "Total Advance")),
    colBreak(),
    ro(currency("paid_amount", "Paid Amount")),
    currency("write_off_amount", "Write Off Amount"),
    tab("Terms"),
    ...termsFields(),
    tab("Accounting"),
    sec("Accounting"),
    req(link("debit_to", "Debit To (Receivable)", "Account")),
    link("cost_center", "Cost Center", "Cost Center"),
    colBreak(),
    link("project", "Project", "Project"),
    select("is_opening", "Is Opening Entry", ["No", "Yes"]),
    sec("Remarks"),
    text("remarks", "Remarks"),
    tab("Ledger"),
    tab("More"),
    sec("Addresses"),
    link("customer_address", "Customer Address", "Address"),
    link("shipping_address_name", "Shipping Address", "Address"),
    colBreak(),
    link("contact_person", "Contact Person", "Contact"),
    link("territory", "Territory", "Territory"),
    link("sales_partner", "Sales Partner", "Sales Partner"),
  ],
  children: [
    itemsSpec("Sales Invoice", "Sales Invoice Item", [ro(link("sales_order", "Sales Order", "Sales Order")), ro(link("delivery_note", "Delivery Note", "Delivery Note"))],
      [link("income_account", "Income Account", "Account"), link("cost_center", "Cost Center", "Cost Center")]),
    TAXES,
    { ...PAYMENT_SCHEDULE, tab: "Payments" },
  ],
  linkEffects: commonLinkEffects("Sales Invoice"),
  compute: computeSelling,
  tabIcons: { Invoice: FileText, Items: Boxes, "Taxes & Totals": Coins, Payments: Landmark, Terms: FileSignature, Accounting: Landmark, Ledger: BookOpen, More: SlidersHorizontal },
  tabPanels: { Invoice: { before: insights("Sales Invoice") }, Ledger: { before: ledger("Sales Invoice") } },
  defaults: ({ company }) => ({ company, naming_series: "ACC-SINV-.YYYY.-", posting_date: todayISO(), currency: "PKR", conversion_rate: 1 }),
  summary: (v) => [
    { label: "Customer", value: v.customer_name || v.customer || "—", tone: "sky" },
    { label: "Grand total", value: fmtMoney(v.grand_total), tone: "emerald" },
    { label: "Outstanding", value: fmtMoney(v.outstanding_amount), tone: asNumber(v.outstanding_amount) > 0 ? "rose" : "emerald" },
  ],
  titleOf: (v) => (v.name ? `${v.name}${v.customer_name ? ` · ${v.customer_name}` : ""}` : "New Sales Invoice"),
};

