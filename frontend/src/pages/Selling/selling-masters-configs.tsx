import { BadgePercent, CalendarClock, ClipboardList, Coins, FileSignature, FileSpreadsheet, Gift, Globe2, Handshake, MapIcon, PackagePlus, Percent, Receipt, SlidersHorizontal, Tag, Target, Timer, UserRound, Users } from "lucide-react";
import type { ChildTableSpec, DocConfig, DocValues, ExtraContext } from "@/components/doc/doc-config";
import {
  sec, colBreak, tab, data, date, float, currency, check, text, richText, link, select, ro, req, when,
  nameCol, textCol, dateCol, moneyCol, statusCol, numCol, yesNoCol, fmt, fmtMoney,
} from "@/components/doc/doc-helpers";
import { todayISO } from "@/utils/dates";
import { asNumber } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";
import { Tile } from "@/pages/Production/plan-panels";
import { PAYMENT_SCHEDULE, TAXES, computeSelling, customerEffect, itemsSpec, taxesFromTemplate, termsFields, totalsFields } from "./selling-configs";
import { isoDaysAgo } from "@/hooks/useUrlFlag";

const TARGETS = (tabLabel: string): ChildTableSpec => ({
  tab: tabLabel,
  key: "targets",
  label: "Targets",
  description: "Quantity / amount targets per item group and fiscal year.",
  doctype: "Target Detail",
  columns: [link("item_group", "Item Group", "Item Group"), req(link("fiscal_year", "Fiscal Year", "Fiscal Year")), float("target_qty", "Target Qty"), float("target_amount", "Target Amount"),
    req(link("distribution_id", "Monthly Distribution", "Monthly Distribution"))],
  totals: (rows) => [{ label: "Target amount", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.target_amount), 0)), align: "right" }],
});

/* ============================================================================ Quotation */

