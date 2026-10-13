import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeGetCall,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import { postCall } from "@/services/frappe";
import type { PaymentEntry, PaymentEntryTax } from "@/types/frappe";

const PAYMENT_ENTRY_FIELDS = [
  "name",
  "payment_type",
  "posting_date",
  "company",
  "party_type",
  "party",
  "party_name",
  "paid_amount",
  "received_amount",
  "paid_from",
  "paid_to",
  "paid_from_account_currency",
  "paid_to_account_currency",
  "reference_no",
  "reference_date",
  "mode_of_payment",
  "status",
  "docstatus",
] as const;

/**
 * List Payment Entries. `limit` defaults to 200 for callers that just want "the recent ones";
 * the list page passes `limit` / `limitStart` / `orFilters` / `orderBy` (see useServerTable) to
 * page and search on the server instead — there are tens of thousands of these.
 */
export function usePaymentEntries(args?: {
  filters?: unknown[][];
  orFilters?: unknown[][];
  limit?: number;
  limitStart?: number;
  orderBy?: { field: string; order?: "asc" | "desc" };
  enabled?: boolean;
}) {
  const {
    filters = [],
    orFilters = [],
    limit = 200,
    limitStart = 0,
    orderBy = { field: "posting_date", order: "desc" },
    enabled = true,
  } = args ?? {};
  return useFrappeGetDocList<PaymentEntry>(
    "Payment Entry",
    {
      fields: PAYMENT_ENTRY_FIELDS as unknown as (keyof PaymentEntry)[],
      filters: filters as any,
      orFilters: orFilters.length ? (orFilters as any) : undefined,
      limit_start: limitStart,
      limit,
      orderBy,
    },
    enabled ? `micromax.pe.${JSON.stringify({ filters, orFilters, limit, limitStart, orderBy })}` : null,
    { keepPreviousData: true },
  );
}

/** Single Payment Entry (full document, including the references/deductions tables). */
export function usePaymentEntry(name?: string) {
  return useFrappeGetDoc<PaymentEntry>(
    "Payment Entry",
    name ?? undefined,
    name ? `micromax.pe.doc.${name}` : null,
  );
}

