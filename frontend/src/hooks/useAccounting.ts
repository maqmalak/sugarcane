import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeGetCall,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import { postCall, getCall, http } from "@/services/frappe";
import { useInstalledApps } from "@/hooks/useInstalledApps";
import { asNumber } from "@/utils/cn";
import { APP_TIME_ZONE } from "@/utils/dates";
import type {
  Account,
  CostCenter,
  AccountCategory,
  TermsAndConditions,
  JournalEntryTemplate,
  FiscalYear,
  PaymentTerm,
  ModeOfPayment,
  TaxTemplate,
  JournalEntry,
  QueryReportResult,
  RawQueryReportResponse,
  PreparedReportDoc,
} from "@/types/frappe";

// ------------------------------------------------------------- Chart of Accounts

const ACCOUNT_FIELDS = [
  "name",
  "account_name",
  "account_number",
  "parent_account",
  "is_group",
  "root_type",
  "report_type",
  "account_type",
  "account_currency",
  "company",
  "disabled",
  "cps_applicable",
  "lft",
] as const;

/**
 * Whether this site has MicroMax's cost-per-spindle tag on Account (`cps_applicable`, a micromax Custom Field).
 * Other sites (e.g. the school) don't, and asking Frappe for that field fails the whole Account query.
 */
export function useHasCpsField() {
  const { apps, isLoading } = useInstalledApps();
  return { hasCps: apps.has("micromax"), isLoading };
}

/** Full flat Chart of Accounts for a company — build the tree client-side from `parent_account`. */
export function useChartOfAccounts(company?: string, enabled = true) {
  const { hasCps, isLoading: appsLoading } = useHasCpsField();
  const fields = hasCps ? ACCOUNT_FIELDS : ACCOUNT_FIELDS.filter((f) => f !== "cps_applicable");
  return useFrappeGetDocList<Account>(
    "Account",
    {
      fields: fields as unknown as (keyof Account)[],
      filters: (company ? [["company", "=", company]] : []) as any,
      limit: 0,
      orderBy: { field: "lft", order: "asc" },
    },
    enabled && company && !appsLoading ? `micromax.coa.${company}.${hasCps ? "cps" : "plain"}` : null,
  );
}

/** Leaf (postable) accounts only — for pickers like the Journal Entry row editor. */
export function usePostableAccounts(company?: string) {
  const { data, isLoading } = useChartOfAccounts(company);
  return { data: (data ?? []).filter((a) => !a.is_group), isLoading };
}

/**
 * Expense accounts tagged "CPS Applicable" (the micromax custom field on Account).
 *
 * The Production dashboard derives its cost-per-spindle figures from the GL postings
 * against these accounts, so it needs their names to filter GL Entry on. Returns the
 * docs rather than just names so callers can also report how many accounts are tagged
 * (and show a "nothing tagged yet" hint when there are none).
 */
export function useCpsAccounts(company?: string, enabled = true) {
  const { hasCps } = useHasCpsField();
  return useFrappeGetDocList<Account>(
    "Account",
    {
      fields: ["name", "account_name", "root_type"] as unknown as (keyof Account)[],
      filters: [...(company ? [["company", "=", company]] : []), ["cps_applicable", "=", 1]] as any,
      limit: 0,
      orderBy: { field: "lft", order: "asc" },
    },
    enabled && company && hasCps ? `micromax.cps-accounts.${company}` : null,
  );
}

/** Create / update / delete for the Account doctype — Chart of Accounts management. */
export function useAccountMutations() {
  const create = useFrappeCreateDoc<Account>();
  const update = useFrappeUpdateDoc<Account>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<Account>) => create.createDoc("Account", values as Account),
    updateDoc: (name: string, values: Partial<Account>) => update.updateDoc("Account", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Account", name),
    loading: create.loading || update.loading || del.loading,
  };
}

// ------------------------------------------------------------------- Cost Center

const COST_CENTER_FIELDS = [
  "name",
  "cost_center_name",
  "cost_center_number",
  "parent_cost_center",
  "is_group",
  "company",
  "disabled",
  "lft",
] as const;

