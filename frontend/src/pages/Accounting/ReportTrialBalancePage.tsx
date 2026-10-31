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
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FrappeLinkField } from "@/components/forms/field-primitives";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingOverlay } from "@/components/common/loading-overlay";
import { KpiCard } from "@/pages/Dashboard/KpiCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartCard } from "@/components/charts/chart-card";
import { BarChart, LineChart } from "@/components/charts/charts";
import { useQueryReport, useFiscalYears, useChartOfAccounts } from "@/hooks/useAccounting";
import { useFrappeGetCall } from "frappe-react-sdk";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { formatNumber } from "@/utils/currency";
import { cn } from "@/utils/cn";
import { clampToToday } from "@/utils/dates";
import { exportToCsv } from "@/utils/export";
import { humanizeError } from "@/services/frappe";

const HEADS = ["Asset", "Liability", "Equity", "Income", "Expense"] as const;
type Head = (typeof HEADS)[number];
/** Debit-natured heads read as (debit - credit); credit-natured heads read as (credit - debit). */
const DEBIT_NATURED = new Set<Head>(["Asset", "Expense"]);

const HEAD_META: Record<Head, { icon: typeof Wallet; tone: "info" | "warning" | "violet" | "success" | "destructive"; hex: string }> = {
  Asset: { icon: Wallet, tone: "info", hex: "#3b82f6" },
  Liability: { icon: CreditCard, tone: "warning", hex: "#f59e0b" },
  Equity: { icon: PieChart, tone: "violet", hex: "#8b5cf6" },
  Income: { icon: TrendingUp, tone: "success", hex: "#10b981" },
  Expense: { icon: TrendingDown, tone: "destructive", hex: "#f43f5e" },
};

const HEAD_SERIES = HEADS.map((h) => ({ key: h, label: h, color: HEAD_META[h].hex }));

interface TrialBalanceRow {
  account: string;
  parent_account?: string | null;
  indent: number;
  currency?: string;
  is_group_account: 0 | 1;
  acc_name: string;
  acc_number?: string | null;
  opening_debit: number;
  opening_credit: number;
  debit: number;
  credit: number;
  closing_debit: number;
  closing_credit: number;
}

const money = (n: number) => (n ? formatNumber(n, 2) : "—");

/**
 * `headTotals[h]` is netted in the head's own natural direction (debit for
 * Asset/Expense, credit for Liability/Equity/Income): positive means the
 * balance sits on that natural side, negative means it's flipped to the
 * opposite side. Label accordingly so the card reads like a real ledger
 * balance ("315,212.12 Dr") instead of a bare signed number.
 */
function drCrLabel(h: Head, net: number): "Dr" | "Cr" {
  const natural: "Dr" | "Cr" = DEBIT_NATURED.has(h) ? "Dr" : "Cr";
  const opposite: "Dr" | "Cr" = natural === "Dr" ? "Cr" : "Dr";
  return net >= 0 ? natural : opposite;
}

/**
 * Net closing balance per account: (opening debit - opening credit) +
 * (activity debit - activity credit). A positive net is a debit balance, a
 * negative net is a credit balance — so each account shows on one side only,
 * the conventional single-sided trial-balance closing presentation (rather
 * than the report's raw gross closing_debit/closing_credit, which can both
 * be nonzero at once).
 */
function netClosing(r: TrialBalanceRow): { debit: number; credit: number } {
  const net = r.opening_debit - r.opening_credit + (r.debit - r.credit);
  return net > 0 ? { debit: net, credit: 0 } : { debit: 0, credit: -net };
}

/** Same single-sided convention as netClosing, applied to the opening balance alone. */
function netOpening(r: TrialBalanceRow): { debit: number; credit: number } {
  const net = r.opening_debit - r.opening_credit;
  return net > 0 ? { debit: net, credit: 0 } : { debit: 0, credit: -net };
}

