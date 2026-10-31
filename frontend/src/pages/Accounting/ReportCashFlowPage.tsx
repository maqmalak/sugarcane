import { ReportInsights } from "@/components/doc/report-insights";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ChevronsDownUp,
  Download,
  Repeat,
  Building2,
  Landmark,
  Wallet,
  SlidersHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FrappeLinkField } from "@/components/forms/field-primitives";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingOverlay } from "@/components/common/loading-overlay";
import { KpiCard } from "@/pages/Dashboard/KpiCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartCard } from "@/components/charts/chart-card";
import { BarChart } from "@/components/charts/charts";
import { useQueryReport, useFiscalYears } from "@/hooks/useAccounting";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { formatNumber } from "@/utils/currency";
import { asNumber, cn } from "@/utils/cn";
import { clampToToday } from "@/utils/dates";
import { exportToCsv } from "@/utils/export";
import { humanizeError } from "@/services/frappe";
import type { QueryReportColumn } from "@/types/frappe";

interface CashFlowRow {
  section?: string;
  account?: string;
  section_name?: string;
  parent_section?: string | null;
  indent?: number;
  currency?: string;
  total?: number;
  [periodKey: string]: unknown;
}

const PERIODICITIES = ["Yearly", "Half-Yearly", "Quarterly", "Monthly"];

/** Only filters `erpnext.accounts.report.cash_flow` actually reads (unlike Balance Sheet/P&L it has no show_zero_values or accounting-dimensions filter). */
const CF_OPTIONS: { key: string; label: string; def: boolean }[] = [
  { key: "accumulated_values", label: "Accumulated values", def: true },
  { key: "include_default_book_entries", label: "Include default finance book entries", def: true },
  { key: "show_opening_and_closing_balance", label: "Show opening and closing balance", def: false },
];

const money = (n: number) => (n ? formatNumber(n, 2) : "—");

/** Strip the single-quote wrapping Cash Flow puts around section/total-row labels (`"'Net Cash from Operations'"` -> `"Net Cash from Operations"`). */
function cleanLabel(raw: string): string {
  return raw.replace(/^'|'$/g, "");
}

/**
 * Row shapes coming back from `cash_flow.py`:
 *  - section header: `indent: 0`, `parent_section: null` — collapsible, has account-type children below it.
 *  - account-type detail: `indent: 1`, `parent_section: <header name>`.
 *  - section/grand total ("Net Cash from Operations", "Net Change in Cash", Opening/Closing): no `indent` key at all, label single-quoted.
 *  - blank separator: `{}` (dropped).
 */
function rowKind(r: CashFlowRow): "header" | "detail" | "total" {
  if (r.indent === 1) return "detail";
  if (r.indent === 0 && r.parent_section === null) return "header";
  return "total";
}

/** Hide only a collapsed section header's own indent-1 children — resumes at that section's total row or the next header. */
function visibleRows(rows: CashFlowRow[], collapsed: Set<string>): CashFlowRow[] {
  const out: CashFlowRow[] = [];
  let hiding = false;
  for (const r of rows) {
    const kind = rowKind(r);
    if (hiding && kind === "detail") continue;
    hiding = false;
    out.push(r);
    if (kind === "header" && collapsed.has(cleanLabel(r.section ?? ""))) hiding = true;
  }
  return out;
}

/**
 * Cash Flow — operating, investing and financing movement for the selected
 * range, computed by ERPNext's own `erpnext.accounts.report.cash_flow`
 * engine (net profit/loss plus account-type-based working-capital, fixed
 * asset and equity movement). Nothing here is re-derived; the four summary
 * tiles come straight from the report's own `report_summary`.
 */
