import { LedgerSummary } from "./ledger-summary";
import { ReportInsights } from "@/components/doc/report-insights";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SlidersHorizontal, ChevronUp, ChevronDown, Play } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingOverlay } from "@/components/common/loading-overlay";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { FrappeLinkField } from "@/components/forms/field-primitives";
import { useFrappeGetCall } from "frappe-react-sdk";
import { useQueryReport } from "@/hooks/useAccounting";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { formatNumber } from "@/utils/currency";
import { asNumber, cn } from "@/utils/cn";
import { todayISO, startOfMonthISO } from "@/utils/dates";
import { humanizeError } from "@/services/frappe";
import type { QueryReportColumn } from "@/types/frappe";

/** Real filter checkboxes -> the exact filter keys erpnext.accounts.report.general_ledger.general_ledger reads. */
const GL_OPTIONS: { key: string; label: string; def: boolean }[] = [
  { key: "include_dimensions", label: "Consider accounting dimensions", def: true },
  { key: "disable_opening_balance_calculation", label: "Disable opening balance calculation", def: false },
  { key: "show_opening_entries", label: "Show opening entries", def: true },
  { key: "include_default_book_entries", label: "Include default finance book entries", def: true },
  { key: "show_cancelled_entries", label: "Show cancelled entries", def: false },
  { key: "show_net_values_in_party_account", label: "Show net values in party account", def: false },
  { key: "show_amount_in_company_currency", label: "Show credit / debit in company currency", def: false },
  { key: "add_values_in_transaction_currency", label: "Add columns in transaction currency", def: false },
  { key: "show_remarks", label: "Show remarks", def: false },
  { key: "ignore_err", label: "Ignore exchange rate revaluation journals", def: false },
  { key: "ignore_cr_dr_notes", label: "Ignore system generated credit / debit notes", def: false },
];

const PARTY_TYPES = ["Customer", "Supplier", "Employee", "Shareholder"];

// Columns the app doesn't surface by default (internal id / low-signal dupes) —
// still real report columns, just a click away via the grid's own Columns picker.
const HIDE_BY_DEFAULT = new Set(["gl_entry", "party_type", "against_voucher_type", "against_voucher", "bill_no"]);

const NUMERIC_TYPES = new Set(["Currency", "Float", "Int"]);

// voucher_type -> the detail route this app has for it. voucher_no links only
// go live for types we actually have a page for; everything else stays plain text.
const VOUCHER_TYPE_ROUTES: Record<string, string> = {
  "Journal Entry": "/accounting/journal-entries",
  "Payment Entry": "/accounting/payment-entries",
  "Purchase Invoice": "/purchase/invoices",
  "Purchase Receipt": "/purchase/receipts",
  "Purchase Order": "/import/purchase-orders",
  "Landed Cost Voucher": "/purchase/landed-costs",
};

function isSpecialRow(r: Record<string, unknown>): boolean {
  return typeof r.account === "string" && r.account.startsWith("'") && r.account.endsWith("'");
}
function specialLabel(r: Record<string, unknown>): string {
  return String(r.account).slice(1, -1);
}

/** GL `balance` is already a running (debit - credit) figure — positive is a debit balance, negative a credit one, no root-type netting needed (unlike Trial Balance's per-head totals). */
function balanceWithDrCr(n: number): string {
  return `${formatNumber(Math.abs(n), 2)} ${n >= 0 ? "Dr" : "Cr"}`;
}

/**
 * General Ledger — every GL Entry in a date range, delegated to ERPNext's own
 * report engine (`frappe.desk.query_report.run`). Filters map 1:1 onto the
 * real filter keys the Python report reads, so results match ERPNext's own
 * desk report exactly; nothing here recomputes debit/credit/balance.
 */
