import { callDocMethod, getCall, http, postCall, postCallForDoc } from "./frappe";
import type {
  FrappeUser,
  LandedCostReceiptDocType,
  LandedCostVoucher,
  PurchaseInvoice,
  PurchaseReceipt,
  PurchaseOrder,
  SalesOrder,
  DeliveryNote,
  SalesInvoice,
  RequestForQuotation,
  StockEntry,
} from "@/types/frappe";

/**
 * Micromax business-logic API layer.
 *
 * These wrap ERPNext whitelisted methods. Any authorization / accounting logic
 * lives server-side in the `micromax` Frappe app; this frontend only calls it.
 */

/** Fetch the current user (with roles) — used by the header. */
export async function fetchCurrentUser(): Promise<FrappeUser> {
  const user = await getCall<FrappeUser>("frappe.auth.get_logged_user");
  return user;
}

export async function fetchUserRoles(user: string): Promise<string[]> {
  const result = await postCall<{ roles: string[] }>("frappe.auth.get_roles", { user });
  return result?.roles ?? [];
}

/** Helper to build a "select" payload for sales order list queries. */
export interface SalesOrderQuery {
  filters?: unknown[][];
  fields?: string[];
  limit_start?: number;
  limit?: number;
  orderBy?: string;
}

export async function listSalesOrders(query: SalesOrderQuery): Promise<SalesOrder[]> {
  return getCall("frappe.client.get_list", {
    doctype: "Sales Order",
    filters: query.filters ?? [],
    fields: query.fields ?? ["*"],
    limit_start: query.limit_start ?? 0,
    limit: query.limit ?? 100,
    order_by: query.orderBy ?? "modified desc",
  });
}

/** Fetch a Frappe document (used when a doc-method needs the raw record). */
export async function getDocument<T>(doctype: string, name: string): Promise<T> {
  return getCall("frappe.client.get", { doctype, name });
}

/**
 * Mapped-doc creation helpers (ERPNext's "Get Items From" / desk "Create"
 * buttons). Each returns a fully populated but *unsaved* document — the
 * caller is expected to route to the relevant form page and let the user
 * review/edit before saving.
 */

/** Build an unsaved Purchase Receipt from a submitted Purchase Order. */
export function makePurchaseReceiptFromPO(poName: string): Promise<PurchaseReceipt> {
  return postCall<PurchaseReceipt>(
    "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt",
    { source_name: poName },
  );
}

/** Build an unsaved Purchase Invoice from a submitted Purchase Order. */
export function makePurchaseInvoiceFromPO(poName: string): Promise<PurchaseInvoice> {
  return postCall<PurchaseInvoice>(
    "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice",
    { source_name: poName },
  );
}

/** Build an unsaved Purchase Invoice from a submitted Purchase Receipt. */
export function makePurchaseInvoiceFromPR(prName: string): Promise<PurchaseInvoice> {
  return postCall<PurchaseInvoice>(
    "erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice",
    { source_name: prName },
  );
}

/** Build an unsaved Purchase Order from a submitted ("Purchase" type) Material Request. */
export function makePurchaseOrderFromMR(mrName: string): Promise<PurchaseOrder> {
  return postCall<PurchaseOrder>(
    "erpnext.stock.doctype.material_request.material_request.make_purchase_order",
    { source_name: mrName },
  );
}

/** Build an unsaved Request for Quotation from a submitted ("Purchase" type) Material Request. */
export function makeRequestForQuotationFromMR(mrName: string): Promise<RequestForQuotation> {
  return postCall<RequestForQuotation>(
    "erpnext.stock.doctype.material_request.material_request.make_request_for_quotation",
    { source_name: mrName },
  );
}

/**
 * Build an unsaved Stock Entry from a submitted ("Material Issue" /
 * "Material Transfer" type) Material Request — the mapped-doc method sets
 * `purpose`/`stock_entry_type` from `material_request_type` and, for
 * Material Issue, populates `from_warehouse` from the request's target
 * warehouse (there's nowhere stock is issued *to*).
 */