export function useCostCenters(company?: string, enabled = true) {
  return useFrappeGetDocList<CostCenter>(
    "Cost Center",
    {
      fields: COST_CENTER_FIELDS as unknown as (keyof CostCenter)[],
      filters: (company ? [["company", "=", company]] : []) as any,
      limit: 0,
      orderBy: { field: "lft", order: "asc" },
    },
    enabled ? `micromax.cost-centers.${company ?? "all"}` : null,
  );
}

/** Create / update / delete for the Cost Center doctype. */
export function useCostCenterMutations() {
  const create = useFrappeCreateDoc<CostCenter>();
  const update = useFrappeUpdateDoc<CostCenter>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<CostCenter>) => create.createDoc("Cost Center", values as CostCenter),
    updateDoc: (name: string, values: Partial<CostCenter>) => update.updateDoc("Cost Center", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Cost Center", name),
    loading: create.loading || update.loading || del.loading,
  };
}

// -------------------------------------------------------------- Account Category

export function useAccountCategories(enabled = true) {
  return useFrappeGetDocList<AccountCategory>(
    "Account Category",
    {
      fields: ["name", "account_category_name", "root_type", "description"],
      limit: 0,
      orderBy: { field: "account_category_name", order: "asc" },
    },
    enabled ? "micromax.account-categories" : null,
  );
}

/** Create / update / delete for the Account Category doctype. */
export function useAccountCategoryMutations() {
  const create = useFrappeCreateDoc<AccountCategory>();
  const update = useFrappeUpdateDoc<AccountCategory>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<AccountCategory>) => create.createDoc("Account Category", values as AccountCategory),
    updateDoc: (name: string, values: Partial<AccountCategory>) => update.updateDoc("Account Category", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Account Category", name),
    loading: create.loading || update.loading || del.loading,
  };
}

// ---------------------------------------------------------- Terms and Conditions

export function useTermsAndConditions(enabled = true) {
  return useFrappeGetDocList<TermsAndConditions>(
    "Terms and Conditions",
    {
      fields: ["name", "title", "terms", "selling", "buying", "disabled"],
      limit: 0,
      orderBy: { field: "title", order: "asc" },
    },
    enabled ? "micromax.terms-and-conditions" : null,
  );
}

/** Create / update / delete for the Terms and Conditions doctype. */
export function useTermsAndConditionsMutations() {
  const create = useFrappeCreateDoc<TermsAndConditions>();
  const update = useFrappeUpdateDoc<TermsAndConditions>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<TermsAndConditions>) => create.createDoc("Terms and Conditions", values as TermsAndConditions),
    updateDoc: (name: string, values: Partial<TermsAndConditions>) => update.updateDoc("Terms and Conditions", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Terms and Conditions", name),
    loading: create.loading || update.loading || del.loading,
  };
}

// ------------------------------------------------------------ Journal Entry Template

export function useJournalEntryTemplates(enabled = true) {
  return useFrappeGetDocList<JournalEntryTemplate>(
    "Journal Entry Template",
    {
      fields: ["name", "template_title", "voucher_type", "company", "is_opening", "multi_currency"],
      limit: 0,
      orderBy: { field: "template_title", order: "asc" },
    },
    enabled ? "micromax.journal-entry-templates" : null,
  );
}

/** Full doc (incl. the `accounts` child table) for editing one Journal Entry Template. */
export function useJournalEntryTemplate(name?: string) {
  return useFrappeGetDoc<JournalEntryTemplate>(
    "Journal Entry Template",
    name ?? undefined,
    name ? `micromax.journal-entry-template.${name}` : null,
  );
}

/** Create / update / delete for the Journal Entry Template doctype. */
export function useJournalEntryTemplateMutations() {
  const create = useFrappeCreateDoc<JournalEntryTemplate>();
  const update = useFrappeUpdateDoc<JournalEntryTemplate>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<JournalEntryTemplate>) => create.createDoc("Journal Entry Template", values as JournalEntryTemplate),
    updateDoc: (name: string, values: Partial<JournalEntryTemplate>) => update.updateDoc("Journal Entry Template", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Journal Entry Template", name),
    loading: create.loading || update.loading || del.loading,
  };
}