export function ReportGeneralLedgerPage() {
  const navigate = useNavigate();
  const { company, setCompany } = useCompanyContext();

  const [searchParams] = useSearchParams();
  const voucherNoParam = searchParams.get("voucher_no") ?? "";
  const companyParam = searchParams.get("company") ?? "";
  // Drill-downs from Trial Balance / P&L / Balance Sheet link here with an account and their period.
  const accountParam = searchParams.get("account") ?? "";
  const fromParam = searchParams.get("from_date") ?? "";
  const toParam = searchParams.get("to_date") ?? "";

  const [filtersOpen, setFiltersOpen] = useState(true);
  // Arriving with a specific voucher to look up (e.g. "View Ledger" from a
  // Journal Entry) — widen the default range so the voucher's own posting
  // date is never accidentally excluded by the usual fiscal-year default.
  const [fromDate, setFromDate] = useState(fromParam || (voucherNoParam ? "2000-01-01" : ""));
  const [toDate, setToDate] = useState(toParam || todayISO());
  const [financeBook, setFinanceBook] = useState("");
  const [account, setAccount] = useState(accountParam);
  const [voucherType, setVoucherType] = useState("");
  const [voucherNo, setVoucherNo] = useState(voucherNoParam);
  const [partyType, setPartyType] = useState("");
  const [party, setParty] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [project, setProject] = useState("");
  const [opts, setOpts] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GL_OPTIONS.map((o) => [o.key, o.def])),
  );

  // Filter choices come from the selected company's own ledger: its parties and its voucher numbers.
  const [voucherQuery, setVoucherQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setVoucherQuery(voucherNo.trim()), 250);
    return () => clearTimeout(t);
  }, [voucherNo]);
  const { data: partyOpts } = useFrappeGetCall<{ message: { parties: string[] } }>(
    "sugarcane.erp_insights.gl.gl_filter_options",
    { company, party_type: partyType },
    company && partyType ? `gl-parties-${company}-${partyType}` : null,
  );
  const { data: voucherOpts } = useFrappeGetCall<{ message: { vouchers: { voucher_no: string; voucher_type: string }[] } }>(
    "sugarcane.erp_insights.gl.gl_filter_options",
    { company, txt: voucherQuery },
    company && voucherQuery.length >= 2 ? `gl-vouchers-${company}-${voucherQuery}` : null,
  );
  const partyChoices = partyOpts?.message?.parties ?? [];
  const voucherChoices = voucherOpts?.message?.vouchers ?? [];

  // A different company invalidates company-specific picks.
  const firstCompany = useRef(company);
  useEffect(() => {
    if (firstCompany.current === company) return;
    firstCompany.current = company;
    setAccount("");
    setCostCenter("");
    setParty("");
    setVoucherNo("");
    setVoucherType("");
    setProject("");
  }, [company]);

  // Default to the current month, not the full fiscal year — General Ledger
  // has no account/voucher scoping by default, and a whole fiscal year of
  // every posting for every account is exactly the kind of unfiltered,
  // hundreds-of-thousands-of-rows query that can cross Frappe's own 15s
  // "auto-promote to background Prepared Report" threshold. That flag is
  // shared by every call to this report (not just this one), so tripping it
  // here would also slow down a since-scoped "View Ledger" lookup elsewhere.
  // The user can still widen the range themselves if they want a bigger pull.
  useEffect(() => {
    if (!voucherNoParam && !fromDate) {
      setFromDate(startOfMonthISO());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate]);

  // Sync the global company selector once, if a different company arrived via URL.
  useEffect(() => {
    if (companyParam && companyParam !== company) setCompany(companyParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyParam]);

  const filters = useMemo(
    () => ({
      company,
      from_date: fromDate,
      to_date: toDate,
      finance_book: financeBook || undefined,
      account: account ? [account] : undefined,
      voucher_no: voucherNo || undefined,
      party_type: partyType || undefined,
      party: partyType && party ? [party] : undefined,
      cost_center: costCenter ? [costCenter] : undefined,
      project: project ? [project] : undefined,
      ...opts,
    }),
    [company, fromDate, toDate, financeBook, account, voucherNo, partyType, party, costCenter, project, opts],
  );

  // General Ledger pulls every raw posting in the range — expensive for a
  // wide date range or "all accounts" — so it only runs when the user
  // explicitly clicks Generate, not on every filter change. Changing any
  // filter afterwards invalidates the last run (rather than silently
  // re-running with new filters) so a stale result is never mistaken for
  // the current selection.
  const [generatedFiltersKey, setGeneratedFiltersKey] = useState<string | null>(null);
  const filtersKey = JSON.stringify(filters);
  const hasGenerated = generatedFiltersKey === filtersKey;

  const { data, error, isLoading, isPreparing, mutate } = useQueryReport(
    "General Ledger",
    filters,
    Boolean(company && fromDate && toDate && hasGenerated),
  );

  const allRows = (data?.result ?? []).filter((r) => r && Object.keys(r).length > 0);
  const openingRow = allRows.find((r) => isSpecialRow(r) && specialLabel(r) === "Opening");
  const totalRow = allRows.find((r) => isSpecialRow(r) && specialLabel(r) === "Total");
  // Same row, just with the account field's literal `'Total'` quoting
  // stripped for display in the table's own footer.
  const footerTotalRow = totalRow ? { ...totalRow, account: "Total" } : undefined;
  const closingRow = allRows.find((r) => isSpecialRow(r) && specialLabel(r).startsWith("Closing"));
  const entryRows = allRows.filter((r) => !isSpecialRow(r));

  const filteredRows = useMemo(
    () => (voucherType ? entryRows.filter((r) => r.voucher_type === voucherType) : entryRows),
    [entryRows, voucherType],
  );

  const voucherTypeOptions = useMemo(
    () => [...new Set(entryRows.map((r) => String(r.voucher_type ?? "")).filter(Boolean))].sort(),
    [entryRows],
  );

  // Grouped off every entry (not the voucher-type-filtered `filteredRows`) so
  // the breakdown stays meaningful even once the user has narrowed the table
  // to a single voucher type — otherwise it would just show that one row.
  const voucherTypeSummary = useMemo(() => {
    const byType = new Map<string, { count: number; debit: number; credit: number }>();
    entryRows.forEach((r) => {
      const vt = String(r.voucher_type ?? "—") || "—";
      const bucket = byType.get(vt) ?? { count: 0, debit: 0, credit: 0 };
      bucket.count += 1;
      bucket.debit += asNumber(r.debit);
      bucket.credit += asNumber(r.credit);
      byType.set(vt, bucket);
    });
    return [...byType.entries()]
      .map(([voucherType, v]) => ({ voucherType, ...v, net: v.debit - v.credit }))
      .sort((a, b) => b.debit + b.credit - (a.debit + a.credit));
  }, [entryRows]);

  const columns: QueryReportColumn[] = (data?.columns ?? []).filter((c) => !c.hidden);

  const tableColumns: ColumnDef<Record<string, unknown>>[] = useMemo(
    () =>
      columns.map((c) => {
        const numeric = NUMERIC_TYPES.has(c.fieldtype ?? "");
        return {
          key: c.fieldname,
          label: c.label,
          align: numeric ? "right" : "left",
          // Same green/amber convention as the Debit/Credit summary cards above.
          cellClassName:
            c.fieldname === "debit"
              ? "text-emerald-600 dark:text-emerald-400"
              : c.fieldname === "credit"
              ? "text-amber-600 dark:text-amber-400"
              : undefined,
          getValue: (r) => {
            const v = r[c.fieldname];
            return typeof v === "number" || typeof v === "string" ? v : String(v ?? "");
          },
          render: (r) => {
            const v = r[c.fieldname];
            if (v === null || v === undefined || v === "") return "—";
            if (numeric) return formatNumber(asNumber(v), c.fieldtype === "Int" ? 0 : 2);
            if (c.fieldtype === "Date") return String(v);
            if (c.fieldname === "voucher_no") {
              const routeBase = VOUCHER_TYPE_ROUTES[String(r.voucher_type ?? "")];
              if (routeBase) {
                return (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`${routeBase}/${encodeURIComponent(String(v))}`);
                    }}
                  >
                    {String(v)}
                  </button>
                );
              }
            }
            return String(v);
          },
        };
      }),
    [columns, navigate],
  );

  const totalDebit = totalRow ? asNumber(totalRow.debit) : filteredRows.reduce((s, r) => s + asNumber(r.debit), 0);
  const totalCredit = totalRow ? asNumber(totalRow.credit) : filteredRows.reduce((s, r) => s + asNumber(r.credit), 0);
  const openingBalance = openingRow ? asNumber(openingRow.balance) : 0;
  const closingBalance = closingRow
    ? asNumber(closingRow.balance)
    : filteredRows.length
    ? asNumber(filteredRows[filteredRows.length - 1].balance)
    : 0;

  const activeFilterCount =
    [financeBook, account, voucherType, voucherNo, partyType, costCenter, project].filter(Boolean).length +
    Object.values(opts).filter(Boolean).length;

  const clearFilters = () => {
    setFinanceBook("");
    setAccount("");
    setVoucherType("");
    setVoucherNo("");
    setPartyType("");
    setParty("");
    setCostCenter("");
    setProject("");
    setOpts(Object.fromEntries(GL_OPTIONS.map((o) => [o.key, o.def])));
    setGeneratedFiltersKey(null);
  };

  const generateLedger = () => setGeneratedFiltersKey(filtersKey);

  // Clicking an account in "Summary by account" re-opens this same page with new URL filters — apply them
  // (the component stays mounted, so its initial state alone would miss the change) and run again.
  useEffect(() => {
    if (!accountParam) return;
    setAccount(accountParam);
    if (fromParam) setFromDate(fromParam);
    if (toParam) setToDate(toParam);
    autoRan.current = false;
    setFiltersOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountParam, fromParam, toParam]);

  // Deep-linked with a voucher_no (e.g. "View Ledger" from a Journal Entry) —
  // run automatically once we have everything the report needs, and collapse
  // the filters panel since the user came here to see results, not tweak inputs.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !(voucherNoParam || accountParam)) return;
    if (!company || !fromDate || !toDate) return;
    autoRan.current = true;
    setGeneratedFiltersKey(filtersKey);
    setFiltersOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherNoParam, accountParam, company, fromDate, toDate, filtersKey]);

  return (
    <div className="space-y-4">
      <LoadingOverlay show={isPreparing} label="Generating General Ledger…" />
      <PageHeader title="General Ledger" subtitle="Every posted GL entry, account by account — computed live by ERPNext" />

      {!company ? (
        <EmptyState title="No company selected" description="Choose a company from the header to run this report." />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                Filters
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                  {activeFilterCount} active
                </span>
              </span>
              {filtersOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {filtersOpen && (
              <div className="border-t border-border p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label htmlFor="gl-from">From Date</Label>
                    <Input
                      id="gl-from"
                      type="date"
                      value={fromDate}
                      max={toDate || undefined}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="gl-to">To Date</Label>
                    <Input
                      id="gl-to"
                      type="date"
                      value={toDate}
                      min={fromDate || undefined}
                      onChange={(e) => setToDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Finance Book</Label>
                    <FrappeLinkField
                      meta={{ fieldname: "finance_book", label: "Finance Book", fieldtype: "Link", options: "Finance Book", placeholder: "All books" }}
                      value={financeBook}
                      onChange={setFinanceBook}
                    />
                  </div>
                  <div>
                    <Label>Account</Label>
                    <FrappeLinkField
                      meta={{ fieldname: "account", label: "Account", fieldtype: "Link", options: "Account", placeholder: "All accounts", filters: company ? [["company", "=", company]] : [] }}
                      value={account}
                      onChange={setAccount}
                    />
                  </div>
                  <div>
                    <Label htmlFor="gl-voucher-no">Voucher No</Label>
                    <Input
                      id="gl-voucher-no"
                      value={voucherNo}
                      list="gl-voucher-options"
                      autoComplete="off"
                      placeholder="Type 2+ characters to search this company's vouchers"
                      onChange={(e) => setVoucherNo(e.target.value)}
                    />
                    <datalist id="gl-voucher-options">
                      {voucherChoices.map((v) => (
                        <option key={v.voucher_no} value={v.voucher_no}>
                          {v.voucher_type}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <Label htmlFor="gl-voucher-type">Voucher Type</Label>
                    <Select id="gl-voucher-type" value={voucherType} onChange={(e) => setVoucherType(e.target.value)}>
                      <option value="">All types</option>
                      {voucherTypeOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="gl-party-type">Party Type</Label>
                    <Select
                      id="gl-party-type"
                      value={partyType}
                      onChange={(e) => {
                        setPartyType(e.target.value);
                        setParty("");
                      }}
                    >
                      <option value="">Any party</option>
                      {PARTY_TYPES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Party</Label>
                    <Select value={party} onChange={(e) => setParty(e.target.value)} disabled={!partyType}>
                      <option value="">{partyType ? `All ${partyType.toLowerCase()}s (${partyChoices.length} in this company)` : "Choose a party type first"}</option>
                      {partyChoices.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Cost Center</Label>
                    <FrappeLinkField
                      meta={{ fieldname: "cost_center", label: "Cost Center", fieldtype: "Link", options: "Cost Center", placeholder: "All cost centers", filters: company ? [["company", "=", company]] : [] }}
                      value={costCenter}
                      onChange={setCostCenter}
                    />
                  </div>
                  <div>
                    <Label>Project</Label>
                    <FrappeLinkField
                      meta={{ fieldname: "project", label: "Project", fieldtype: "Link", options: "Project", placeholder: "All projects" }}
                      value={project}
                      onChange={setProject}
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
                  {GL_OPTIONS.map((o) => (
                    <Checkbox
                      key={o.key}
                      label={o.label}
                      checked={!!opts[o.key]}
                      onChange={(e) => setOpts((prev) => ({ ...prev, [o.key]: e.target.checked }))}
                    />
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear all
                  </Button>
                  <Button variant="primary" size="sm" onClick={generateLedger} disabled={!company || !fromDate || !toDate}>
                    <Play className="h-4 w-4" />
                    Generate Ledger
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {!hasGenerated ? (
            <EmptyState
              title="Set your filters and generate"
              description="Every posted GL entry in the range gets pulled straight from ERPNext — narrow it down by date and account first, then click Generate Ledger to run it."
              actionLabel="Generate Ledger"
              onAction={company && fromDate && toDate ? generateLedger : undefined}
            />
          ) : (
            <>
              <LedgerSummary
                opening={openingBalance}
                debit={totalDebit}
                credit={totalCredit}
                closing={closingBalance}
                entries={filteredRows.length}
                loading={isLoading}
                scope={account || (party ? `${partyType}: ${party}` : voucherNo || "all accounts")}
              />
              <ReportInsights report="gl" company={company} fromDate={fromDate} toDate={toDate} omitTiles hideBars collapsible title="Ledger insights" extra={{ account: account || undefined, party_type: partyType || undefined, party: party || undefined, voucher_no: voucherNo || undefined }} />

              <FrappeDataTable
                columns={tableColumns}
                rows={filteredRows}
                rowKey={(r) => String(r.gl_entry)}
                loading={isLoading}
                error={error}
                onRetry={() => void mutate()}
                searchPlaceholder="Search account, voucher, party, remarks…"
                exportFilename="general-ledger"
                title="Ledger Entries"
                subtitle={`${filteredRows.length} entries${totalRow ? "" : " (partial totals — no report summary row for this filter set)"}`}
                emptyTitle="No GL entries"
                emptyDescription={error ? humanizeError(error) : "No GL entries posted in this date range for the selected filters."}
                initialPageSize={25}
                pageSizeOptions={[25, 50, 100]}
                defaultHiddenColumns={columns.filter((c) => HIDE_BY_DEFAULT.has(c.fieldname)).map((c) => c.fieldname)}
                defaultSortKey="posting_date"
                striped
                frozenColumns={5}
                totalRow={footerTotalRow}
              />

              {!isLoading && !error && voucherTypeSummary.length > 0 && (
                <Card className="overflow-hidden p-0">
                  <div className="border-b border-border px-4 py-3">
                    <h3 className="text-sm font-semibold">Summary by Voucher Type</h3>
                    <p className="text-xs text-muted-foreground">Every entry in range, grouped by voucher type — independent of the Voucher Type filter above</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-left">
                          <th className="whitespace-nowrap px-4 py-2 text-xs font-semibold text-muted-foreground">Voucher Type</th>
                          <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-semibold text-muted-foreground">Entries</th>
                          <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-semibold text-muted-foreground">Debit</th>
                          <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-semibold text-muted-foreground">Credit</th>
                          <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-semibold text-muted-foreground">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {voucherTypeSummary.map((v, i) => (
                          <tr key={v.voucherType} className={cn("border-b border-border last:border-0", i % 2 === 1 && "bg-accent/40")}>
                            <td className="px-4 py-2 font-medium">{v.voucherType}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{v.count}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{formatNumber(v.debit, 2)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{formatNumber(v.credit, 2)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{balanceWithDrCr(v.net)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