export function makeStockEntryFromMR(mrName: string): Promise<StockEntry> {
  return postCall<StockEntry>(
    "erpnext.stock.doctype.material_request.material_request.make_stock_entry",
    { source_name: mrName },
  );
}

/**
 * Build an unsaved Purchase Order prefill from a submitted RFQ, for one chosen
 * supplier. Unlike the other "make_*" helpers this is pure client-side data
 * shaping, not an ERPNext mapped-doc call — core ERPNext has no
 * `request_for_quotation` link field on Purchase Order Item (only Supplier
 * Quotation carries that; this app has no Supplier Quotation module), so
 * there's no whitelisted server method to map RFQ -> PO directly, and no
 * server-traceable link once created (the RFQ Detail page's "linked Purchase
 * Orders" can't be queried the way Material Request's can).
 */
export function buildPurchaseOrderPrefillFromRFQ(
  rfq: RequestForQuotation,
  supplier: string,
): Partial<PurchaseOrder> {
  const supplierRow = (rfq.suppliers ?? []).find((s) => s.supplier === supplier);
  return {
    supplier,
    supplier_name: supplierRow?.supplier_name || supplier,
    company: rfq.company,
    schedule_date: rfq.schedule_date,
    items: (rfq.items ?? []).map((it) => ({
      item_code: it.item_code,
      item_name: it.item_name,
      description: it.description,
      qty: it.qty,
      uom: it.uom,
      stock_uom: it.stock_uom,
      conversion_factor: it.conversion_factor,
      warehouse: it.warehouse,
      schedule_date: it.schedule_date,
      rate: 0,
      amount: 0,
    })) as PurchaseOrder["items"],
  };
}

/** Build an unsaved Delivery Note from a submitted Sales Order. */
export function makeDeliveryNoteFromSO(soName: string): Promise<DeliveryNote> {
  return postCall<DeliveryNote>(
    "erpnext.selling.doctype.sales_order.sales_order.make_delivery_note",
    { source_name: soName },
  );
}

/** Build an unsaved Sales Invoice from a submitted Sales Order. */
export function makeSalesInvoiceFromSO(soName: string): Promise<SalesInvoice> {
  return postCall<SalesInvoice>(
    "erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice",
    { source_name: soName },
  );
}

/** Build an unsaved Sales Invoice from a submitted Delivery Note. */
export function makeSalesInvoiceFromDN(dnName: string): Promise<SalesInvoice> {
  return postCall<SalesInvoice>(
    "erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice",
    { source_name: dnName },
  );
}

/**
 * Build an unsaved Landed Cost Voucher pre-linked to one submitted Purchase
 * Receipt or stock-updating Purchase Invoice (its items are already fetched
 * server-side — see `LandedCostVoucher.get_items_from_purchase_receipts`).
 */
export function makeLandedCostVoucher(
  docType: LandedCostReceiptDocType,
  docName: string,
): Promise<LandedCostVoucher> {
  return postCall<LandedCostVoucher>(
    "erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_lcv",
    { doctype: docType, docname: docName },
  );
}

/**
 * Build an unsaved Landed Cost Voucher from an Import Cost Sheet's charge
 * breakdown (freight/duty/insurance/... summed across all cost sheet items,
 * pre-filled as the taxes table).
 *
 * By default the voucher references the cost sheet's own linked Purchase
 * Receipt. Pass `referenceOverride` to instead reference a different
 * submitted document that shares this cost sheet's Purchase Order (e.g. a
 * stock-updating Purchase Invoice) — used when generating from that
 * document's own page, so the voucher lines up with what the user is
 * actually looking at while the charges still come from the cost sheet.
 */