/** Journal Entry's own naming series options — Journal Entry Template reuses them (see its `get_naming_series` whitelisted method). */
export function useJournalEntryNamingSeries(enabled = true) {
  const { data } = useFrappeGetCall<{ message: string }>(
    "erpnext.accounts.doctype.journal_entry_template.journal_entry_template.get_naming_series",
    {},
    enabled ? "micromax.je-template.naming-series" : null,
  );
  return useMemo(() => splitNamingSeries(data?.message), [data]);
}

function splitNamingSeries(options?: string): string[] {
  return (options ?? "")
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);
}

// ------------------------------------------------------------------- Fiscal Year

export function useFiscalYears(enabled = true) {
  return useFrappeGetDocList<FiscalYear>(
    "Fiscal Year",
    {
      fields: ["name", "year_start_date", "year_end_date", "disabled"],
      limit: 0,
      orderBy: { field: "year_start_date", order: "desc" },
    },
    enabled ? "micromax.fiscal-years" : null,
  );
}

/** Create / update / delete for the Fiscal Year doctype. */
export function useFiscalYearMutations() {
  const create = useFrappeCreateDoc<FiscalYear>();
  const update = useFrappeUpdateDoc<FiscalYear>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<FiscalYear>) => create.createDoc("Fiscal Year", values as FiscalYear),
    updateDoc: (name: string, values: Partial<FiscalYear>) => update.updateDoc("Fiscal Year", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Fiscal Year", name),
    loading: create.loading || update.loading || del.loading,
  };
}

// ----------------------------------------------------------------- Payment Term

const PAYMENT_TERM_FIELDS = [
  "name",
  "payment_term_name",
  "invoice_portion",
  "mode_of_payment",
  "due_date_based_on",
  "credit_days",
  "credit_months",
  "description",
  "discount_type",
  "discount",
  "discount_validity_based_on",
  "discount_validity",
] as const;

export function usePaymentTerms(enabled = true) {
  return useFrappeGetDocList<PaymentTerm>(
    "Payment Term",
    {
      fields: PAYMENT_TERM_FIELDS as unknown as (keyof PaymentTerm)[],
      limit: 0,
      orderBy: { field: "name", order: "asc" },
    },
    enabled ? "micromax.payment-terms" : null,
  );
}

/** Create / update / delete for the Payment Term doctype. */
export function usePaymentTermMutations() {
  const create = useFrappeCreateDoc<PaymentTerm>();
  const update = useFrappeUpdateDoc<PaymentTerm>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<PaymentTerm>) => create.createDoc("Payment Term", values as PaymentTerm),
    updateDoc: (name: string, values: Partial<PaymentTerm>) => update.updateDoc("Payment Term", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Payment Term", name),
    loading: create.loading || update.loading || del.loading,
  };
}

// ------------------------------------------------------------- Mode of Payment

export function useModesOfPayment(enabled = true) {
  return useFrappeGetDocList<ModeOfPayment>(
    "Mode of Payment",
    {
      fields: ["name", "mode_of_payment", "type", "enabled"],
      limit: 0,
      orderBy: { field: "name", order: "asc" },
    },
    enabled ? "micromax.modes-of-payment" : null,
  );
}

/** Create / update / delete for the Mode of Payment doctype. */
export function useModeOfPaymentMutations() {
  const create = useFrappeCreateDoc<ModeOfPayment>();
  const update = useFrappeUpdateDoc<ModeOfPayment>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<ModeOfPayment>) => create.createDoc("Mode of Payment", values as ModeOfPayment),
    updateDoc: (name: string, values: Partial<ModeOfPayment>) => update.updateDoc("Mode of Payment", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Mode of Payment", name),
    loading: create.loading || update.loading || del.loading,
  };
}

