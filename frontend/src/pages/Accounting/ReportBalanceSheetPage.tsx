import { useNavigate } from "react-router-dom";
import { AccountDrillDialog, type DrillSpec } from "./account-drill";
import { ReportInsights } from "@/components/doc/report-insights";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  ChevronsDownUp,
  Download,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  CreditCard,
  PieChart,
  TrendingUp,
  TrendingDown,
  HandCoins,
  Landmark,
  ReceiptText,
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
import { BarChart, LineChart } from "@/components/charts/charts";
import { useChartOfAccounts, useQueryReport, useFiscalYears } from "@/hooks/useAccounting";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { formatNumber } from "@/utils/currency";
import { asNumber, cn } from "@/utils/cn";
import { clampToToday } from "@/utils/dates";
import { exportToCsv } from "@/utils/export";
import { humanizeError } from "@/services/frappe";
import type { QueryReportColumn } from "@/types/frappe";

interface BalanceSheetRow {
  account: string;
  parent_account?: string | null;
  indent: number;
  is_group: 0 | 1;
  acc_name: string;
  acc_number?: string | null;
  total: number;
  [periodKey: string]: unknown;
}

const PERIODICITIES = ["Yearly", "Half-Yearly", "Quarterly", "Monthly"];

const BS_OPTIONS: { key: string; label: string; def: boolean }[] = [
  { key: "show_zero_values", label: "Show zero values", def: false },
  { key: "accumulated_values", label: "Accumulated values", def: true },
  { key: "include_default_book_entries", label: "Include default finance book entries", def: true },
  { key: "include_dimensions", label: "Consider accounting dimensions", def: false },
];

const money = (n: number) => (n ? formatNumber(n, 2) : "—");

/**
 * Assets are debit-natured, Liabilities/Equity/Provisional P/L are
 * credit-natured (matching ERPNext's own "Provisional Profit / Loss
 * (Credit)" label) — flip to the opposite side only if the real total comes
 * back negative (e.g. a loss), same convention as the Trial Balance cards.
 */
const BS_NATURAL: Record<"asset" | "liability" | "equity" | "provisionalPL", "Dr" | "Cr"> = {
  asset: "Dr",
  liability: "Cr",
  equity: "Cr",
  provisionalPL: "Cr",
};
function drCr(key: keyof typeof BS_NATURAL, net: number): "Dr" | "Cr" {
  const natural = BS_NATURAL[key];
  const opposite = natural === "Dr" ? "Cr" : "Dr";
  return net >= 0 ? natural : opposite;
}
const withDrCr = (key: keyof typeof BS_NATURAL, n: number) => (n ? `${money(Math.abs(n))} ${drCr(key, n)}` : "—");

/** Same 4 colors used in the Composition bars — kept consistent on the chart + its legend. */
const BS_SERIES_META: Record<string, { label: string; hex: string }> = {
  assets: { label: "Assets", hex: "#3b82f6" },
  liabilities: { label: "Liabilities", hex: "#38bdf8" },
  equity: { label: "Equity", hex: "#10b981" },
  provisionalPL: { label: "Provisional P/L", hex: "#f59e0b" },
};
const BS_SERIES_KEYS = Object.keys(BS_SERIES_META);

/** Rows in a collapsed group's subtree — hidden until that group is re-expanded. */
function visibleRows(rows: BalanceSheetRow[], collapsed: Set<string>): BalanceSheetRow[] {
  const out: BalanceSheetRow[] = [];
  let hideUntilIndent: number | null = null;
  for (const r of rows) {
    if (hideUntilIndent !== null) {
      if (r.indent > hideUntilIndent) continue;
      hideUntilIndent = null;
    }
    out.push(r);
    if (r.is_group && collapsed.has(r.account)) hideUntilIndent = r.indent;
  }
  return out;
}

/**
 * Balance Sheet — assets, liabilities and equity as of the selected fiscal
 * year, grouped by the real Chart of Accounts hierarchy. Every number here
 * (including the four summary tiles) comes straight from ERPNext's own
 * report engine (`erpnext.accounts.report.balance_sheet`); nothing is
 * recomputed client-side beyond flattening the tree for display.
 */