export function makeLandedCostVoucherFromCostSheet(
  costSheetName: string,
  referenceOverride?: { receiptDoctype: LandedCostReceiptDocType; receiptDocument: string },
): Promise<LandedCostVoucher> {
  return callDocMethod<LandedCostVoucher>(
    "make_landed_cost_voucher",
    "Import Cost Sheet",
    costSheetName,
    referenceOverride
      ? {
          receipt_doctype: referenceOverride.receiptDoctype,
          receipt_document: referenceOverride.receiptDocument,
        }
      : undefined,
  );
}

/**
 * Re-run `get_items_from_purchase_receipts` against the given (possibly
 * unsaved, possibly locally-edited) Landed Cost Voucher and return the
 * refreshed document — used by the "Refresh Items" action so a newly added
 * voucher row picks up its items without discarding other in-progress edits.
 */
export function refreshLandedCostItems(doc: Record<string, unknown>): Promise<LandedCostVoucher> {
  return postCallForDoc<LandedCostVoucher>("get_items_from_purchase_receipts", {
    doctype: "Landed Cost Voucher",
    ...doc,
  });
}

// --------------------------------------------------------------------------
// CRM (Frappe CRM app — `crm.api.*`). We reuse its whitelisted list/kanban,
// activity-timeline, notification and dashboard-aggregation endpoints rather
// than reimplementing them against raw doctype REST — see
// /home/maqmalak/.claude/plans/replicated-baking-cat.md for why.
// --------------------------------------------------------------------------

/** One kanban column's group of records, as `crm.api.doc.get_data` actually returns them. */
export interface CrmKanbanColumnGroup {
  column: { name: string; count?: number; all_count?: number; [key: string]: unknown };
  fields: string[];
  data: Record<string, unknown>[];
}

export interface CrmKanbanResponse {
  data: CrmKanbanColumnGroup[];
}

/**
 * Kanban board data for a doctype (CRM Lead/CRM Deal `status`, say), built by
 * the CRM app's own `crm.api.doc.get_data` — the same endpoint its own
 * frontend uses. Its response shape is one entry per column
 * (`{column: {name, count}, data: [...]}`), not a flat row list, and its
 * `view` argument must be a *dict* with `view_type: "kanban"` (a bare string
 * like `"kanban"`/`"group_by"` raises `AttributeError: 'str' object has no
 * attribute 'get'` — confirmed against the live backend, which calls
 * `view.get("view_type")` on whatever `view` is passed). `column_field`
 * alone is enough for the server to auto-derive kanban_columns from that
 * field's Link/Select options; no need to pass them ourselves.
 *
 * Called via POST, not GET: `filters` is strictly typed `dict` server-side
 * (Frappe's runtime type validation) — a GET query string can only ever
 * deliver a *string* for a dict-typed param (confirmed:
 * `FrappeTypeError: Argument 'filters' ... should be of type 'dict' but got
 * 'str' instead`). POST with a JSON body round-trips a real dict.
 */
export function getCrmKanbanData(params: {
  doctype: string;
  columnField: string;
  filters?: Record<string, unknown>;
  orderBy?: string;
  pageLength?: number;
  /**
   * Extra fields to include on each card's row data, beyond `name` + the
   * doctype's own `title_field` + standard fields (creation/modified/owner/
   * _assign/...). The server only returns what's explicitly asked for here —
   * confirmed against the live backend: CRM Deal cards came back with no
   * `deal_value` at all until this was passed (CRM Deal has no
   * `default_kanban_settings()` supplying it, unlike CRM Lead).
   */
  kanbanFields?: string[];
}): Promise<CrmKanbanResponse> {
  return postCall<CrmKanbanResponse>("crm.api.doc.get_data", {
    doctype: params.doctype,
    filters: params.filters ?? {},
    // Required positional arg server-side (no default) — confirmed
    // (`TypeError: get_data() missing 1 required positional argument:
    // 'order_by'`) when omitted.
    order_by: params.orderBy ?? "modified desc",
    page_length: params.pageLength ?? 20,
    column_field: params.columnField,
    kanban_fields: params.kanbanFields,
    view: { view_type: "kanban" },
  });
}