/** One distinct color per root account type — used to tag every row in the tree. */
const ROOT_TYPE_COLORS: Record<string, { dot: string; text: string; label: string }> = {
  Asset: { dot: "bg-blue-500", text: "text-blue-600 dark:text-blue-400", label: "Asset" },
  Liability: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", label: "Liability" },
  Equity: { dot: "bg-violet-500", text: "text-violet-600 dark:text-violet-400", label: "Equity" },
  Income: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "Income" },
  Expense: { dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", label: "Expense" },
};

/** Rows in a collapsed group's subtree — hidden until that group is re-expanded. */
function visibleRows(rows: TrialBalanceRow[], collapsed: Set<string>): TrialBalanceRow[] {
  const out: TrialBalanceRow[] = [];
  let hideUntilIndent: number | null = null;
  for (const r of rows) {
    if (hideUntilIndent !== null) {
      if (r.indent > hideUntilIndent) continue;
      hideUntilIndent = null;
    }
    out.push(r);
    if (r.is_group_account && collapsed.has(r.account)) hideUntilIndent = r.indent;
  }
  return out;
}

/**
 * Trial Balance — opening/activity/closing per account, grouped by the real
 * Chart of Accounts hierarchy (`show_group_accounts`) so parent accounts show
 * live accumulated subtotals computed by ERPNext itself, not re-derived here.
 */