export function ReportBalanceSheetPage() {
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
  const [chartMode, setChartMode] = useState<"Bars" | "Trend">("Bars");
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const toggleSeries = (k: string) =>
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const [opts, setOpts] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(BS_OPTIONS.map((o) => [o.key, o.def])),
  );

  useEffect(() => {
    if (fiscalYears && fiscalYears.length > 0 && !fiscalYear) setFiscalYear(fiscalYears[0].name);
  }, [fiscalYears, fiscalYear]);

  const fyMeta = fiscalYears?.find((fy) => fy.name === fiscalYear);

  // Default (and reset, on fiscal year change) to that year's own bounds,
  // capped at today — a fiscal year that hasn't ended yet shouldn't have its
  // still-future months requested from the report engine. The date inputs
  // below still let a user widen up to the fiscal year's real end date.
  useEffect(() => {
    if (fyMeta?.year_start_date && fyMeta?.year_end_date) {
      setFromDate(fyMeta.year_start_date);
      setToDate(clampToToday(fyMeta.year_end_date) ?? fyMeta.year_end_date);
    }
  }, [fyMeta?.year_start_date, fyMeta?.year_end_date]);

  const baseFilters = {
    company,
    filter_based_on: "Date Range",
    period_start_date: fromDate,
    period_end_date: toDate,
    cost_center: costCenter || undefined,
    project: project ? [project] : undefined,
    finance_book: financeBook || undefined,
  };

  const filters = useMemo(
    () => ({ ...baseFilters, periodicity, ...opts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [company, fromDate, toDate, periodicity, costCenter, project, financeBook, opts],
  );

  // Chart always drills to the real net change per month (not the running
  // balance) — how much assets/liabilities/equity actually moved that
  // month — across the same validated date range, regardless of the table's
  // own periodicity/accumulated selection above.
  const chartFilters = useMemo(
    () => ({ ...baseFilters, periodicity: "Monthly", accumulated_values: 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [company, fromDate, toDate, costCenter, project, financeBook],
  );

  // The report only (re)runs when "Generate" is clicked — changing a filter
  // above just updates the form, it doesn't refetch until the applied
  // snapshot below is explicitly refreshed.
  const [appliedFilters, setAppliedFilters] = useState<typeof filters | null>(null);
  const [appliedChartFilters, setAppliedChartFilters] = useState<typeof chartFilters | null>(null);
  const hasGenerated = appliedFilters !== null;
  const filtersDirty = hasGenerated && JSON.stringify(filters) !== JSON.stringify(appliedFilters);
  const generate = () => {
    setAppliedFilters(filters);
    setAppliedChartFilters(chartFilters);
  };

  const { data, error, isLoading, isPreparing, mutate } = useQueryReport(
    "Balance Sheet",
    appliedFilters ?? filters,
    Boolean(company && fromDate && toDate && appliedFilters),
  );

  const { data: chartReport, isLoading: chartLoading } = useQueryReport(
    "Balance Sheet",
    appliedChartFilters ?? chartFilters,
    Boolean(company && fromDate && toDate && appliedChartFilters),
  );

  const allRows = ((data?.result ?? []) as unknown as BalanceSheetRow[]).filter(
    (r) => r && typeof r.account === "string",
  );
  const bodyRows = allRows.filter((r) => !r.account.startsWith("'"));
  const navigate = useNavigate();
  const [drill, setDrill] = useState<DrillSpec | null>(null);
  const drillAccounts = useMemo(() => bodyRows.filter((r) => !r.is_group).map((r) => ({ account: r.account, name: r.acc_name, amount: Number(r.total) || 0 })), [bodyRows]);
  // Working-capital cards: leaf accounts by account type (report rows are already in each head's natural direction).
  const { data: coa } = useChartOfAccounts(company ?? undefined);
  const accountTypeOf = useMemo(() => new Map((coa ?? []).map((a) => [a.name, String(a.account_type ?? "")])), [coa]);
  const byType = (types: string[]) => drillAccounts.reduce((s, r) => s + (types.includes(accountTypeOf.get(r.account) ?? "") ? r.amount : 0), 0);
  const totalPayable = byType(["Payable"]);
  const totalReceivable = byType(["Receivable"]);
  const totalCash = byType(["Bank", "Cash"]);
  const shown = visibleRows(bodyRows, collapsed);
  const provisionalPLRow = allRows.find((r) => r.account.startsWith("'Provisional Profit"));

  const periodColumns: QueryReportColumn[] = (data?.columns ?? []).filter(
    (c) => !c.hidden && c.fieldname !== "account",
  );
  const lastPeriodKey = periodColumns[periodColumns.length - 1]?.fieldname;

  const summary = data?.report_summary ?? [];
  const totalAsset = asNumber(summary.find((s) => s.label === "Total Asset")?.value);
  const totalLiability = asNumber(summary.find((s) => s.label === "Total Liability")?.value);
  const totalEquity = asNumber(summary.find((s) => s.label === "Total Equity")?.value);
  const provisionalProfit = asNumber(
    summary.find((s) => s.label.startsWith("Provisional Profit"))?.value,
  );

  const base = Math.abs(totalAsset) || 1;
  const liabPct = Math.min(100, (Math.abs(totalLiability) / base) * 100);
  const eqPct = Math.min(100, (Math.abs(totalEquity) / base) * 100);
  const plPct = Math.min(100, (Math.abs(provisionalProfit) / base) * 100);

  const balanced = summary.length > 0 && Math.abs(totalAsset - (totalLiability + totalEquity + provisionalProfit)) < 0.5;

  const chartCurrency = chartReport?.chart?.currency ?? companyCurrency ?? "USD";
  const chartLabels = chartReport?.chart?.data?.labels ?? [];
  const chartDatasets = chartReport?.chart?.data?.datasets ?? [];
  const assetSeries = chartDatasets.find((d) => d.name === "Assets")?.values ?? [];
  const liabilitySeries = chartDatasets.find((d) => d.name === "Liabilities")?.values ?? [];
  const equitySeries = chartDatasets.find((d) => d.name === "Equity")?.values ?? [];

  const monthlyData = chartLabels.map((label, i) => {
    const assets = asNumber(assetSeries[i]);
    const liabilities = asNumber(liabilitySeries[i]);
    const equity = asNumber(equitySeries[i]);
    return { month: label, assets, liabilities, equity, provisionalPL: assets - liabilities - equity };
  });

  const chartInsights = useMemo(() => {
    if (monthlyData.length === 0) return null;
    const highestAssets = monthlyData.reduce((a, b) => (b.assets > a.assets ? b : a));
    const highestLiabilities = monthlyData.reduce((a, b) => (b.liabilities > a.liabilities ? b : a));
    const avgPL = monthlyData.reduce((s, m) => s + m.provisionalPL, 0) / monthlyData.length;
    return { highestAssets, highestLiabilities, avgPL };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReport]);

  const toggle = (account: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(account)) next.delete(account);
      else next.add(account);
      return next;
    });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(bodyRows.filter((r) => r.is_group).map((r) => r.account)));

  // The Chart of Accounts tree can run deeper than the 2 levels Cash Flow's
  // fixed sections do, so "level" here collapses every group row exactly at
  // the chosen boundary depth (indent === level - 1) — shallower groups stay
  // expanded, anything past the boundary is hidden underneath them. A level
  // past the tree's real depth naturally matches no rows, i.e. fully expanded.
  const [levelInput, setLevelInput] = useState(2);
  const applyLevel = (lvl: number) =>
    setCollapsed(new Set(bodyRows.filter((r) => r.is_group && r.indent === lvl - 1).map((r) => r.account)));

  // Default the tree to Level 2 (root accounts + their direct children,
  // deeper ones collapsed) the first time each fresh report result loads —
  // showing 150+ rows fully expanded by default would be overwhelming.
  // Guarded so it only fires once per load, not every time the user's own
  // clicks change `collapsed`.
  const appliedDefaultLevel = useRef(false);
  useEffect(() => {
    if (bodyRows.length > 0 && !appliedDefaultLevel.current) {
      appliedDefaultLevel.current = true;
      applyLevel(2);
    }
    if (bodyRows.length === 0) appliedDefaultLevel.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyRows]);

  const exportRows = () => {
    const cols = [
      { key: "account", label: "Account" },
      ...periodColumns.map((c) => ({ key: c.fieldname, label: c.label })),
    ];
    const rows = bodyRows.map((r) => ({
      account: `${"  ".repeat(r.indent)}${r.acc_number ? `${r.acc_number} - ` : ""}${r.acc_name}`,
      ...Object.fromEntries(periodColumns.map((c) => [c.fieldname, r[c.fieldname]])),
    }));
    exportToCsv(cols, rows, "balance-sheet");
  };

  return (
    <div className="space-y-4">
      <LoadingOverlay show={isPreparing} label="Generating Balance Sheet…" />
      <PageHeader
        title="Balance Sheet"
        subtitle="Assets, liabilities and equity — computed live by ERPNext's report engine"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={expandAll} disabled={!bodyRows.length}>
              <ChevronsUpDown className="h-4 w-4" />
              Expand all
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll} disabled={!bodyRows.length}>
              <ChevronsDownUp className="h-4 w-4" />
              Collapse all
            </Button>
            <Button size="sm" onClick={exportRows} disabled={!bodyRows.length}>
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
          <Card className="p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="bs-fy">Fiscal Year</Label>
                <Select id="bs-fy" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)}>
                  {(fiscalYears ?? []).map((fy) => (
                    <option key={fy.name} value={fy.name}>
                      {fy.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="bs-from">From Date</Label>
                <Input
                  id="bs-from"
                  type="date"
                  value={fromDate}
                  min={fyMeta?.year_start_date}
                  max={toDate || fyMeta?.year_end_date}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="bs-to">To Date</Label>
                <Input
                  id="bs-to"
                  type="date"
                  value={toDate}
                  min={fromDate || fyMeta?.year_start_date}
                  max={fyMeta?.year_end_date}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="bs-periodicity">Periodicity</Label>
                <Select id="bs-periodicity" value={periodicity} onChange={(e) => setPeriodicity(e.target.value)}>
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
              {BS_OPTIONS.map((o) => (
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
          </Card>

          {!hasGenerated ? (
            <EmptyState
              title="Ready to generate"
              description="Set your filters above, then click Generate to run the Balance Sheet."
              actionLabel="Generate"
              onAction={generate}
            />
          ) : error ? (
            <EmptyState title="Couldn't load Balance Sheet" description={humanizeError(error)} actionLabel="Retry" onAction={() => void mutate()} />
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : bodyRows.length === 0 ? (
            <EmptyState title="No postings found" description="No account activity for this fiscal year / filter set." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard
                  label="Total Asset"
                  value={withDrCr("asset", totalAsset)}
                  icon={Wallet}
                  tone="success"
                  colorValue
                  sparkline={monthlyData.map((m) => m.assets)}
                  onClick={() => setDrill({ title: "Assets — accounts", rootTypes: ["Asset"] })}
                />
                <KpiCard
                  label="Total Liability"
                  value={withDrCr("liability", totalLiability)}
                  icon={CreditCard}
                  tone="warning"
                  colorValue
                  sparkline={monthlyData.map((m) => m.liabilities)}
                  onClick={() => setDrill({ title: "Liabilities — accounts", rootTypes: ["Liability"] })}
                />
                <KpiCard
                  label="Total Equity"
                  value={withDrCr("equity", totalEquity)}
                  icon={PieChart}
                  tone="info"
                  colorValue
                  sparkline={monthlyData.map((m) => m.equity)}
                  onClick={() => setDrill({ title: "Equity — accounts", rootTypes: ["Equity"] })}
                />
                <KpiCard
                  label={summary.find((s) => s.label.startsWith("Provisional Profit"))?.label ?? "Provisional Profit / Loss"}
                  value={withDrCr("provisionalPL", provisionalProfit)}
                  icon={provisionalProfit >= 0 ? TrendingUp : TrendingDown}
                  tone={provisionalProfit >= 0 ? "success" : "destructive"}
                  colorValue
                  sparkline={monthlyData.map((m) => m.provisionalPL)}
                  onClick={() => navigate("/accounting/reports/profit-and-loss")}
                />
                <KpiCard
                  label="Payables"
                  value={withDrCr("liability", totalPayable)}
                  icon={HandCoins}
                  tone="destructive"
                  colorValue
                  onClick={() => setDrill({ title: "Payables — supplier and other payable accounts", rootTypes: ["Liability"], accountTypes: ["Payable"] })}
                />
                <KpiCard
                  label="Receivables"
                  value={withDrCr("asset", totalReceivable)}
                  icon={ReceiptText}
                  tone="info"
                  colorValue
                  onClick={() => setDrill({ title: "Receivables — customer and other receivable accounts", rootTypes: ["Asset"], accountTypes: ["Receivable"] })}
                />
                <KpiCard
                  label="Cash & Bank"
                  value={withDrCr("asset", totalCash)}
                  icon={Landmark}
                  tone="success"
                  colorValue
                  onClick={() => setDrill({ title: "Cash & Bank — balances by account", rootTypes: ["Asset"], accountTypes: ["Bank", "Cash"] })}
                />
              </div>
              <AccountDrillDialog spec={drill} onClose={() => setDrill(null)} accounts={drillAccounts} company={company} fromDate={fromDate} toDate={toDate} currency={companyCurrency ?? undefined} />
              <ReportInsights report="balance_sheet" company={company} fromDate={fromDate} toDate={toDate} currency={companyCurrency ?? undefined} omitTiles={["Total assets", "Liabilities", "Equity (incl. current profit)", "Cash & bank", "Receivables"]} hideBars hideChart />

              <Card className="p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-semibold">Composition</p>
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm bg-primary" /> Assets
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm bg-sky-400" /> Liabilities
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Equity
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm bg-amber-500" /> Provisional P/L
                    </span>
                  </div>
                </div>
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                      <span>Assets</span>
                      <span className="tabular-nums">{money(totalAsset)}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-md bg-muted">
                      <div className="h-full rounded-md bg-primary" style={{ width: "100%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                      <span>Liabilities + Equity + Provisional P/L</span>
                      <span className="tabular-nums">{money(totalLiability + totalEquity + provisionalProfit)}</span>
                    </div>
                    <div className="flex h-3 overflow-hidden rounded-md bg-muted">
                      <div className="h-full bg-sky-400" style={{ width: `${liabPct}%` }} />
                      <div className="h-full bg-emerald-500" style={{ width: `${eqPct}%` }} />
                      <div className="h-full bg-amber-500" style={{ width: `${plPct}%` }} />
                    </div>
                  </div>
                </div>
              </Card>

              <ChartCard
                title="Monthly activity"
                subtitle={`${fromDate} to ${toDate} · ${chartCurrency} · net change per month`}
                actions={
                  <div className="flex gap-1 rounded-lg bg-muted p-1">
                    <Button variant={chartMode === "Bars" ? "default" : "ghost"} size="sm" className="h-7 px-3" onClick={() => setChartMode("Bars")}>
                      Bars
                    </Button>
                    <Button variant={chartMode === "Trend" ? "default" : "ghost"} size="sm" className="h-7 px-3" onClick={() => setChartMode("Trend")}>
                      Trend
                    </Button>
                  </div>
                }
              >
                {chartLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : monthlyData.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No monthly activity to chart.</p>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {BS_SERIES_KEYS.map((k) => {
                        const active = !hiddenSeries.has(k);
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => toggleSeries(k)}
                            aria-pressed={active}
                            className={cn(
                              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                              active
                                ? "border-transparent bg-muted text-foreground"
                                : "border-border text-muted-foreground opacity-50 hover:opacity-75",
                            )}
                          >
                            <span className="h-2 w-2 rounded-full" style={{ background: BS_SERIES_META[k].hex }} />
                            {BS_SERIES_META[k].label}
                          </button>
                        );
                      })}
                    </div>
                    {chartMode === "Bars" ? (
                      <BarChart
                        data={monthlyData}
                        xKey="month"
                        series={BS_SERIES_KEYS.filter((k) => !hiddenSeries.has(k)).map((k) => ({
                          key: k,
                          label: BS_SERIES_META[k].label,
                          color: BS_SERIES_META[k].hex,
                        }))}
                        money
                        currency={chartCurrency}
                      />
                    ) : (
                      <LineChart
                        data={monthlyData}
                        xKey="month"
                        series={BS_SERIES_KEYS.filter((k) => !hiddenSeries.has(k)).map((k) => ({
                          key: k,
                          label: BS_SERIES_META[k].label,
                          color: BS_SERIES_META[k].hex,
                        }))}
                        money
                        currency={chartCurrency}
                      />
                    )}
                    {chartInsights && (
                      <div className="mt-4 flex flex-wrap gap-6 border-t border-border pt-4 text-xs text-muted-foreground">
                        <span>
                          Largest asset growth{" "}
                          <strong className="text-foreground">
                            {chartInsights.highestAssets.month} ({money(chartInsights.highestAssets.assets)})
                          </strong>
                        </span>
                        <span>
                          Largest liability growth{" "}
                          <strong className="text-foreground">
                            {chartInsights.highestLiabilities.month} ({money(chartInsights.highestLiabilities.liabilities)})
                          </strong>
                        </span>
                        <span>
                          Average monthly P/L movement <strong className="text-foreground">{money(chartInsights.avgPL)}</strong>
                        </span>
                      </div>
                    )}
                  </>
                )}
              </ChartCard>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Statement</p>
                  <p className="text-xs text-muted-foreground">{shown.length} rows shown</p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="bs-level" className="text-xs font-medium text-muted-foreground">
                    Level
                  </label>
                  <Input
                    id="bs-level"
                    type="number"
                    min={1}
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
                          Account
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
                      {shown.map((r) => {
                        const isGroup = !!r.is_group;
                        const rowValue = lastPeriodKey ? asNumber(r[lastPeriodKey]) : r.total;
                        const share = Math.min(100, (Math.abs(rowValue) / base) * 100);
                        return (
                          <tr
                            key={r.account}
                            onClick={isGroup ? () => toggle(r.account) : undefined}
                            className={cn(
                              "border-b border-border/60 last:border-0",
                              isGroup ? "cursor-pointer bg-muted/30 hover:bg-muted/50" : "hover:bg-muted/20",
                            )}
                          >
                            <td className="px-4 py-2.5" style={{ paddingLeft: 16 + r.indent * 20 }}>
                              <span className={cn("inline-flex items-center gap-2", isGroup && (r.indent === 0 ? "font-extrabold" : "font-semibold"))}>
                                {isGroup ? (
                                  collapsed.has(r.account) ? (
                                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  )
                                ) : (
                                  <span className="inline-block w-3.5 shrink-0" />
                                )}
                                {r.acc_number && <span className="font-mono text-xs text-muted-foreground">{r.acc_number}</span>}
                                <span className={cn("truncate", r.indent === 0 && "text-[15px]")}>{r.acc_name}</span>
                              </span>
                            </td>
                            {periodColumns.map((c) => {
                              const v = asNumber(r[c.fieldname]);
                              return (
                                <td
                                  key={c.fieldname}
                                  className={cn(
                                    "border-l border-border/60 px-4 py-2.5 text-right tabular-nums",
                                    isGroup && (r.indent === 0 ? "font-extrabold" : "font-semibold"),
                                    v < 0 && "text-destructive",
                                  )}
                                >
                                  {money(v)}
                                </td>
                              );
                            })}
                            <td className="border-l border-border/60 px-4 py-2.5">
                              <div className="flex items-center justify-end gap-2">
                                <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className={cn("h-full rounded-full", isGroup && r.indent === 0 ? "bg-primary" : "bg-primary/50")}
                                    style={{ width: `${share}%` }}
                                  />
                                </div>
                                <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
                                  {share >= 0.5 ? `${share.toFixed(0)}%` : "—"}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {provisionalPLRow && (
                      <tfoot>
                        <tr className="bg-muted/60">
                          <td className="border-t-2 border-border px-4 py-3 font-bold">Provisional Profit / Loss</td>
                          {periodColumns.map((c) => {
                            const v = asNumber(provisionalPLRow[c.fieldname]);
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
                          <td className="border-l border-t-2 border-border px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-amber-500" style={{ width: `${plPct}%` }} />
                              </div>
                              <span className="w-9 text-right text-xs font-bold text-muted-foreground tabular-nums">
                                {plPct >= 0.5 ? `${plPct.toFixed(0)}%` : "—"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              <div className={cn("flex items-center gap-2 text-sm", balanced ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                {balanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {balanced
                  ? "Assets equal liabilities plus equity and provisional profit."
                  : `Out of balance — assets differ from liabilities + equity + P/L by ${formatNumber(
                      Math.abs(totalAsset - (totalLiability + totalEquity + provisionalProfit)),
                      2,
                    )}.`}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