export interface CrmViewSettingsRow {
  name: string;
  label?: string;
  dt: string;
  type?: string;
  route_name?: string;
  icon?: string;
  is_default?: 0 | 1;
  pinned?: 0 | 1;
  [key: string]: unknown;
}

/** Saved per-user list/kanban view configs for a doctype (`CRM View Settings`). */
export function getCrmViews(doctype: string): Promise<CrmViewSettingsRow[]> {
  return postCall<CrmViewSettingsRow[]>("crm.api.views.get_views", { doctype });
}

/** A single entry in a Lead/Deal's activity timeline (see `CrmActivitiesResult`). */
export interface CrmActivityItem {
  name?: string;
  activity_type: "creation" | "changed" | "added" | "removed" | "comment" | "communication" | "attachment_log";
  creation: string;
  owner?: string;
  is_lead: boolean;
  /** A plain string for "creation"; a {field, field_label, value, old_value} object for changed/added/removed; a communication/attachment payload for those types. */
  data?: unknown;
  /** Only set for activity_type "comment". */
  content?: string;
  /** Same-owner field changes made back-to-back get grouped under the first entry. */
  other_versions?: CrmActivityItem[];
}

/**
 * `crm.api.activities.get_activities` returns `[activities, calls, notes,
 * tasks, attachments]` as the whitelisted method's actual return value
 * (`message`) — confirmed against the live backend via a direct fetch()
 * (`message` is a populated 5-element array, not empty as an earlier pass
 * assumed). `docinfo` also sits alongside it at the top level (a side effect
 * of this endpoint calling Frappe's `get_docinfo()` internally) but only
 * carries the raw, unformatted comment list — `activities[0]` already
 * includes comments plus creation/field-change/communication events with
 * human-readable labels, so that's the one to render.
 */
export interface CrmActivitiesResult {
  activities: CrmActivityItem[];
  calls: unknown[];
  notes: unknown[];
  tasks: unknown[];
  attachments: unknown[];
}

export function getCrmActivities(name: string): Promise<CrmActivitiesResult> {
  return http.post("/api/method/crm.api.activities.get_activities", { name }).then((res) => {
    const message = res.data?.message;
    const [activities, calls, notes, tasks, attachments] = Array.isArray(message)
      ? message
      : [[], [], [], [], []];
    return {
      activities: (activities ?? []) as CrmActivityItem[],
      calls: calls ?? [],
      notes: notes ?? [],
      tasks: tasks ?? [],
      attachments: attachments ?? [],
    };
  });
}

/** Tasks linked to a Lead/Deal via `CRM Task.reference_docname`. */
export function getCrmLinkedTasks(name: string): Promise<Record<string, unknown>[]> {
  return postCall<Record<string, unknown>[]>("crm.api.activities.get_linked_tasks", { name });
}

export interface CrmNotificationRow {
  name: string;
  type?: string;
  from_user?: { name: string; full_name?: string };
  read?: 0 | 1;
  notification_text?: string;
  reference_doctype?: string;
  hash?: string;
  creation?: string;
}

/** All notifications for the current session user (bell dropdown). */
export function getCrmNotifications(): Promise<CrmNotificationRow[]> {
  return postCall<CrmNotificationRow[]>("crm.api.notifications.get_notifications");
}

/** Mark one (or, if omitted, all unread) notifications as read. */
export function markCrmNotificationsRead(doc?: string): Promise<void> {
  return postCall("crm.api.notifications.mark_as_read", doc ? { doc } : undefined);
}

/** Add a comment/note to a Lead or Deal's activity timeline. */
export function addCrmComment(
  referenceDoctype: string,
  referenceName: string,
  content: string,
): Promise<Record<string, unknown>> {
  return postCall("crm.api.comment.add_comment", {
    reference_doctype: referenceDoctype,
    reference_name: referenceName,
    content,
  });
}