function QuotationGlance({ values, rows }: ExtraContext) {
  const days = values.valid_till ? Math.round((new Date(`${values.valid_till}T00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000) : null;
  const status = String(values.status || "Draft");
  const won = ["Ordered", "Partially Ordered"].includes(status);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile icon={<Coins className="h-4 w-4" />} label="Quoted value" value={formatMoney(asNumber(values.grand_total), values.currency || "PKR", { decimals: 2 })} sub={`${(rows.items ?? []).length} lines · ${fmt(values.total_qty)} qty`} />
      <Tile icon={<Timer className="h-4 w-4" />} label="Validity" value={days == null ? "—" : days >= 0 ? `${days} d left` : `expired ${-days} d ago`} sub={values.valid_till ? `valid till ${values.valid_till}` : "no validity date"}
        tone={days == null ? "primary" : days < 0 ? "rose" : days <= 7 ? "amber" : "emerald"} />
      <Tile icon={<Handshake className="h-4 w-4" />} label="Outcome" value={status} sub={won ? "converted to an order" : status === "Lost" ? values.order_lost_reason || "lost" : "awaiting the customer"} tone={won ? "emerald" : status === "Lost" ? "rose" : "sky"} />
      <Tile icon={<UserRound className="h-4 w-4" />} label={values.quotation_to || "Party"} value={values.customer_name || values.party_name || "—"} sub={values.territory || ""} tone="violet" />
    </div>
  );
}

export const QUOTATION_CONFIG: DocConfig = {
  doctype: "Quotation",
  base: "/selling/quotations",
  singular: "Quotation",
  plural: "Quotations",
  subtitle: "Price offers to customers and leads — convert the accepted ones into sales orders",
  icon: FileSignature,
  submittable: true,
  listFields: ["name", "quotation_to", "party_name", "customer_name", "transaction_date", "valid_till", "grand_total", "currency", "status", "docstatus", "modified"],
  // ?expiring=1 (home page "Quotations expiring this week"): open quotes whose validity ends within 7 days.
  urlFlags: [{ param: "expiring", label: "Expiring this week", filters: () => [["docstatus", "=", 1], ["status", "in", ["Open", "Replied"]], ["valid_till", "between", [isoDaysAgo(0), isoDaysAgo(-7)]]] }],
  columns: [nameCol("Quotation", (r) => r.customer_name || r.party_name), dateCol("transaction_date", "Date"), dateCol("valid_till", "Valid Till"), moneyCol("grand_total", "Total"), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "party_name", "customer_name"],
  statusField: "status",
  statuses: ["Draft", "Open", "Replied", "Partially Ordered", "Ordered", "Lost", "Expired", "Cancelled"],
  dateField: "transaction_date",
  sort: { key: "transaction_date", dir: "desc" },
  fields: [
    tab("Quotation"),
    sec("To"),
    req(select("naming_series", "Series", ["SAL-QTN-.YYYY.-"])),
    req(select("quotation_to", "Quotation To", ["Customer", "Lead", "Prospect", "CRM Deal"])),
    req({ fieldname: "party_name", label: "Party", fieldtype: "Dynamic Link", options: "quotation_to" }),
    ro(data("customer_name", "Name")),
    colBreak(),
    req(link("company", "Company", "Company")),
    req(date("transaction_date", "Date")),
    date("valid_till", "Valid Till"),
    req(select("order_type", "Order Type", ["Sales", "Maintenance", "Shopping Cart"])),
    sec("Currency and price list"),
    req(link("currency", "Currency", "Currency")),
    req(float("conversion_rate", "Exchange Rate")),
    colBreak(),
    req(link("selling_price_list", "Price List", "Price List")),
    link("referral_sales_partner", "Referral Sales Partner", "Sales Partner"),
    tab("Items"),
    tab("Taxes & Totals"),
    ...totalsFields(),
    tab("Terms"),
    ...termsFields(),
    tab("More"),
    sec("Addresses"),
    link("customer_address", "Customer Address", "Address"),
    link("shipping_address_name", "Shipping Address", "Address"),
    colBreak(),
    link("contact_person", "Contact Person", "Contact"),
    link("territory", "Territory", "Territory"),
    sec("If lost"),
    text("order_lost_reason", "Lost Reason"),
  ],
  children: [itemsSpec("Quotation", "Quotation Item"), TAXES, PAYMENT_SCHEDULE],
  linkEffects: {
    party_name: (p: string, v: DocValues) => (v.quotation_to === "Customer" || v.quotation_to === "Lead" ? customerEffect("Quotation")(p, v) : undefined),
    taxes_and_charges: (t: string) => taxesFromTemplate(t),
  },
  compute: computeSelling,
  tabIcons: { Quotation: FileSignature, Items: PackagePlus, "Taxes & Totals": Coins, Terms: FileSpreadsheet, More: SlidersHorizontal },
  tabPanels: { Quotation: { before: (c) => <QuotationGlance {...c} /> } },
  defaults: ({ company }) => ({ company, naming_series: "SAL-QTN-.YYYY.-", quotation_to: "Customer", transaction_date: todayISO(), order_type: "Sales", currency: "PKR", conversion_rate: 1, selling_price_list: "Standard Selling", plc_conversion_rate: 1 }),
  titleOf: (v) => (v.name ? `${v.name}${v.customer_name ? ` · ${v.customer_name}` : ""}` : "New Quotation"),
};

/* ============================================================================ Blanket Order */

export const BLANKET_ORDER_CONFIG: DocConfig = {
  doctype: "Blanket Order",
  base: "/selling/blanket-orders",
  singular: "Blanket Order",
  plural: "Blanket Orders",
  subtitle: "Annual / period rate contracts — call-off orders draw quantities against them",
  icon: CalendarClock,
  submittable: true,
  listFields: ["name", "blanket_order_type", "customer", "customer_name", "supplier", "from_date", "to_date", "docstatus", "modified"],
  columns: [nameCol("Blanket Order", (r) => r.customer_name || r.customer || r.supplier), statusCol("blanket_order_type", "Type", "Selling"), dateCol("from_date", "From"), dateCol("to_date", "To")],
  searchFields: ["name", "customer", "supplier", "order_no"],
  statusField: "blanket_order_type",
  statuses: ["Selling", "Purchasing"],
  fields: [
    tab("Contract"),
    sec("Party"),
    req(select("naming_series", "Series", ["MFG-BLR-.YYYY.-"])),
    req(select("blanket_order_type", "Type", ["Selling", "Purchasing"])),
    when(link("customer", "Customer", "Customer"), (v) => v.blanket_order_type !== "Purchasing"),
    when(link("supplier", "Supplier", "Supplier"), (v) => v.blanket_order_type === "Purchasing"),
    colBreak(),
    req(link("company", "Company", "Company")),
    data("order_no", "Customer / Supplier Order No"),
    date("order_date", "Order Date"),
    sec("Period"),
    req(date("from_date", "From")),
    colBreak(),
    req(date("to_date", "To")),
    sec("Currency"),
    req(link("currency", "Currency", "Currency")),
    req(float("conversion_rate", "Exchange Rate")),
    colBreak(),
    when(link("selling_price_list", "Price List", "Price List"), (v) => v.blanket_order_type !== "Purchasing"),
    tab("Items"),
    tab("Terms"),
    sec("Terms"),
    link("tc_name", "Terms Template", "Terms and Conditions"),
    richText("terms", "Terms and Conditions"),
  ],
  children: [{
    tab: "Items", key: "items", label: "Contract Items", description: "Contracted quantity and rate; ordered quantity fills as call-off orders are made.", doctype: "Blanket Order Item", minRows: 1, wide: true,
    columns: [req(link("item_code", "Item", "Item")), data("item_name", "Item Name"), float("qty", "Contract Qty"), req(currency("rate", "Rate")), ro(float("ordered_qty", "Ordered")), ro(float("pct", "% Ordered"))],
    derive: (r) => ({ ...r, pct: asNumber(r.qty) ? (asNumber(r.ordered_qty) / asNumber(r.qty)) * 100 : 0 }),
    totals: (rows) => [{ label: "Contract value", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.qty) * asNumber(r.rate), 0)), align: "right" }],
  }],
  tabIcons: { Contract: ClipboardList, Items: PackagePlus, Terms: FileSpreadsheet },
  defaults: ({ company }) => ({ company, naming_series: "MFG-BLR-.YYYY.-", blanket_order_type: "Selling", from_date: todayISO(), currency: "PKR", conversion_rate: 1 }),
  titleOf: (v) => (v.name ? `${v.name}${v.customer_name ? ` · ${v.customer_name}` : ""}` : "New Blanket Order"),
};

/* ============================================================================ Pricing Rule */

export const PRICING_RULE_CONFIG: DocConfig = {
  doctype: "Pricing Rule",
  base: "/selling/pricing-rules",
  singular: "Pricing Rule",
  plural: "Pricing Rules",
  subtitle: "Automatic discounts, special rates and free items by customer, group, territory or quantity",
  icon: BadgePercent,
  companyScoped: false,
  listFields: ["name", "title", "apply_on", "price_or_product_discount", "applicable_for", "rate_or_discount", "discount_percentage", "rate", "valid_from", "valid_upto", "disable", "modified"],
  columns: [nameCol("Rule", (r) => r.title), textCol("apply_on", "Apply On"), textCol("applicable_for", "For"), textCol("rate_or_discount", "Type"),
    numCol("discount_percentage", "Disc %", 1), dateCol("valid_upto", "Valid Upto"), yesNoCol("disable", "Status", "Disabled", "Active")],
  searchFields: ["name", "title"],
  fields: [
    tab("Rule"),
    sec("Rule"),
    req(data("title", "Title")),
    req(select("apply_on", "Apply On", ["Item Code", "Item Group", "Brand", "Transaction"])),
    req(select("price_or_product_discount", "Price or Product Discount", ["Price", "Product"])),
    colBreak(),
    check("selling", "Selling"),
    check("buying", "Buying"),
    check("disable", "Disable"),
    link("company", "Company", "Company"),
    req(link("currency", "Currency", "Currency")),
    sec("Applicable for"),
    select("applicable_for", "Applicable For", ["", "Customer", "Customer Group", "Territory", "Sales Partner", "Campaign", "Supplier", "Supplier Group"]),
    colBreak(),
    when(link("customer", "Customer", "Customer"), (v) => v.applicable_for === "Customer"),
    when(link("customer_group", "Customer Group", "Customer Group"), (v) => v.applicable_for === "Customer Group"),
    when(link("territory", "Territory", "Territory"), (v) => v.applicable_for === "Territory"),
    when(link("sales_partner", "Sales Partner", "Sales Partner"), (v) => v.applicable_for === "Sales Partner"),
    when(link("supplier", "Supplier", "Supplier"), (v) => v.applicable_for === "Supplier"),
    when(link("supplier_group", "Supplier Group", "Supplier Group"), (v) => v.applicable_for === "Supplier Group"),
    tab("Items"),
    tab("Discount"),
    sec("Quantity and amount"),
    float("min_qty", "Min Qty"),
    float("max_qty", "Max Qty"),
    colBreak(),
    currency("min_amt", "Min Amount"),
    currency("max_amt", "Max Amount"),
    sec("Price discount"),
    when(select("rate_or_discount", "Rate or Discount", ["", "Rate", "Discount Percentage", "Discount Amount"]), (v) => v.price_or_product_discount === "Price"),
    when(currency("rate", "Rate"), (v) => v.rate_or_discount === "Rate"),
    when(float("discount_percentage", "Discount %"), (v) => v.rate_or_discount === "Discount Percentage"),
    when(currency("discount_amount", "Discount Amount"), (v) => v.rate_or_discount === "Discount Amount"),
    colBreak(),
    when(link("for_price_list", "For Price List", "Price List"), (v) => v.price_or_product_discount === "Price"),
    select("margin_type", "Margin Type", ["", "Percentage", "Amount"]),
    float("margin_rate_or_amount", "Margin"),
    sec("Product discount (free item)"),
    when(check("same_item", "Same Item"), (v) => v.price_or_product_discount === "Product"),
    when(link("free_item", "Free Item", "Item"), (v) => v.price_or_product_discount === "Product" && !v.same_item),
    when(float("free_qty", "Free Qty"), (v) => v.price_or_product_discount === "Product"),
    colBreak(),
    when(currency("free_item_rate", "Free Item Rate"), (v) => v.price_or_product_discount === "Product"),
    when(check("is_recursive", "Recursive (per every Min Qty)"), (v) => v.price_or_product_discount === "Product"),
    tab("Validity"),
    sec("Period"),
    date("valid_from", "Valid From"),
    colBreak(),
    date("valid_upto", "Valid Upto"),
    sec("Priority"),
    check("has_priority", "Has Priority"),
    when(select("priority", "Priority", ["", ...Array.from({ length: 20 }, (_, i) => String(i + 1))]), (v) => Boolean(v.has_priority)),
    colBreak(),
    check("apply_multiple_pricing_rules", "Apply Multiple Pricing Rules"),
    text("rule_description", "Description"),
  ],
  children: [
    { tab: "Items", key: "items", label: "Items", doctype: "Pricing Rule Item Code", showIf: (v) => v.apply_on === "Item Code", columns: [link("item_code", "Item", "Item"), link("uom", "UOM", "UOM")] },
    { tab: "Items", key: "item_groups", label: "Item Groups", doctype: "Pricing Rule Item Group", showIf: (v) => v.apply_on === "Item Group", columns: [link("item_group", "Item Group", "Item Group"), link("uom", "UOM", "UOM")] },
  ],
  tabIcons: { Rule: BadgePercent, Items: PackagePlus, Discount: Percent, Validity: CalendarClock },
  defaults: () => ({ apply_on: "Item Code", price_or_product_discount: "Price", selling: 1, currency: "PKR", rate_or_discount: "Discount Percentage", valid_from: todayISO() }),
  titleOf: (v) => v.title || v.name || "New Pricing Rule",
};

/* ============================================================================ smaller masters */

export const PRODUCT_BUNDLE_CONFIG: DocConfig = {
  doctype: "Product Bundle",
  base: "/selling/product-bundles",
  singular: "Product Bundle",
  plural: "Product Bundles",
  subtitle: "Sell a set of items under one code (e.g. an assorted yarn pack)",
  icon: Gift,
  companyScoped: false,
  listFields: ["name", "new_item_code", "description", "disabled", "modified"],
  columns: [nameCol("Bundle", (r) => r.description), yesNoCol("disabled", "Status", "Disabled", "Active")],
  searchFields: ["name", "description"],
  fields: [sec("Bundle"), req(link("new_item_code", "Bundle Item (non-stock)", "Item")), data("description", "Description"), colBreak(), check("disabled", "Disabled")],
  children: [{ key: "items", label: "Contents", doctype: "Product Bundle Item", minRows: 1, columns: [req(link("item_code", "Item", "Item")), req(float("qty", "Qty")), ro(link("uom", "UOM", "UOM"))], newRow: () => ({ qty: 1 }) }],
  titleOf: (v) => v.new_item_code || v.name || "New Product Bundle",
};

export const PRICE_LIST_CONFIG: DocConfig = {
  doctype: "Price List",
  base: "/selling/price-lists",
  singular: "Price List",
  plural: "Price Lists",
  subtitle: "Selling and buying price lists — item prices live under Stock → Item Prices",
  icon: Tag,
  companyScoped: false,
  listFields: ["name", "currency", "selling", "buying", "enabled", "modified"],
  columns: [nameCol("Price List", (r) => r.currency), yesNoCol("selling", "Selling", "Yes", "—"), yesNoCol("buying", "Buying", "Yes", "—"), yesNoCol("enabled", "Status", "Enabled", "Disabled")],
  searchFields: ["name"],
  fields: [sec("Price list"), req(data("price_list_name", "Price List Name")), req(link("currency", "Currency", "Currency")), colBreak(), check("selling", "Selling"), check("buying", "Buying"),
    check("enabled", "Enabled"), check("price_not_uom_dependent", "Price Not UOM Dependent")],
  defaults: () => ({ enabled: 1, selling: 1, currency: "PKR" }),
  titleOf: (v) => v.price_list_name || v.name || "New Price List",
};

export const SALES_TAX_TEMPLATE_CONFIG: DocConfig = {
  doctype: "Sales Taxes and Charges Template",
  base: "/selling/tax-templates",
  singular: "Sales Taxes Template",
  plural: "Sales Taxes Templates",
  subtitle: "GST, further tax and freight rows applied to quotations, orders and invoices",
  icon: Receipt,
  listFields: ["name", "title", "company", "tax_category", "is_default", "disabled", "modified"],
  columns: [nameCol("Template", (r) => r.tax_category), yesNoCol("is_default", "Default", "Default", "—"), yesNoCol("disabled", "Status", "Disabled", "Active")],
  searchFields: ["name", "title"],
  fields: [sec("Template"), req(data("title", "Title")), req(link("company", "Company", "Company")), link("tax_category", "Tax Category", "Tax Category"), colBreak(), check("is_default", "Default"), check("disabled", "Disabled")],
  children: [{ ...TAXES, tab: undefined }],
  defaults: ({ company }) => ({ company }),
  titleOf: (v) => v.title || v.name || "New Sales Taxes Template",
};

export const SALES_PARTNER_CONFIG: DocConfig = {
  doctype: "Sales Partner",
  base: "/selling/sales-partners",
  singular: "Sales Partner",
  plural: "Sales Partners",
  subtitle: "Agents, brokers and distributors paid a commission on sales",
  icon: Users,
  companyScoped: false,
  listFields: ["name", "partner_type", "territory", "commission_rate", "modified"],
  columns: [nameCol("Partner", (r) => r.partner_type), textCol("territory", "Territory"), numCol("commission_rate", "Commission %", 2)],
  searchFields: ["name", "territory"],
  fields: [
    tab("Partner"),
    sec("Partner"), req(data("partner_name", "Partner Name")), link("partner_type", "Partner Type", "Sales Partner Type"), req(link("territory", "Territory", "Territory")),
    colBreak(), req(float("commission_rate", "Commission Rate (%)")), link("supplier", "Linked Supplier (for commission bills)", "Supplier"), data("referral_code", "Referral Code"),
    sec("About"), text("introduction", "Introduction"),
    tab("Targets"),
  ],
  children: [TARGETS("Targets")],
  tabIcons: { Partner: Users, Targets: Target },
  titleOf: (v) => v.partner_name || v.name || "New Sales Partner",
};

export const SALES_PERSON_CONFIG: DocConfig = {
  doctype: "Sales Person",
  base: "/selling/sales-persons",
  singular: "Sales Person",
  plural: "Sales Persons",
  subtitle: "Sales team tree — commission and targets per person",
  icon: UserRound,
  companyScoped: false,
  listFields: ["name", "parent_sales_person", "employee", "commission_rate", "is_group", "enabled", "modified"],
  columns: [nameCol("Sales Person", (r) => r.parent_sales_person), textCol("employee", "Employee"), yesNoCol("is_group", "Kind", "Group", "Person"), yesNoCol("enabled", "Status", "Enabled", "Disabled")],
  searchFields: ["name", "employee"],
  fields: [
    tab("Person"),
    sec("Person"), req(data("sales_person_name", "Sales Person Name")), link("parent_sales_person", "Parent", "Sales Person"), link("employee", "Employee", "Employee"),
    colBreak(), data("commission_rate", "Commission Rate"), check("is_group", "Is Group"), check("enabled", "Enabled"),
    tab("Targets"),
  ],
  children: [TARGETS("Targets")],
  tabIcons: { Person: UserRound, Targets: Target },
  defaults: () => ({ enabled: 1, is_group: 0, parent_sales_person: "Sales Team" }),
  titleOf: (v) => v.sales_person_name || v.name || "New Sales Person",
};

export const TERRITORY_CONFIG: DocConfig = {
  doctype: "Territory",
  base: "/selling/territories",
  singular: "Territory",
  plural: "Territories",
  subtitle: "Sales regions — Punjab, Sindh, export markets…",
  icon: MapIcon,
  companyScoped: false,
  listFields: ["name", "parent_territory", "territory_manager", "is_group", "modified"],
  columns: [nameCol("Territory", (r) => r.parent_territory), textCol("territory_manager", "Manager"), yesNoCol("is_group", "Kind", "Group", "Leaf")],
  searchFields: ["name"],
  fields: [
    tab("Territory"),
    sec("Territory"), req(data("territory_name", "Territory Name")), link("parent_territory", "Parent Territory", "Territory"),
    colBreak(), link("territory_manager", "Territory Manager", "Sales Person"), check("is_group", "Is Group"),
    tab("Targets"),
  ],
  children: [TARGETS("Targets")],
  tabIcons: { Territory: Globe2, Targets: Target },
  defaults: () => ({ parent_territory: "All Territories", is_group: 0 }),
  titleOf: (v) => v.territory_name || v.name || "New Territory",
};

export const SELLING_MASTER_CONFIGS = [QUOTATION_CONFIG, BLANKET_ORDER_CONFIG, PRICING_RULE_CONFIG, PRODUCT_BUNDLE_CONFIG, PRICE_LIST_CONFIG, SALES_TAX_TEMPLATE_CONFIG,
  SALES_PARTNER_CONFIG, SALES_PERSON_CONFIG, TERRITORY_CONFIG];