// ------------------------------------------------------------------ Tax Templates

/** Sales or Purchase Taxes and Charges Template list. */
export function useTaxTemplates(
  doctype: "Sales Taxes and Charges Template" | "Purchase Taxes and Charges Template",
  company?: string,
  enabled = true,
) {
  return useFrappeGetDocList<TaxTemplate>(
    doctype,
    {
      fields: ["name", "title", "company", "is_default", "disabled", "tax_category"],
      filters: (company ? [["company", "=", company]] : []) as any,
      limit: 0,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.tax-templates.${doctype}.${company ?? "all"}` : null,
  );
}

/** Create / update / delete for a Sales/Purchase Taxes and Charges Template doctype. */
export function useTaxTemplateMutations(doctype: "Sales Taxes and Charges Template" | "Purchase Taxes and Charges Template") {
  const create = useFrappeCreateDoc<TaxTemplate>();
  const update = useFrappeUpdateDoc<TaxTemplate>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<TaxTemplate>) => create.createDoc(doctype, values as TaxTemplate),
    updateDoc: (name: string, values: Partial<TaxTemplate>) => update.updateDoc(doctype, name, values),
    deleteDoc: (name: string) => del.deleteDoc(doctype, name),
    loading: create.loading || update.loading || del.loading,
  };
}

// ------------------------------------------------------------------- Journal Entry

const JE_LIST_FIELDS = [
  "name",
  "voucher_type",
  "company",
  "posting_date",
  "total_debit",
  "total_credit",
  "user_remark",
  "docstatus",
] as const;

/**
 * List Journal Entries. `limit` defaults to 200 for callers that just want "the recent ones";
 * the list page passes `limit` / `limitStart` / `orFilters` / `orderBy` (see useServerTable) to
 * page and search on the server instead — there are tens of thousands of these.
 */
export function useJournalEntries(args?: {
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
  return useFrappeGetDocList<JournalEntry>(
    "Journal Entry",
    {
      fields: JE_LIST_FIELDS as unknown as (keyof JournalEntry)[],
      filters: filters as any,
      orFilters: orFilters.length ? (orFilters as any) : undefined,
      limit_start: limitStart,
      limit,
      orderBy,
    },
    enabled ? `micromax.je.${JSON.stringify({ filters, orFilters, limit, limitStart, orderBy })}` : null,
    { keepPreviousData: true },
  );
}

export function useJournalEntry(name?: string) {
  return useFrappeGetDoc<JournalEntry>("Journal Entry", name ?? undefined, name ? `micromax.je.doc.${name}` : null);
}

export function useJournalEntryMutations() {
  const create = useFrappeCreateDoc<JournalEntry>();
  const update = useFrappeUpdateDoc<JournalEntry>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<JournalEntry>) => create.createDoc("Journal Entry", values as JournalEntry),
    updateDoc: (name: string, values: Partial<JournalEntry>) => update.updateDoc("Journal Entry", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Journal Entry", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

/** Submit a saved (draft) Journal Entry — same submit pattern used by Landed Cost Voucher. */
export async function submitJournalEntry(name: string): Promise<void> {
  const full = await postCall<JournalEntry>("frappe.client.get", { doctype: "Journal Entry", name });
  await postCall("frappe.client.submit", { doc: full });
}

/** Count of (non-cancelled) GL Entries posted for a voucher — used to confirm a submit actually posted entries. */
export async function countPostedGLEntries(voucherType: string, voucherNo: string): Promise<number> {
  const rows = await getCall<{ name: string }[]>("frappe.client.get_list", {
    doctype: "GL Entry",
    filters: JSON.stringify([
      ["voucher_type", "=", voucherType],
      ["voucher_no", "=", voucherNo],
      ["is_cancelled", "=", 0],
    ]),
    fields: JSON.stringify(["name"]),
    limit_page_length: 0,
  });
  return rows.length;
}

// -------------------------------------------------------------------- Reports

const PREPARED_REPORT_POLL_MS = 2500;

/** Order-independent snapshot of a flat filters object, for comparing two filter sets regardless of key order. */
function sortedEntries(obj: Record<string, unknown>): [string, unknown][] {
  return Object.keys(obj)
    .sort()
    .map((k) => [k, obj[k]]);
}

/**
 * Plain-async counterpart to `useQueryReport`'s prepared-report handling,
 * for callers that need to await a report result outside a hook (e.g. inside
 * a `Promise.all` over several small requests) rather than render around it.
 * `prepared_report` is a sticky flag on the Report doctype itself, not a
 * per-request decision — once any call for a report trips ERPNext's
 * execution-time threshold, *every* future call for that report name comes
 * back as `{prepared_report: true, doc: null}` regardless of how cheap that
 * particular call actually is, so this always has to be ready to enqueue and
 * poll a background job rather than assume a small request stays inline.
 */
export async function fetchReportResult(reportName: string, filters: Record<string, unknown>): Promise<QueryReportResult> {
  const initial = await getCall<{ message?: RawQueryReportResponse } & RawQueryReportResponse>("frappe.desk.query_report.run", {
    report_name: reportName,
    filters: JSON.stringify(filters),
  });
  const raw = initial.message ?? initial;
  if (raw.result) return raw as QueryReportResult;

  let docName = raw.doc?.name;
  if (!docName) {
    // Reuse an already-running job for the same report+filters instead of
    // enqueueing a duplicate one (see useQueryReport for why).
    const inFlight = await getCall<{ name: string; filters: string }[]>("frappe.client.get_list", {
      doctype: "Prepared Report",
      filters: JSON.stringify([
        ["report_name", "=", reportName],
        ["status", "in", ["Queued", "Started"]],
      ]),
      fields: JSON.stringify(["name", "filters"]),
      order_by: "creation desc",
      limit_page_length: 10,
    });
    const target = sortedEntries(filters);
    const match = inFlight.find((d) => {
      try {
        return JSON.stringify(sortedEntries(JSON.parse(d.filters))) === JSON.stringify(target);
      } catch {
        return false;
      }
    });
    docName = match
      ? match.name
      : (
          await postCall<{ name: string }>("frappe.core.doctype.prepared_report.prepared_report.make_prepared_report", {
            report_name: reportName,
            filters: JSON.stringify(filters),
          })
        ).name;
  }

  for (;;) {
    const res = await http.get<{ data: PreparedReportDoc }>(`/api/resource/Prepared Report/${encodeURIComponent(docName)}`);
    const status = res.data.data.status;
    if (status === "Completed") break;
    if (status === "Error" || status === "Failed") {
      throw new Error("Report generation failed on the server. Try again or check the Prepared Report log.");
    }
    await new Promise((r) => setTimeout(r, PREPARED_REPORT_POLL_MS));
  }

  const final = await getCall<{ message?: RawQueryReportResponse } & RawQueryReportResponse>("frappe.desk.query_report.run", {
    report_name: reportName,
    filters: JSON.stringify(filters),
  });
  return (final.message ?? final) as QueryReportResult;
}

/**
 * Run any standard ERPNext script report (General Ledger, Trial Balance,
 * Profit and Loss Statement, Balance Sheet, ...) via the same engine the
 * Frappe desk itself uses — no reimplementation of accounting rollups here,
 * the server computes it and we just render `columns`/`result`.
 *
 * Some reports on a given site are configured as a background "Prepared
 * Report" (heavy reports the admin has flagged to run as a job rather than
 * inline) — `run` alone then returns no data at all, just
 * `{prepared_report: true, doc: null}`. When that happens this kicks off
 * generation (`prepared_report.make_prepared_report`), polls the job's
 * status, and re-runs once it completes — callers see this only as
 * `isPreparing` staying true a little longer than a normal `isLoading`.
 */
export function useQueryReport(reportName: string, filters: Record<string, unknown>, enabled = true) {
  const key = enabled ? `micromax.report.${reportName}.${JSON.stringify(filters)}` : null;
  const { data, isLoading, error, mutate } = useFrappeGetCall<{ message: RawQueryReportResponse } | RawQueryReportResponse>(
    "frappe.desk.query_report.run",
    { report_name: reportName, filters: JSON.stringify(filters) },
    key,
  );
  const raw = data as { message?: RawQueryReportResponse } & RawQueryReportResponse | undefined;
  const initial: RawQueryReportResponse | undefined = raw?.message ?? raw;

  const pending = Boolean(initial?.prepared_report && !initial?.result);

  const [resolved, setResolved] = useState<QueryReportResult | undefined>(undefined);
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<Error | null>(null);
  const startedForKey = useRef<string | null>(null);

  useEffect(() => {
    if (!key) return;
    if (!pending) {
      if (initial?.result) setResolved(initial as QueryReportResult);
      return;
    }
    if (startedForKey.current === key) return; // already generating/polling this exact filter set
    startedForKey.current = key;
    setIsPreparing(true);
    setPrepareError(null);
    setResolved(undefined);

    let cancelled = false;
    (async () => {
      try {
        let docName = initial?.doc?.name;
        if (!docName) {
          // Reuse an already-running job for the same report+filters instead
          // of blindly enqueueing another one — remounting this hook (e.g.
          // switching report tabs and back while a job is still generating)
          // would otherwise spawn a redundant background job every time,
          // competing with itself for the same worker and slowing everyone
          // down. Compared key-by-key (not by raw string) since the server
          // may re-serialize the stored `filters` JSON in a different key
          // order than we sent it.
          const inFlight = await getCall<{ name: string; filters: string }[]>("frappe.client.get_list", {
            doctype: "Prepared Report",
            filters: JSON.stringify([
              ["report_name", "=", reportName],
              ["status", "in", ["Queued", "Started"]],
            ]),
            fields: JSON.stringify(["name", "filters"]),
            order_by: "creation desc",
            limit_page_length: 10,
          });
          const target = sortedEntries(filters);
          const match = inFlight.find((d) => {
            try {
              return JSON.stringify(sortedEntries(JSON.parse(d.filters))) === JSON.stringify(target);
            } catch {
              return false;
            }
          });
          if (match) {
            docName = match.name;
          } else {
            const enqueued = await postCall<{ name: string }>(
              "frappe.core.doctype.prepared_report.prepared_report.make_prepared_report",
              { report_name: reportName, filters: JSON.stringify(filters) },
            );
            docName = enqueued.name;
          }
        }
        while (!cancelled) {
          const res = await http.get<{ data: PreparedReportDoc }>(
            `/api/resource/Prepared Report/${encodeURIComponent(docName)}`,
          );
          const status = res.data.data.status;
          if (status === "Completed") break;
          if (status === "Error" || status === "Failed") {
            throw new Error("Report generation failed on the server. Try again or check the Prepared Report log.");
          }
          await new Promise((r) => setTimeout(r, PREPARED_REPORT_POLL_MS));
        }
        if (!cancelled) {
          // Fetch the now-completed report directly rather than relying on
          // `mutate()` re-triggering a network call — the SWR layer treats
          // the earlier `{prepared_report: true, doc: null}` response as
          // valid cached data for this key, so a plain revalidation call is
          // not guaranteed to actually refetch.
          const final = await getCall<RawQueryReportResponse>("frappe.desk.query_report.run", {
            report_name: reportName,
            filters: JSON.stringify(filters),
          });
          if (!cancelled) setResolved(final as QueryReportResult);
          void mutate(); // best-effort: keep the SWR cache in sync too
        }
      } catch (e) {
        if (!cancelled) setPrepareError(e as Error);
      } finally {
        if (!cancelled) setIsPreparing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pending]);

  const result: QueryReportResult | undefined = pending ? resolved : (initial as QueryReportResult | undefined);

  return {
    data: result,
    isLoading: isLoading || isPreparing,
    isPreparing,
    error: prepareError ?? error,
    mutate,
  };
}

/** One calendar month's root-level (indent 0) account activity, keyed by account name. */
export interface MonthlyRootActivity {
  month: string;
  totals: Record<string, { debit: number; credit: number }>;
}

function buildMonthRanges(fromDate: string, toDate: string) {
  // `fromDate`/`toDate` are plain ERPNext dates (`YYYY-MM-DD`), parsed by JS
  // as UTC midnight — so every subsequent calculation stays in UTC too,
  // rather than mixing in the viewer's own local calendar via `getMonth()`/
  // `new Date(y, m, d)`, which would shift the range by a day for anyone
  // west of UTC.
  const start0 = new Date(fromDate);
  const rangeEnd = new Date(toDate);
  const months: { from: string; to: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const monthStart = new Date(Date.UTC(start0.getUTCFullYear(), start0.getUTCMonth() + i, 1));
    if (monthStart > rangeEnd) break;
    const monthEnd = new Date(Date.UTC(start0.getUTCFullYear(), start0.getUTCMonth() + i + 1, 0));
    const clampedStart = monthStart < start0 ? start0 : monthStart;
    const clampedEnd = monthEnd > rangeEnd ? rangeEnd : monthEnd;
    months.push({
      from: clampedStart.toISOString().slice(0, 10),
      to: clampedEnd.toISOString().slice(0, 10),
      label: monthStart.toLocaleDateString("en-US", { timeZone: APP_TIME_ZONE, month: "short", year: "numeric" }),
    });
  }
  return months;
}

/**
 * Cheap month-by-month trend for the Trial Balance chart, built from N small
 * Trial Balance calls (one per calendar month in the range) rather than one
 * `General Ledger` call for every raw posting across the whole range.
 *
 * Trial Balance is already a server-aggregated per-account snapshot (the
 * same report this page uses for its own totals) — a single month of it is
 * cheap regardless of how much history the account has, unlike fetching
 * every GL row for a full fiscal year, which is what pushed `General Ledger`
 * into background "Prepared Report" mode for accounts with heavy activity.
 */
export function useMonthlyTrialBalanceTrend(
  company: string | undefined,
  fiscalYear: string | undefined,
  fromDate: string | undefined,
  toDate: string | undefined,
  enabled = true,
) {
  const months = useMemo(() => (fromDate && toDate ? buildMonthRanges(fromDate, toDate) : []), [fromDate, toDate]);
  const key =
    enabled && company && fiscalYear && months.length > 0 ? `micromax.report.monthly-trial-balance.${company}.${fiscalYear}.${fromDate}.${toDate}` : null;

  const { data, error, isLoading, mutate } = useSWR<MonthlyRootActivity[]>(key, async () => {
    // Sequential, not `Promise.all` — firing all N months at once against the
    // same "Trial Balance" report concurrently was enough load on its own to
    // make individual executions cross Frappe's 15s auto-"Prepared Report"
    // threshold (a self-inflicted version of the exact problem this
    // month-by-month approach was meant to avoid — see the comment at the
    // call site). One at a time keeps each call fast and never trips it.
    const responses: Awaited<ReturnType<typeof fetchReportResult>>[] = [];
    for (const m of months) {
      // Trial Balance requires `fiscal_year` even when from_date/to_date
      // narrow the window — it's the fiscal year the whole page has
      // selected, not a per-month value, since from_date/to_date already
      // pin the actual range each call covers.
      responses.push(
        await fetchReportResult("Trial Balance", { company, fiscal_year: fiscalYear, from_date: m.from, to_date: m.to, show_group_accounts: 1 }),
      );
    }
    return months.map((m, i) => {
      const rows = (responses[i]?.result ?? []) as Record<string, unknown>[];
      const totals: Record<string, { debit: number; credit: number }> = {};
      rows.forEach((r) => {
        if (!r || typeof r.account !== "string" || Number(r.indent) !== 0) return;
        totals[r.account] = { debit: asNumber(r.debit), credit: asNumber(r.credit) };
      });
      return { month: m.label, totals };
    });
  });

  return { data, isLoading, error, mutate };
}