export function ReportCashFlowPage() {
  const { company, companyCurrency } = useCompanyContext();
  const { data: fiscalYears } = useFiscalYears();
  const [fiscalYear, setFiscalYear] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [periodicity, setPeriodicity] = useState("Yearly");
  const [costCenter, setCostCenter] = useState("");
  const [project, setProject] = useState("");
  const [financeBook, setFinanceBook] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [opts, setOpts] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CF_OPTIONS.map((o) => [o.key, o.def])),
  );

  const activeFilterCount = [financeBook, costCenter, project].filter(Boolean).length + Object.values(opts).filter(Boolean).length;

  useEffect(() => {
    if (fiscalYears && fiscalYears.length > 0 && !fiscalYear) setFiscalYear(fiscalYears[0].name);
  }, [fiscalYears, fiscalYear]);

  const fyMeta = fiscalYears?.find((fy) => fy.name === fiscalYear);

  useEffect(() => {
    if (fyMeta?.year_start_date && fyMeta?.year_end_date) {
      setFromDate(fyMeta.year_start_date);
      setToDate(clampToToday(fyMeta.year_end_date) ?? fyMeta.year_end_date);
    }
  }, [fyMeta?.year_start_date, fyMeta?.year_end_date]);

  const filters = useMemo(
    () => ({
      company,
      filter_based_on: "Date Range",
      period_start_date: fromDate,
      period_end_date: toDate,
      periodicity,
      cost_center: costCenter || undefined,
      project: project ? [project] : undefined,
      finance_book: financeBook || undefined,
      ...opts,
    }),
    [company, fromDate, toDate, periodicity, costCenter, project, financeBook, opts],
  );

  // The report only (re)runs when "Generate" is clicked — changing a filter
  // above just updates the form, it doesn't refetch until the applied
  // snapshot below is explicitly refreshed.
  const [appliedFilters, setAppliedFilters] = useState<typeof filters | null>(null);
  const hasGenerated = appliedFilters !== null;
  const filtersDirty = hasGenerated && JSON.stringify(filters) !== JSON.stringify(appliedFilters);
  const generate = () => setAppliedFilters(filters);

  const { data, error, isLoading, isPreparing, mutate } = useQueryReport(
    "Cash Flow",
    appliedFilters ?? filters,
    Boolean(company && fromDate && toDate && appliedFilters),
  );

  const allRows = ((data?.result ?? []) as unknown as CashFlowRow[]).filter(
    (r) => r && (typeof r.section === "string" || typeof r.account === "string"),
  );
  const shown = visibleRows(allRows, collapsed);

  const periodColumns: QueryReportColumn[] = (data?.columns ?? []).filter(
    (c) => !c.hidden && c.fieldname !== "section" && c.fieldname !== "account",
  );
  const lastPeriodKey = periodColumns[periodColumns.length - 1]?.fieldname;

  const summary = data?.report_summary ?? [];
  const netOperating = asNumber(summary.find((s) => s.label === "Net Cash from Operations")?.value);
  const netInvesting = asNumber(summary.find((s) => s.label === "Net Cash from Investing")?.value);
  const netFinancing = asNumber(summary.find((s) => s.label === "Net Cash from Financing")?.value);
  const netChange = asNumber(summary.find((s) => s.label === "Net Change in Cash")?.value);

  // The report's own `chart` field mixes null-valued header rows in with the
  // real totals (an upstream quirk, not something worth reproducing) — a
  // clean 4-bar summary straight off `report_summary` is simpler and correct.
  // Color-coded per bar (green inflow / rose outflow) rather than one flat
  // series color, so a negative section (Investing here) reads at a glance.
  const barColor = (n: number) => (n >= 0 ? "#10b981" : "#f43f5e");
  const summaryChartData = [
    { section: "Operations", value: netOperating, color: barColor(netOperating) },
    { section: "Investing", value: netInvesting, color: barColor(netInvesting) },
    { section: "Financing", value: netFinancing, color: barColor(netFinancing) },
    { section: "Net Change", value: netChange, color: barColor(netChange) },
  ];

  const base = Math.max(Math.abs(netOperating), Math.abs(netInvesting), Math.abs(netFinancing), Math.abs(netChange)) || 1;
  const chartCurrency = allRows.find((r) => typeof r.currency === "string")?.currency ?? companyCurrency ?? "USD";

  const netChangeRow = allRows.find((r) => cleanLabel(r.section ?? "") === "Net Change in Cash");

  const toggle = (label: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () =>
    setCollapsed(new Set(allRows.filter((r) => rowKind(r) === "header").map((r) => cleanLabel(r.section ?? ""))));

  // The real report tree only ever runs 2 levels deep (section header, then
  // its account-type rows) — level 1 collapses every section to just its
  // header + subtotal, level 2+ expands everything. Kept as an explicit
  // number rather than hardwired to "collapsed"/"expanded" so a level 3+
  // still does the sane thing (fully expand) if the tree ever grows deeper.
  const [levelInput, setLevelInput] = useState(2);
  const applyLevel = (lvl: number) => {
    if (lvl <= 1) collapseAll();
    else expandAll();
  };

  // Default to Level 2 the first time each fresh report result loads —
  // guarded so it only fires once per load, not every time the user's own
  // clicks change `collapsed`. A no-op in practice today (Cash Flow's tree
  // only ever runs 2 levels deep, same as the already-expanded default),
  // kept for consistency with the other statement pages.
  const appliedDefaultLevel = useRef(false);
  useEffect(() => {
    if (allRows.length > 0 && !appliedDefaultLevel.current) {
      appliedDefaultLevel.current = true;
      applyLevel(2);
    }
    if (allRows.length === 0) appliedDefaultLevel.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows]);

  const exportRows = () => {
    const cols = [
      { key: "section", label: "Section" },
      ...periodColumns.map((c) => ({ key: c.fieldname, label: c.label })),
    ];
    const rows = allRows
      .filter((r) => r !== netChangeRow)
      .map((r) => {
        const kind = rowKind(r);
        const label = cleanLabel(r.section ?? r.account ?? "");
        return {
          section: kind === "detail" ? `  ${label}` : label,
          ...Object.fromEntries(periodColumns.map((c) => [c.fieldname, r[c.fieldname]])),
        };
      });
    exportToCsv(cols, rows, "cash-flow");
  };

  return (
    <div className="space-y-4">
      <LoadingOverlay show={isPreparing} label="Generating Cash Flow…" />
      <PageHeader
        title="Cash Flow"
        subtitle="Operating, investing and financing movement — computed live by ERPNext's report engine"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={expandAll} disabled={!allRows.length}>
              <ChevronsUpDown className="h-4 w-4" />
              Expand all
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll} disabled={!allRows.length}>
              <ChevronsDownUp className="h-4 w-4" />
              Collapse all
            </Button>
            <Button variant="primary" size="sm" onClick={exportRows} disabled={!allRows.length}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </>
        }
      />

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
                <Label htmlFor="cf-fy">Fiscal Year</Label>
                <Select id="cf-fy" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)}>
                  {(fiscalYears ?? []).map((fy) => (
                    <option key={fy.name} value={fy.name}>
                      {fy.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="cf-from">From Date</Label>
                <Input
                  id="cf-from"
                  type="date"
                  value={fromDate}
                  min={fyMeta?.year_start_date}
                  max={toDate || fyMeta?.year_end_date}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cf-to">To Date</Label>
                <Input
                  id="cf-to"
                  type="date"
                  value={toDate}
                  min={fromDate || fyMeta?.year_start_date}
                  max={fyMeta?.year_end_date}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cf-periodicity">Periodicity</Label>
                <Select id="cf-periodicity" value={periodicity} onChange={(e) => setPeriodicity(e.target.value)}>
                  {PERIODICITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
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
                <Label>Cost Center</Label>
                <FrappeLinkField
                  meta={{ fieldname: "cost_center", label: "Cost Center", fieldtype: "Link", options: "Cost Center", placeholder: "All cost centers" }}
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
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4">
              {CF_OPTIONS.map((o) => (
                <Checkbox
                  key={o.key}
                  label={o.label}
                  checked={!!opts[o.key]}
                  onChange={(e) => setOpts((prev) => ({ ...prev, [o.key]: e.target.checked }))}
                />
              ))}
              <div className="ml-auto flex items-center gap-2">
                {filtersDirty && <span className="text-xs text-muted-foreground">Filters changed — click Generate to refresh</span>}
                <Button variant="primary" size="sm" onClick={generate} disabled={!company || !fromDate || !toDate}>
                  Generate
                </Button>
              </div>
            </div>
            </div>
            )}
          </Card>

          {!hasGenerated ? (
            <EmptyState
              title="Ready to generate"
              description="Set your filters above, then click Generate to run the Cash Flow report."
              actionLabel="Generate"
              onAction={generate}
            />
          ) : error ? (
            <EmptyState title="Couldn't load Cash Flow" description={humanizeError(error)} actionLabel="Retry" onAction={() => void mutate()} />
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : allRows.length === 0 ? (
            <EmptyState title="No postings found" description="No account activity for this date range / filter set." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard
                  label="Net Cash from Operations"
                  value={money(netOperating)}
                  icon={Repeat}
                  tone={netOperating >= 0 ? "info" : "destructive"}
                  colorValue
                />
                <KpiCard
                  label="Net Cash from Investing"
                  value={money(netInvesting)}
                  icon={Building2}
                  tone={netInvesting >= 0 ? "info" : "destructive"}
                  colorValue
                />
                <KpiCard
                  label="Net Cash from Financing"
                  value={money(netFinancing)}
                  icon={Landmark}
                  tone={netFinancing >= 0 ? "info" : "destructive"}
                  colorValue
                />
                <KpiCard
                  label="Net Change in Cash"
                  value={money(netChange)}
                  icon={Wallet}
                  tone={netChange >= 0 ? "success" : "destructive"}
                  colorValue
                />
              </div>
              <ReportInsights report="cash_flow" company={company} fromDate={fromDate} toDate={toDate} currency={companyCurrency ?? undefined} omitTiles={["Operating", "Investing", "Financing"]} />

              <ChartCard
                title="Section movement"
                subtitle={`${fromDate} to ${toDate} · net cash by section`}
                actions={
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Inflow
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm bg-rose-500" /> Outflow
                    </span>
                  </div>
                }
              >
                <BarChart
                  data={summaryChartData}
                  xKey="section"
                  series={[{ key: "value", label: "Net Cash" }]}
                  colorKey="color"
                  money
                  currency={chartCurrency}
                />
              </ChartCard>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Statement</p>
                  <p className="text-xs text-muted-foreground">
                    {allRows.filter((r) => r !== netChangeRow).length} rows shown · amounts in {chartCurrency}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="cf-level" className="text-xs font-medium text-muted-foreground">
                    Level
                  </label>
                  <Input
                    id="cf-level"
                    type="number"
                    min={1}
                    max={2}
                    value={levelInput}
                    onChange={(e) => setLevelInput(Number(e.target.value) || 1)}
                    className="h-8 w-16"
                  />
                  <Button size="sm" variant="outline" onClick={() => applyLevel(levelInput)}>
                    Set Level
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-border bg-card dark:border-white/10 dark:bg-white/5">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="border-b border-border px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          Section
                        </th>
                        {periodColumns.map((c) => (
                          <th
                            key={c.fieldname}
                            className="border-b border-l border-border px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
                          >
                            {c.label}
                          </th>
                        ))}
                        <th className="w-32 border-b border-l border-border px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          Share
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown
                        .filter((r) => r !== netChangeRow)
                        .map((r, i) => {
                          const kind = rowKind(r);
                          const label = cleanLabel(r.section ?? r.account ?? "");
                          const rowValue = lastPeriodKey ? asNumber(r[lastPeriodKey]) : asNumber(r.total);
                          const share = Math.min(100, (Math.abs(rowValue) / base) * 100);
                          const isHeader = kind === "header";
                          const isTotal = kind === "total";
                          return (
                            <tr
                              key={`${label}-${i}`}
                              onClick={isHeader ? () => toggle(label) : undefined}
                              className={cn(
                                "border-b border-border/60 last:border-0",
                                isHeader && "cursor-pointer bg-muted/30 hover:bg-muted/50",
                                isTotal && "bg-muted/20",
                                !isHeader && !isTotal && "hover:bg-muted/20",
                              )}
                            >
                              <td className="px-4 py-2.5" style={{ paddingLeft: 16 + (kind === "detail" ? 26 : 0) }}>
                                <span className={cn("inline-flex items-center gap-2", (isHeader || isTotal) && "font-bold")}>
                                  {isHeader ? (
                                    collapsed.has(label) ? (
                                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    )
                                  ) : (
                                    <span className="inline-block w-3.5 shrink-0" />
                                  )}
                                  <span className={cn("truncate", isHeader && "text-[15px]")}>{label}</span>
                                </span>
                              </td>
                              {periodColumns.map((c) => {
                                const v = asNumber(r[c.fieldname]);
                                return (
                                  <td
                                    key={c.fieldname}
                                    className={cn(
                                      "border-l border-border/60 px-4 py-2.5 text-right tabular-nums",
                                      (isHeader || isTotal) && "font-bold",
                                      v < 0 && "text-destructive",
                                    )}
                                  >
                                    {kind === "header" ? "" : money(v)}
                                  </td>
                                );
                              })}
                              <td className="border-l border-border/60 px-4 py-2.5">
                                {kind !== "header" && (
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                                      <div className={cn("h-full rounded-full", isTotal ? "bg-primary" : "bg-primary/50")} style={{ width: `${share}%` }} />
                                    </div>
                                    <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
                                      {share >= 0.5 ? `${share.toFixed(0)}%` : "—"}
                                    </span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                    {netChangeRow && (
                      <tfoot>
                        <tr className="bg-muted/60">
                          <td className="border-t-2 border-border px-4 py-3 font-bold">Net Change in Cash</td>
                          {periodColumns.map((c) => {
                            const v = asNumber(netChangeRow[c.fieldname]);
                            return (
                              <td
                                key={c.fieldname}
                                className={cn(
                                  "border-l border-t-2 border-border px-4 py-3 text-right font-bold tabular-nums",
                                  v >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
                                )}
                              >
                                {money(v)}
                              </td>
                            );
                          })}
                          <td className="border-l border-t-2 border-border px-4 py-3" />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