export function ReportTrialBalancePage() {
  const { company, companyCurrency } = useCompanyContext();
  const { data: fiscalYears } = useFiscalYears();
  const [fiscalYear, setFiscalYear] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [chartMode, setChartMode] = useState<"Bars" | "Trend">("Bars");
  // The monthly trend is N extra full "Trial Balance" report calls (one per
  // month) — on a large/heavy company that's N extra multi-second+ report
  // runs on top of the one the page actually needs for its headline figures.
  // Opt-in on click rather than firing automatically on every page load.
  const [hiddenHeads, setHiddenHeads] = useState<Set<Head>>(new Set());
  const toggleHead = (h: Head) =>
    setHiddenHeads((prev) => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h);
      else next.add(h);
      return next;
    });

  useEffect(() => {
    if (fiscalYears && fiscalYears.length > 0 && !fiscalYear) setFiscalYear(fiscalYears[0].name);
  }, [fiscalYears, fiscalYear]);

  const fyMeta = fiscalYears?.find((fy) => fy.name === fiscalYear);

  // Reset the date range to the fiscal year's own bounds whenever the fiscal
  // year changes (including its first load), capped at today — a fiscal year
  // that hasn't ended yet shouldn't have its still-future months requested —
  // narrowing from there is what drives ERPNext's own "opening as of From
  // Date" recalculation below. The date inputs still let a user widen up to
  // the fiscal year's real end date.
  useEffect(() => {
    if (fyMeta?.year_start_date && fyMeta?.year_end_date) {
      setFromDate(fyMeta.year_start_date);
      setToDate(clampToToday(fyMeta.year_end_date) ?? fyMeta.year_end_date);
    }
  }, [fyMeta?.year_start_date, fyMeta?.year_end_date]);

  const filters = useMemo(
    () => ({
      company,
      fiscal_year: fiscalYear,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      cost_center: costCenter || undefined,
      show_group_accounts: 1,
    }),
    [company, fiscalYear, fromDate, toDate, costCenter],
  );

  // The report only (re)runs when "Generate" is clicked — changing a filter
  // above just updates the form, it doesn't refetch until the applied
  // snapshot below is explicitly refreshed.
  const [appliedFilters, setAppliedFilters] = useState<typeof filters | null>(null);
  const hasGenerated = appliedFilters !== null;
  const filtersDirty = hasGenerated && JSON.stringify(filters) !== JSON.stringify(appliedFilters);
  const generate = () => setAppliedFilters(filters);

  const { data, error, isLoading, isPreparing, mutate } = useQueryReport(
    "Trial Balance",
    appliedFilters ?? filters,
    Boolean(company && fiscalYear && appliedFilters),
  );

  // Trial Balance rows don't carry root_type themselves — look it up from the
  // real Chart of Accounts (same doctype field ERPNext itself groups by).
  const { data: coa } = useChartOfAccounts(company);
  const rootTypeMap = useMemo(() => new Map((coa ?? []).map((a) => [a.name, a.root_type])), [coa]);

  const allRows = ((data?.result ?? []) as unknown as TrialBalanceRow[]).filter(
    (r) => r && typeof r.account === "string",
  );
  const totalRow = allRows.find((r) => r.account === "'Total'");
  const bodyRows = allRows.filter((r) => r.account !== "'Total'");
  // Card drill-down: leaf accounts with their closing balance (debit − credit) and period activity.
  const [drill, setDrill] = useState<DrillSpec | null>(null);
  const drillAccounts = useMemo(
    () => bodyRows.filter((r) => !r.is_group_account).map((r) => ({
      account: r.account, name: r.acc_name, amount: r.closing_debit - r.closing_credit,
      sub: `opening ${(r.opening_debit - r.opening_credit).toFixed(2)} · Dr ${r.debit.toFixed(2)} · Cr ${r.credit.toFixed(2)}`,
    })),
    [bodyRows],
  );
  const shown = visibleRows(bodyRows, collapsed);
  const chartCurrency = allRows.find((r) => typeof r.currency === "string")?.currency ?? companyCurrency ?? "USD";

  // One net figure per head, read straight off the report's own root-level
  // group rows (indent 0) — no accounting math re-derived here.
  const headTotals = useMemo(() => {
    const totals: Record<Head, number> = { Asset: 0, Liability: 0, Equity: 0, Income: 0, Expense: 0 };
    bodyRows
      .filter((r) => r.indent === 0)
      .forEach((r) => {
        const rt = rootTypeMap.get(r.account) as Head | undefined;
        if (!rt || !(rt in totals)) return;
        totals[rt] += DEBIT_NATURED.has(rt) ? r.closing_debit - r.closing_credit : r.closing_credit - r.closing_debit;
      });
    return totals;
  }, [bodyRows, rootTypeMap]);

  // Monthly movement per root type from one indexed, cached GL pass (micromax.financial_insights) — cheap enough
  // to load with the report instead of on request, so the chart and the card sparklines show straight away.
  const trendArgs = { company, from_date: appliedFilters?.from_date ?? fromDate, to_date: appliedFilters?.to_date ?? toDate };
  const { data: monthlyResp, isLoading: chartLoading } = useFrappeGetCall<{ message: ({ month: string } & Record<Head, number>)[] }>(
    "sugarcane.erp_insights.financial_insights.get_monthly_root_movement",
    trendArgs,
    hasGenerated && company && trendArgs.from_date && trendArgs.to_date ? `tb-monthly:${JSON.stringify(trendArgs)}` : null,
    { revalidateOnFocus: false },
  );
  const monthlyData = useMemo(() => monthlyResp?.message ?? [], [monthlyResp]);

  const toggle = (account: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(account)) next.delete(account);
      else next.add(account);
      return next;
    });

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(bodyRows.filter((r) => r.is_group_account).map((r) => r.account)));

  // "Level" collapses every group row exactly at the chosen boundary depth
  // (indent === level - 1) — shallower groups stay expanded, anything past
  // the boundary is hidden underneath them. A level past the tree's real
  // depth naturally matches no rows, i.e. fully expanded.
  const [levelInput, setLevelInput] = useState(2);
  const applyLevel = (lvl: number) =>
    setCollapsed(new Set(bodyRows.filter((r) => r.is_group_account && r.indent === lvl - 1).map((r) => r.account)));

  // Default the tree to Level 2 the first time each fresh report result
  // loads — guarded so it only fires once per load, not every time the
  // user's own clicks change `collapsed`.
  const appliedDefaultLevel = useRef(false);
  useEffect(() => {
    if (bodyRows.length > 0 && !appliedDefaultLevel.current) {
      appliedDefaultLevel.current = true;
      applyLevel(2);
    }
    if (bodyRows.length === 0) appliedDefaultLevel.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyRows]);

  const balanced = totalRow ? Math.abs(totalRow.closing_debit - totalRow.closing_credit) < 0.005 : true;
  const outOfBalanceBy = totalRow ? Math.abs(totalRow.closing_debit - totalRow.closing_credit) : 0;

  const exportRows = () => {
    const cols = [
      { key: "account", label: "Account" },
      { key: "opening_debit", label: "Opening (Dr)" },
      { key: "opening_credit", label: "Opening (Cr)" },
      { key: "debit", label: "Debit" },
      { key: "credit", label: "Credit" },
      { key: "closing_debit", label: "Closing (Dr)" },
      { key: "closing_credit", label: "Closing (Cr)" },
    ];
    const rows = [
      ...bodyRows.map((r) => {
        const opening = netOpening(r);
        const closing = netClosing(r);
        return {
          account: `${"  ".repeat(r.indent)}${r.acc_number ? `${r.acc_number} - ` : ""}${r.acc_name}`,
          opening_debit: opening.debit,
          opening_credit: opening.credit,
          debit: r.debit,
          credit: r.credit,
          closing_debit: closing.debit,
          closing_credit: closing.credit,
        };
      }),
      ...(totalRow
        ? [
            {
              account: "Total",
              opening_debit: totalRow.opening_debit,
              opening_credit: totalRow.opening_credit,
              debit: totalRow.debit,
              credit: totalRow.credit,
              closing_debit: totalRow.closing_debit,
              closing_credit: totalRow.closing_credit,
            },
          ]
        : []),
    ];
    exportToCsv(cols, rows, "trial-balance");
  };

  return (
    <div className="space-y-4">
      <LoadingOverlay show={isPreparing} label="Generating Trial Balance…" />
      <PageHeader
        title="Trial Balance"
        subtitle="Opening, activity and closing balance per account, straight from ERPNext's report engine"
      />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="tb-fy">Fiscal Year</Label>
          <Select id="tb-fy" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} className="w-48">
            {(fiscalYears ?? []).map((fy) => (
              <option key={fy.name} value={fy.name}>
                {fy.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="tb-from">From Date</Label>
          <Input
            id="tb-from"
            type="date"
            value={fromDate}
            min={fyMeta?.year_start_date}
            max={toDate || fyMeta?.year_end_date}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <Label htmlFor="tb-to">To Date</Label>
          <Input
            id="tb-to"
            type="date"
            value={toDate}
            min={fromDate || fyMeta?.year_start_date}
            max={fyMeta?.year_end_date}
            onChange={(e) => setToDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="w-56">
          <Label>Cost Center</Label>
          <FrappeLinkField
            meta={{ fieldname: "cost_center", label: "Cost Center", fieldtype: "Link", options: "Cost Center", placeholder: "All cost centers" }}
            value={costCenter}
            onChange={setCostCenter}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={generate} disabled={!company || !fiscalYear}>
            Generate
          </Button>
          {filtersDirty && <span className="text-xs text-muted-foreground">Filters changed — click Generate to refresh</span>}
        </div>
      </div>

      {!company ? (
        <EmptyState title="No company selected" description="Choose a company from the header to run this report." />
      ) : !hasGenerated ? (
        <EmptyState
          title="Ready to generate"
          description="Choose a fiscal year and filters above, then click Generate to run the Trial Balance."
          actionLabel="Generate"
          onAction={generate}
        />
      ) : error ? (
        <EmptyState title="Couldn't load Trial Balance" description={humanizeError(error)} actionLabel="Retry" onAction={() => void mutate()} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : bodyRows.length === 0 ? (
        <EmptyState title="No postings found" description="No account activity for this fiscal year / cost center." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {HEADS.map((h) => {
              const meta = HEAD_META[h];
              return (
                <KpiCard
                  key={h}
                  label={h}
                  value={headTotals[h] ? `${money(Math.abs(headTotals[h]))} ${drCrLabel(h, headTotals[h])}` : "—"}
                  icon={meta.icon}
                  tone={meta.tone}
                  colorValue
                  sparkline={monthlyData.map((m) => m[h])}
                  labelClassName="font-bold"
                  valueClassName="text-lg"
                  onClick={() => setDrill({ title: `${h} — accounts`, rootTypes: [h], negate: DEBIT_NATURED.has(h) ? [] : [h] })}
                />
              );
            })}
          </div>
          <AccountDrillDialog spec={drill} onClose={() => setDrill(null)} accounts={drillAccounts} company={company} fromDate={fromDate} toDate={toDate} currency={companyCurrency ?? undefined} />
          <ReportInsights report="trial_balance" company={company} fromDate={fromDate} toDate={toDate} currency={companyCurrency ?? undefined} hideBars />

          <ChartCard
            title="Monthly activity"
            subtitle={fromDate && toDate ? `${fromDate} to ${toDate} · net change per head, per month` : undefined}
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
                  {HEADS.map((h) => {
                    const active = !hiddenHeads.has(h);
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => toggleHead(h)}
                        aria-pressed={active}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-transparent bg-muted text-foreground"
                            : "border-border text-muted-foreground opacity-50 hover:opacity-75",
                        )}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: HEAD_META[h].hex }} />
                        {h}
                      </button>
                    );
                  })}
                </div>
                {chartMode === "Bars" ? (
                  <BarChart data={monthlyData} xKey="month" series={HEAD_SERIES.filter((s) => !hiddenHeads.has(s.key))} money currency={chartCurrency} />
                ) : (
                  <LineChart data={monthlyData} xKey="month" series={HEAD_SERIES.filter((s) => !hiddenHeads.has(s.key))} money currency={chartCurrency} />
                )}
              </>
            )}
          </ChartCard>

          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
            {Object.values(ROOT_TYPE_COLORS).map((c) => (
              <span key={c.label} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", c.dot)} />
                {c.label}
              </span>
            ))}
          </div>

          <div className="flex flex-nowrap items-center justify-between gap-3 overflow-x-auto">
            <div className="shrink-0">
              <p className="text-sm font-semibold">Statement</p>
              <p className="text-xs text-muted-foreground">{shown.length} rows shown</p>
            </div>
            <div className="flex shrink-0 flex-nowrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-background hover:shadow-sm"
                  onClick={expandAll}
                  disabled={!bodyRows.length}
                  title="Expand all"
                >
                  <ChevronsUpDown className="h-4 w-4 text-primary" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-background hover:shadow-sm"
                  onClick={collapseAll}
                  disabled={!bodyRows.length}
                  title="Collapse all"
                >
                  <ChevronsDownUp className="h-4 w-4 text-primary" />
                </Button>
              </div>
              <label htmlFor="tb-level" className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                Level
              </label>
              <Input
                id="tb-level"
                type="number"
                min={1}
                value={levelInput}
                onChange={(e) => setLevelInput(Number(e.target.value) || 1)}
                className="h-8 w-14"
              />
              <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => applyLevel(levelInput)}>
                Set Level
              </Button>
              <Button variant="primary" size="sm" className="whitespace-nowrap" onClick={exportRows} disabled={!bodyRows.length}>
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card dark:border-white/10 dark:bg-white/5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th rowSpan={2} className="sticky left-0 z-20 border-b border-r border-border bg-muted px-4 py-2.5 text-left align-bottom text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Account
                    </th>
                    <th colSpan={2} className="border-b border-l border-border px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Opening
                    </th>
                    <th colSpan={2} className="border-b border-l border-border px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Activity
                    </th>
                    <th colSpan={2} className="border-b border-l border-border px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Closing
                    </th>
                  </tr>
                  <tr className="bg-muted/50">
                    {["Debit", "Credit", "Debit", "Credit", "Debit", "Credit"].map((label, i) => (
                      <th
                        key={i}
                        className={cn(
                          "border-b border-border px-4 py-2 text-right text-[11px] font-semibold text-muted-foreground",
                          i % 2 === 0 && "border-l",
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const isGroup = !!r.is_group_account;
                    const isRoot = r.indent === 0;
                    const rootType = rootTypeMap.get(r.account);
                    const colors = rootType ? ROOT_TYPE_COLORS[rootType] : undefined;
                    const valueCls = cn(
                      "px-4 py-2.5 text-right tabular-nums",
                      isGroup && (isRoot ? "font-extrabold" : "font-bold"),
                    );
                    const opening = netOpening(r);
                    const closing = netClosing(r);
                    return (
                      <tr
                        key={r.account}
                        onClick={isGroup ? () => toggle(r.account) : undefined}
                        className={cn(
                          "border-b border-border/60 last:border-0",
                          isGroup ? "cursor-pointer bg-muted/30 hover:bg-muted/50" : "hover:bg-muted/20",
                        )}
                      >
                        <td
                          className={cn("sticky left-0 z-10 border-r border-border/60 bg-card px-4 py-2.5", isGroup && "bg-muted/60")}
                          style={{ paddingLeft: 16 + r.indent * 20 }}
                        >
                          <span
                            className={cn(
                              "inline-flex items-center gap-2",
                              isGroup && (isRoot ? "font-extrabold" : "font-semibold"),
                            )}
                          >
                            {isGroup ? (
                              collapsed.has(r.account) ? (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )
                            ) : (
                              <span className="inline-block w-3.5 shrink-0" />
                            )}
                            {colors && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", colors.dot)} />}
                            {r.acc_number && (
                              <span className="font-mono text-xs text-muted-foreground">{r.acc_number}</span>
                            )}
                            <span className={cn("truncate", colors?.text, isRoot && "text-[15px]")}>{r.acc_name}</span>
                          </span>
                        </td>
                        <td className={cn(valueCls, "border-l border-border/60")}>{money(opening.debit)}</td>
                        <td className={valueCls}>{money(opening.credit)}</td>
                        <td className={cn(valueCls, "border-l border-border/60")}>{money(r.debit)}</td>
                        <td className={valueCls}>{money(r.credit)}</td>
                        <td className={cn(valueCls, "border-l border-border/60")}>{money(closing.debit)}</td>
                        <td className={valueCls}>{money(closing.credit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {totalRow && (
                  <tfoot>
                    <tr className="bg-muted/60">
                      <td className="sticky left-0 z-10 border-t-2 border-r border-border bg-muted px-4 py-3 font-bold">Total</td>
                      <td className="border-l border-t-2 border-border px-4 py-3 text-right font-bold tabular-nums">{money(totalRow.opening_debit)}</td>
                      <td className="border-t-2 border-border px-4 py-3 text-right font-bold tabular-nums">{money(totalRow.opening_credit)}</td>
                      <td className="border-l border-t-2 border-border px-4 py-3 text-right font-bold tabular-nums">{money(totalRow.debit)}</td>
                      <td className="border-t-2 border-border px-4 py-3 text-right font-bold tabular-nums">{money(totalRow.credit)}</td>
                      <td className="border-l border-t-2 border-border px-4 py-3 text-right font-bold tabular-nums">{money(totalRow.closing_debit)}</td>
                      <td className="border-t-2 border-border px-4 py-3 text-right font-bold tabular-nums">{money(totalRow.closing_credit)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {totalRow && (
            <div className={cn("flex items-center gap-2 text-sm", balanced ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              {balanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {balanced
                ? "Balanced — debits equal credits in all three columns."
                : `Out of balance — closing debit and credit differ by ${formatNumber(outOfBalanceBy, 2)}.`}
            </div>
          )}
        </>
      )}
    </div>
  );
}