export interface CrmDashboardWidgetRaw {
  name: string;
  type: "number_chart" | "axis_chart" | "donut_chart" | "spacer";
  layout: { x: number; y: number; w: number; h: number; i: string };
  data?: Record<string, any>;
}

/**
 * The full dashboard: `CRM Dashboard.layout` widgets, each with its aggregated
 * `data` attached server-side. The response is a plain array of widgets —
 * confirmed against the live backend (`message` came back as `{0: {...}, 1:
 * {...}, ...}`, i.e. an array, not `{title, layout}` as the doctype's own
 * field naming might suggest; `get_dashboard` returns the layout list
 * directly, not the `CRM Dashboard` document itself).
 */
export function getCrmDashboard(range?: {
  fromDate?: string;
  toDate?: string;
  user?: string;
}): Promise<CrmDashboardWidgetRaw[]> {
  return postCall("crm.api.dashboard.get_dashboard", {
    from_date: range?.fromDate,
    to_date: range?.toDate,
    user: range?.user,
  });
}

/** Refetch a single named dashboard widget's data (e.g. after changing the date range). */
export function getCrmChart(
  name: string,
  type: string,
  range?: { fromDate?: string; toDate?: string; user?: string },
): Promise<unknown> {
  return postCall("crm.api.dashboard.get_chart", {
    name,
    type,
    from_date: range?.fromDate,
    to_date: range?.toDate,
    user: range?.user,
  });
}

/**
 * Calendar events in a date range (core Frappe `Event` doctype — the CRM app
 * has no meeting doctype of its own). Server-side expands recurring events.
 */
export function getCalendarEvents(
  start: string,
  end: string,
  filters?: unknown[][],
): Promise<Record<string, unknown>[]> {
  return postCall<Record<string, unknown>[]>("frappe.desk.doctype.event.event.get_events", {
    start,
    end,
    filters: filters ?? undefined,
  });
}

/**
 * Donor-prospecting scraper (custom `mm_core.crm_scraper` module — no
 * equivalent in the vendored crm app). Given a batch of company/NGO URLs,
 * the backend fetches each and best-effort extracts identity + CSR contact
 * info into a `CRM Prospect Scrape` review-queue row (one row per URL,
 * success or failure) — nothing here creates a `CRM Lead` directly.
 *
 * A full 25-URL batch can legitimately run past the client's default 60s
 * timeout (each entry does up to two real HTTP fetches against a site that
 * may itself be slow or bot-block, up to the backend's own 10s-per-request
 * timeout) — confirmed live. Given a generous ceiling here since this is a
 * one-off bulk action, not a background poll.
 */
export function scrapeCrmProspectUrls(urls: string[]): Promise<string[]> {
  return postCall<string[]>("mm_core.crm_scraper.scrape_urls", { urls }, { timeout: 240_000 });
}

/** Approve a reviewed `CRM Prospect Scrape` row into a real `CRM Lead`. */
export function convertCrmProspectScrapeToLead(name: string): Promise<string> {
  return callDocMethod<string>("convert_to_lead", "CRM Prospect Scrape", name);
}

/**
 * A fresh copy of a scraped prospect for the SAME company — to add another contact person there and
 * convert it to a second lead (a row converts once; the Organization / Territory / Lead Source already
 * exist by then, so only the new lead is created). Returns the new row's name.
 */
export function duplicateCrmProspectScrape(name: string): Promise<string> {
  return callDocMethod<string>("duplicate", "CRM Prospect Scrape", name);
}

/**
 * Convert a `CRM Lead` to a `CRM Deal` — the vendored crm app's own
 * whitelisted function (`crm.fcrm.doctype.crm_lead.crm_lead.convert_to_deal`,
 * the same one the official Frappe CRM app's "Convert to Deal" button
 * calls): marks the lead Qualified/converted, creates a Contact +
 * Organization from its data, and returns the new Deal's name.
 *
 * That vendored function auto-copies any same-named field from Lead to Deal
 * — including `annual_revenue`, which we relabeled "Expected Amount" (the
 * donation ask) on the Lead, but which still means "the org's own revenue"
 * on the Deal. So every converted Deal landed with the ask amount sitting
 * in the wrong field while `deal_value`/`expected_deal_value` — the fields
 * that actually drive pipeline totals — stayed at 0 (confirmed live).
 * `expectedAmount` (pass the lead's `annual_revenue`) patches that: it goes
 * into deal_value/expected_deal_value instead, and the wrongly-copied
 * Deal.annual_revenue is cleared.
 */