/** Create / Update / Delete mutations. */
export function usePaymentEntryMutations() {
  const create = useFrappeCreateDoc<PaymentEntry>();
  const update = useFrappeUpdateDoc<PaymentEntry>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<PaymentEntry>) => create.createDoc("Payment Entry", values as PaymentEntry),
    updateDoc: (name: string, values: Partial<PaymentEntry>) => update.updateDoc("Payment Entry", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Payment Entry", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

/** Submit a saved (draft) Payment Entry — same submit pattern used by Journal Entry / Landed Cost Voucher. */
export async function submitPaymentEntry(name: string): Promise<void> {
  const full = await postCall<PaymentEntry>("frappe.client.get", { doctype: "Payment Entry", name });
  await postCall("frappe.client.submit", { doc: full });
}

/**
 * Auto-fill helper — mirrors the desk Payment Entry form's behavior when a
 * Party is picked: resolves the party's receivable/payable account (and its
 * currency), display name, and default bank account.
 */
export async function getPartyPaymentDetails(args: {
  company: string;
  party_type: string;
  party: string;
  date: string;
}): Promise<{
  party_account: string;
  party_name: string;
  party_account_currency: string;
  party_bank_account?: string;
  bank_account?: string;
}> {
  return postCall("erpnext.accounts.doctype.payment_entry.payment_entry.get_party_details", args);
}

/**
 * Fetch a Purchase/Sales Taxes and Charges Template's own rows — the same
 * generic whitelisted method the real desk form calls when a template is
 * picked (`fetch_taxes_from_template` in payment_entry.js). Rows come back
 * stripped of doctype/name/parent metadata, ready to drop into a fresh
 * Advance Taxes and Charges table.
 */
export async function getTaxesAndCharges(
  masterDoctype: "Purchase Taxes and Charges Template" | "Sales Taxes and Charges Template",
  masterName: string,
): Promise<Partial<PaymentEntryTax>[]> {
  const result = await postCall<Partial<PaymentEntryTax>[] | null>(
    "erpnext.controllers.accounts_controller.get_taxes_and_charges",
    { master_doctype: masterDoctype, master_name: masterName },
  );
  return result ?? [];
}

/** Resolve an account's currency/type — used when the user picks Paid From/To manually. */
export async function getAccountPaymentDetails(args: {
  account: string;
  date: string;
}): Promise<{ account_currency: string; account_type?: string }> {
  return postCall("erpnext.accounts.doctype.payment_entry.payment_entry.get_account_details", args);
}

/** One outstanding invoice/order returned by "Get Outstanding Invoices". */
export interface OutstandingReferenceDocument {
  voucher_type: string;
  voucher_no: string;
  posting_date?: string;
  due_date?: string;
  invoice_amount: number;
  outstanding_amount: number;
  exchange_rate?: number;
  bill_no?: string;
  currency?: string;
}

/**
 * "Get Outstanding Invoices" — fetches unpaid Sales/Purchase Invoices (or
 * unbilled Orders) for the selected party, to allocate this payment against.
 * `party_account` is the party's own receivable/payable account: for a
 * Receive entry that's `paid_from`, for a Pay entry it's `paid_to`.
 */
export async function getOutstandingReferenceDocuments(args: {
  company: string;
  party_type: string;
  party: string;
  party_account: string;
  payment_type: string;
  get_orders_to_be_billed?: boolean;
}): Promise<OutstandingReferenceDocument[]> {
  const result = await postCall<OutstandingReferenceDocument[] | null>(
    "erpnext.accounts.doctype.payment_entry.payment_entry.get_outstanding_reference_documents",
    { args: { get_outstanding_invoices: true, ...args } },
  );
  return result ?? [];
}

/**
 * List Payment Entries reconciled against a Purchase Invoice.
 *
 * The link lives on the child table (Payment Entry Reference.reference_name),
 * shared across many reference_doctypes (Sales Invoice, Purchase Invoice,
 * Journal Entry, ...), so `reference_doctype` is passed as an extra exact-match
 * filter to avoid matching a same-named document of a different kind.
 */
export function usePaymentEntriesForPurchaseInvoice(piName?: string) {
  const { data: parentNames, isLoading: namesLoading, error: namesError, mutate: refreshNames } =
    useFrappeGetCall<string[]>(
      "mm_core.api.get_linked_parent_docs",
      piName
        ? {
            doctype: "Payment Entry Reference",
            parenttype: "Payment Entry",
            link_field: "reference_name",
            link_value: piName,
            // useFrappeGetCall sends this as a GET query param, so an object
            // value must be pre-serialized (axios won't JSON-encode it for us).
            extra_filters: JSON.stringify({ reference_doctype: "Purchase Invoice" }),
          }
        : undefined,
      piName ? `micromax.pe-parents-pi.${piName}` : null,
    );

  const raw = parentNames as unknown;
  const names: string[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { message?: unknown })?.message)
      ? ((raw as { message: string[] }).message)
      : [];

  const { data, isLoading, error, mutate } = useFrappeGetDocList<PaymentEntry>(
    "Payment Entry",
    names.length > 0
      ? {
          fields: PAYMENT_ENTRY_FIELDS as unknown as (keyof PaymentEntry)[],
          filters: [["name", "in", names]],
          limit: 200,
          orderBy: { field: "posting_date", order: "desc" },
        }
      : { filters: [["name", "=", ""]], limit: 0 },
    names.length > 0 ? `micromax.pe-for-pi.${piName}` : undefined,
  );

  return {
    data,
    isLoading: namesLoading || isLoading,
    error: namesError || error,
    mutate: () => {
      void refreshNames();
      void mutate();
    },
  };
}

/**
 * List Payment Entries reconciled against a Sales Invoice.
 *
 * Same shape as `usePaymentEntriesForPurchaseInvoice` — the link lives on
 * Payment Entry Reference.reference_name, shared across many
 * reference_doctypes, so `reference_doctype` is passed as an extra
 * exact-match filter.
 */
export function usePaymentEntriesForSalesInvoice(siName?: string) {
  const { data: parentNames, isLoading: namesLoading, error: namesError, mutate: refreshNames } =
    useFrappeGetCall<string[]>(
      "mm_core.api.get_linked_parent_docs",
      siName
        ? {
            doctype: "Payment Entry Reference",
            parenttype: "Payment Entry",
            link_field: "reference_name",
            link_value: siName,
            extra_filters: JSON.stringify({ reference_doctype: "Sales Invoice" }),
          }
        : undefined,
      siName ? `micromax.pe-parents-si.${siName}` : null,
    );

  const raw = parentNames as unknown;
  const names: string[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { message?: unknown })?.message)
      ? ((raw as { message: string[] }).message)
      : [];

  const { data, isLoading, error, mutate } = useFrappeGetDocList<PaymentEntry>(
    "Payment Entry",
    names.length > 0
      ? {
          fields: PAYMENT_ENTRY_FIELDS as unknown as (keyof PaymentEntry)[],
          filters: [["name", "in", names]],
          limit: 200,
          orderBy: { field: "posting_date", order: "desc" },
        }
      : { filters: [["name", "=", ""]], limit: 0 },
    names.length > 0 ? `micromax.pe-for-si.${siName}` : undefined,
  );

  return {
    data,
    isLoading: namesLoading || isLoading,
    error: namesError || error,
    mutate: () => {
      void refreshNames();
      void mutate();
    },
  };
}