export async function convertCrmLeadToDeal(leadName: string, expectedAmount?: number | null): Promise<string> {
  const dealName = await postCall<string>("crm.fcrm.doctype.crm_lead.crm_lead.convert_to_deal", { lead: leadName });
  if (expectedAmount) {
    await postCall("frappe.client.set_value", {
      doctype: "CRM Deal",
      name: dealName,
      fieldname: { deal_value: expectedAmount, expected_deal_value: expectedAmount, annual_revenue: null },
    });
  }
  return dealName;
}

/**
 * `frappe_whatsapp` app integration (this bench's actual WhatsApp app, the
 * `whatsapp` app in `apps/`). No custom backend wrapper exists for this app,
 * so — mirroring the Email panel's use of the core `Communication` doctype
 * directly — this calls the generic `frappe.client.get_list` /
 * `frappe.client.insert` methods straight against `WhatsApp Message`.
 * Inserting with `direction: "Outgoing"` triggers that doctype's own
 * `before_insert` hook, which dispatches to Meta's Cloud API synchronously —
 * same mechanism Frappe CRM's own WhatsApp tab uses.
 *
 * Field names below match the currently-installed schema (confirmed live
 * against production's `frappe.get_meta("WhatsApp Message")`, `whatsapp`
 * app tag v1.0.0) — an earlier version of this code used an older schema
 * (`type`/`reference_name`/`use_template`/`template`/`is_reply`/
 * `reply_to_message_id`), which the installed app no longer has at all,
 * causing every request here to 417 with "Field not permitted in query"
 * on production. `is_reply`, `use_template`/`template` (now `is_template`/
 * `whatsapp_template`) aren't read anywhere in the UI, so they're just
 * dropped rather than re-added under their new names.
 */
export interface WhatsAppMessage {
  name: string;
  direction: "Outgoing" | "Incoming";
  to?: string;
  from?: string;
  message: string;
  status: "Pending" | "Sent" | "Delivered" | "Read" | "Failed";
  reference_doctype?: string;
  reference_docname?: string;
  creation: string;
}

/** A document's WhatsApp thread — every `WhatsApp Message` linked to it, oldest first. */
export function getWhatsAppMessages(references: [string, string][]): Promise<WhatsAppMessage[]> {
  const [referenceDoctype, referenceDocname] = references[0] ?? [];
  return getCall<WhatsAppMessage[]>("frappe.client.get_list", {
    doctype: "WhatsApp Message",
    filters: JSON.stringify([
      ["reference_doctype", "=", referenceDoctype],
      ["reference_docname", "=", referenceDocname],
    ]),
    fields: JSON.stringify([
      "name",
      "direction",
      "to",
      "from",
      "message",
      "status",
      "reference_doctype",
      "reference_docname",
      "creation",
    ]),
    order_by: "creation asc",
    limit_page_length: 0,
  });
}

/** Send a WhatsApp text message linked to a reference document; returns the new message's name. */
export async function sendWhatsAppMessage(args: {
  to: string;
  message: string;
  referenceDoctype?: string;
  referenceDocname?: string;
}): Promise<string> {
  const doc = await postCall<{ name: string }>("frappe.client.insert", {
    doc: JSON.stringify({
      doctype: "WhatsApp Message",
      direction: "Outgoing",
      content_type: "text",
      to: args.to,
      message: args.message,
      reference_doctype: args.referenceDoctype,
      reference_docname: args.referenceDocname,
    }),
  });
  return doc.name;
}