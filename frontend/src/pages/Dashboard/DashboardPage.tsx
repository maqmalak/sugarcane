import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, Gauge, RefreshCw, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ChartCard } from "@/components/charts/chart-card";
import { BarChart, CHART_COLORS, ComboChart, LineChart } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useInstalledApps } from "@/hooks/useInstalledApps";
import { cn } from "@/utils/cn";
import {
  AnalyticsTabs,
  DeltaPill,
  DrillDialog,
  INSIGHT_STYLE,
  InsightRow,
  MODULES,
  PeriodBar,
  Sparkline,
  formatKpi,
  useModuleDashboard,
  usePeriod,
  type DashboardData,
  type Insight,
  type Kpi,
  type ModuleId,
  usePermittedDashboardModules,
} from "@/pages/Analytics/analytics-kit";

const kpiOf = (d: DashboardData | undefined, key: string): Kpi | undefined => d?.kpis.find((k) => k.key === key);
const widgetOf = (d: DashboardData | undefined, id: string) => d?.widgets.find((w) => w.id === id);

/** The KPIs each module card shows (first one also drives the card's sparkline). */
const CARD_KPIS: Record<ModuleId, string[]> = {
  accounts: ["income", "profit", "margin"],
  sales: ["sales", "collected", "outstanding"],
  purchase: ["purchases", "po_count", "payable"],
  stock: ["value", "inward", "turnover"],
  hr: ["headcount", "attendance", "absent"],
  payroll: ["gross", "net", "employees"],
  production: ["produced", "yield", "downtime"],
  wo_analysis: ["ontime", "open", "completion"],
  jc_analysis: ["efficiency", "wait", "rework"],
  assets: ["gross", "nbv", "depreciation"],
  financials: ["gross_profit", "total_assets", "current_ratio"],
  procurement: ["cycle", "ontime", "ppv_rate"],
  so_analysis: ["booked", "otif", "open_book"],
  do_analysis: ["deliveries", "ontime", "unbilled"],
  export_analysis: ["export_value", "export_share", "open_lc"],
  import_analysis: ["import_value", "uplift", "dwell"],
  quality: ["acceptance", "rft", "open_nc"],
};

/** Merge several monthly series (all labelled "Jul 26" …) into one row per month. */
function mergeMonths(...parts: { rows?: Record<string, any>[]; pick: Record<string, string> }[]) {
  const map = new Map<string, Record<string, any>>();
  parts.forEach(({ rows, pick }) =>
    (rows ?? []).forEach((r) => {
      const row = map.get(r.month) ?? { month: r.month };
      Object.entries(pick).forEach(([from, to]) => (row[to] = Number(r[from] ?? 0)));
      map.set(r.month, row);
    }),
  );
  return [...map.values()];
}

// ------------------------------------------------------------------ hero
function HeroMetric({ label, kpi, currency, sub, onClick }: { label: string; kpi?: Kpi; currency: string; sub?: string; onClick?: () => void }) {
  return (
    <div
      role={kpi && onClick ? "button" : undefined}
      tabIndex={kpi && onClick ? 0 : undefined}
      title={kpi && onClick ? "Show the documents behind this figure" : undefined}
      onClick={kpi ? onClick : undefined}
      onKeyDown={(e) => {
        if (kpi && onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-xl bg-white/[0.16] p-4 shadow-lg shadow-black/20 ring-1 ring-white/30 backdrop-blur",
        kpi && onClick && "cursor-pointer transition hover:bg-white/[0.24] hover:ring-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-bold uppercase tracking-wide text-white/90">{label}</span>
        {kpi && <DeltaPill delta={kpi.delta} invert={kpi.invert} className="bg-white/25 font-bold text-white ring-1 ring-white/30" />}
      </div>
      {kpi ? (
        <>
          <p className="truncate text-3xl font-extrabold tabular-nums text-white drop-shadow-sm">{formatKpi(kpi.value, kpi.format, currency)}</p>
          <p className="truncate text-xs font-medium text-white/85">{sub ?? (kpi.avg != null ? `Avg ${formatKpi(kpi.avg, kpi.format, currency)} per month` : " ")}</p>
          <div className="-mx-4 -mb-4">
            <Sparkline values={kpi.spark} color="rgba(255,255,255,0.9)" height={44} />
          </div>
        </>
      ) : (
        <div className="space-y-2 py-1">
          <div className="h-8 w-32 animate-pulse rounded bg-white/15" />
          <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
          <div className="h-10" />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ module card
function ModuleCard({ id, dash, currency }: { id: ModuleId; dash?: DashboardData; currency: string }) {
  const meta = MODULES.find((m) => m.id === id)!;
  const Icon = meta.icon;
  const kpis = CARD_KPIS[id].map((k) => kpiOf(dash, k)).filter(Boolean) as Kpi[];
  const top = dash?.insights?.find((i) => i.level !== "info") ?? dash?.insights?.[0];
  return (
    <Link to={`/analytics/${id}`} className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <Card className="hover-lift flex h-full flex-col overflow-hidden">
        <div className="flex items-center gap-3 p-4 pb-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${meta.accent.replace(")", " / 0.12)")}`, color: meta.accent }}>
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{meta.label}</p>
            <p className="truncate text-[11px] text-muted-foreground">{meta.subtitle}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
        {dash ? (
          <>
            <div className="grid grid-cols-3 gap-2 px-4 py-2">
              {kpis.map((k) => (
                <div key={k.key} className="min-w-0">
                  <p className="truncate text-[11px] text-muted-foreground">{k.label}</p>
                  <p className="truncate text-base font-bold tabular-nums">{formatKpi(k.value, k.format, currency)}</p>
                </div>
              ))}
            </div>
            <div className="h-12">{kpis[0] && <Sparkline values={kpis[0].spark} color={meta.accent} height={48} />}</div>
            {top && (
              <div className="mt-auto flex items-start gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
                {(() => {
                  const S = INSIGHT_STYLE[top.level];
                  return <S.icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full", S.chip)} />;
                })()}
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{top.title}:</span> {top.text}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-12" />
          </div>
        )}
      </Card>
    </Link>
  );
}

// ------------------------------------------------------------------ page
export function DashboardPage() {
  const { company, companyCurrency } = useCompanyContext();
  const currency = companyCurrency ?? "PKR";
  const period = usePeriod();
  const [drill, setDrill] = useState<{ module: ModuleId; kpi: Kpi } | null>(null);
  const openDrill = (module: ModuleId, kpi?: Kpi) => kpi && setDrill({ module, kpi });
  const [refreshToken, setRefreshToken] = useState(0);
  const on = !period.invalid;
  // Production / WO / Export / Import read MicroMax-only doctypes: not requested, and their cards not shown,
  // on a site without micromax (e.g. the school).
  const { isDashboardModuleAvailable, isLoading: appsLoading } = useInstalledApps();
  // ...and dashboards this user can't read (e.g. GL-based accounts for a CRM-only user) are skipped too.
  const { isPermitted, isLoading: permsLoading } = usePermittedDashboardModules();
  const modOn = (m: ModuleId) => on && !appsLoading && isDashboardModuleAvailable(m);
  const hasProduction = modOn("production");
  const shownModules = MODULES.filter((m) => isDashboardModuleAvailable(m.id) && (permsLoading || isPermitted(m.id)));

  // One call per module, in parallel; each section renders as soon as its module arrives.
  const accounts = useModuleDashboard("accounts", period.range, company, refreshToken, on);
  const sales = useModuleDashboard("sales", period.range, company, refreshToken, on);
  const purchase = useModuleDashboard("purchase", period.range, company, refreshToken, on);
  const stock = useModuleDashboard("stock", period.range, company, refreshToken, on);
  const hr = useModuleDashboard("hr", period.range, company, refreshToken, on);
  const payroll = useModuleDashboard("payroll", period.range, company, refreshToken, on);
  const production = useModuleDashboard("production", period.range, company, refreshToken, modOn("production"));
  const assets = useModuleDashboard("assets", period.range, company, refreshToken, on);
  const financials = useModuleDashboard("financials", period.range, company, refreshToken, on);
  const procurement = useModuleDashboard("procurement", period.range, company, refreshToken, on);
  const so_analysis = useModuleDashboard("so_analysis", period.range, company, refreshToken, on);
  const do_analysis = useModuleDashboard("do_analysis", period.range, company, refreshToken, on);
  const export_analysis = useModuleDashboard("export_analysis", period.range, company, refreshToken, modOn("export_analysis"));
  const import_analysis = useModuleDashboard("import_analysis", period.range, company, refreshToken, modOn("import_analysis"));
  const quality = useModuleDashboard("quality", period.range, company, refreshToken, on);
  const wo_analysis = useModuleDashboard("wo_analysis", period.range, company, refreshToken, modOn("wo_analysis"));
  const jc_analysis = useModuleDashboard("jc_analysis", period.range, company, refreshToken, on);
  const all: Record<ModuleId, typeof accounts> = { accounts, purchase, procurement, production, wo_analysis, jc_analysis, stock, sales, so_analysis, do_analysis, export_analysis, import_analysis, quality, hr, payroll, assets, financials };
  const busy = Object.values(all).some((m) => m.isValidating);
  const loaded = Object.values(all).filter((m) => m.dash).length;

  const A = accounts.dash, S = sales.dash, P = production.dash, ST = stock.dash;

  const insights: Insight[] = useMemo(() => {
    const rank = { critical: 0, warning: 1, positive: 2, info: 3 } as const;
    return Object.values(all)
      .flatMap((m) => m.dash?.insights ?? [])
      .sort((a, b) => rank[a.level] - rank[b.level]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.dash, sales.dash, purchase.dash, procurement.dash, so_analysis.dash, do_analysis.dash, export_analysis.dash, import_analysis.dash, quality.dash, stock.dash, hr.dash, payroll.dash, production.dash, wo_analysis.dash, jc_analysis.dash, assets.dash, financials.dash]);
  const counts = { critical: 0, warning: 0, positive: 0, info: 0 } as Record<Insight["level"], number>;
  insights.forEach((i) => (counts[i.level] += 1));
  const [levelFilter, setLevelFilter] = useState<Insight["level"] | "all">("all");
  const shown = levelFilter === "all" ? insights : insights.filter((i) => i.level === levelFilter);

  // Cross-module series
  const pnl = useMemo(
    () =>
      mergeMonths({ rows: widgetOf(A, "pl")?.data, pick: { income: "income", expense: "expense" } }).map((r: any) => ({
        ...r,
        margin: r.income ? Math.round(((r.income - (r.expense ?? 0)) / r.income) * 1000) / 10 : null,
      })),
    [A],
  );
  const soldVsMade = useMemo(
    () =>
      mergeMonths(
        { rows: widgetOf(S, "trend")?.data, pick: { q: "sold" } },
        { rows: widgetOf(P, "output")?.data, pick: { produced: "produced" } },
      ),
    [S, P],
  );
  const cashConv = widgetOf(S, "flow")?.data;
  const costMix = widgetOf(A, "exp_mix")?.data as { label: string; value: number }[] | undefined;
  /** Largest expense accounts as vertical bars: "5101-1 - Cost of goods manufactured" → "Cost of goods manu…". */
  const costBars = useMemo(
    () =>
      costMix?.map((r, i) => {
        const name = r.label.replace(/^[\d-]+\s*-\s*/, "");
        return { account: name.length > 18 ? `${name.slice(0, 17)}…` : name, v: r.value, color: CHART_COLORS[i % CHART_COLORS.length] };
      }),
    [costMix],
  );
  const workingCapital = useMemo(() => {
    const rows = [
      { item: "Receivables", v: kpiOf(A, "receivable")?.value, c: "hsl(221 83% 53%)" },
      { item: "Stock", v: kpiOf(ST, "value")?.value, c: "hsl(199 89% 48%)" },
      { item: "Cash & bank", v: kpiOf(A, "cash")?.value, c: "hsl(160 84% 39%)" },
      { item: "Payables", v: kpiOf(A, "payable")?.value, c: "hsl(351 95% 59%)" },
    ];
    return rows.every((r) => r.v == null) ? undefined : rows.map((r) => ({ item: r.item, v: r.v ?? 0, color: r.c }));
  }, [A, ST]);
  const totals = pnl.reduce((t: { i: number; e: number }, r: any) => ({ i: t.i + (r.income ?? 0), e: t.e + (r.expense ?? 0) }), { i: 0, e: 0 });
  const periodMargin = totals.i ? ((totals.i - totals.e) / totals.i) * 100 : null;

  const chartSkeleton = <Skeleton className="h-[280px] rounded-md" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive Dashboard"
        subtitle={`Whole-mill performance · ${period.label}${company ? ` · ${company}` : ""}`}
        icon={<Gauge className="h-5 w-5" />}
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setRefreshToken((t) => t + 1);
              Object.values(all).forEach((m) => void m.mutate());
            }}
          >
            <RefreshCw className={cn("mr-1.5 h-4 w-4", busy && "animate-spin")} /> Refresh
          </Button>
        }
      />

      <div className="-mt-2">
        <AnalyticsTabs />
      </div>

      <PeriodBar period={period} company={company} page="executive" />

      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-700 via-violet-700 to-teal-600 p-5 text-white shadow-xl ring-1 ring-white/15 sm:p-6 dark:from-indigo-600 dark:via-violet-700 dark:to-teal-600">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="relative mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-teal-200">{period.label}</p>
            <h2 className="text-xl font-semibold sm:text-2xl">How the mill is performing</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {(["critical", "warning", "positive"] as const).map((lvl) => {
              const st = INSIGHT_STYLE[lvl];
              const Icon = lvl === "critical" ? AlertOctagon : lvl === "warning" ? AlertTriangle : CheckCircle2;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevelFilter((f) => (f === lvl ? "all" : lvl))}
                  className={cn("flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-medium ring-1 ring-white/30 transition hover:bg-white/25", levelFilter === lvl && "bg-white/30")}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="font-semibold tabular-nums">{counts[lvl]}</span> {st.label}
                </button>
              );
            })}
            <span className="flex items-center rounded-full bg-white/15 px-3 py-1 text-white/90 ring-1 ring-white/30">
              {loaded}/{shownModules.length} modules loaded
            </span>
          </div>
        </div>
        <div className="relative grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HeroMetric label="Revenue" kpi={kpiOf(A, "income")} currency={currency} onClick={() => openDrill("accounts", kpiOf(A, "income"))} />
          <HeroMetric
            label="Net profit"
            kpi={kpiOf(A, "profit")}
            currency={currency}
            onClick={() => openDrill("accounts", kpiOf(A, "profit"))}
            sub={kpiOf(A, "margin") ? `Margin ${formatKpi(kpiOf(A, "margin")!.value, "percent", currency)}` : undefined}
          />
          <HeroMetric label="Cash & bank" kpi={kpiOf(A, "cash")} currency={currency} sub={kpiOf(A, "cash")?.hint ?? undefined} onClick={() => openDrill("accounts", kpiOf(A, "cash"))} />
          {hasProduction ? (
            <HeroMetric
              label="Yarn produced"
              kpi={kpiOf(P, "produced")}
              currency={currency}
              onClick={() => openDrill("production", kpiOf(P, "produced"))}
              sub={kpiOf(P, "yield") ? `Yield ${formatKpi(kpiOf(P, "yield")!.value, "percent", currency)} · plan ${formatKpi(kpiOf(P, "achievement")?.value ?? 0, "percent", currency)}` : undefined}
            />
          ) : (
            <HeroMetric label="Receivables" kpi={kpiOf(A, "receivable")} currency={currency} onClick={() => openDrill("accounts", kpiOf(A, "receivable"))} />
          )}
        </div>
      </section>

      {/* Insights + headline charts */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="flex flex-col xl:row-span-2">
          <div className="flex items-center justify-between gap-2 border-b border-border p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Key insights</h3>
                <p className="text-[11px] text-muted-foreground">Generated from all modules for the period</p>
              </div>
            </div>
            {levelFilter !== "all" && (
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setLevelFilter("all")}>
                Show all
              </button>
            )}
          </div>
          {insights.length ? (
            <ul className="max-h-[660px] flex-1 space-y-0.5 overflow-y-auto p-2 scrollbar-thin">
              {shown.map((i, n) => (
                <InsightRow key={`${i.module}-${n}`} i={i} showModule />
              ))}
            </ul>
          ) : (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          )}
        </Card>

        <ChartCard
          className="xl:col-span-2"
          title="Revenue, expenses & profit margin"
          subtitle={periodMargin != null ? `Profit margin ${periodMargin.toFixed(1)}% for the period` : "Monthly"}
        >
          {pnl.length ? (
            <ComboChart
              data={pnl}
              xKey="month"
              money
              currency={currency}
              legend
              dualAxis
              series={[
                { key: "income", label: "Revenue" },
                { key: "expense", label: "Expenses", color: "hsl(351 95% 59%)" },
                { key: "margin", label: "Profit margin %", type: "line", axis: "right", color: "hsl(160 84% 39%)" },
              ]}
            />
          ) : (
            chartSkeleton
          )}
        </ChartCard>

        <ChartCard
          className="xl:col-span-2"
          title={hasProduction ? "Sold vs produced" : "Quantity sold"}
          subtitle={hasProduction ? "Quantity invoiced to customers against quantity produced" : "Quantity invoiced to customers per month"}
        >
          {soldVsMade.length ? (
            <LineChart
              data={soldVsMade}
              xKey="month"
              legend
              series={[
                ...(hasProduction ? [{ key: "produced", label: "Produced", color: "hsl(173 80% 36%)" }] : []),
                { key: "sold", label: "Sold", color: "hsl(221 83% 53%)" },
              ]}
            />
          ) : (
            chartSkeleton
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Working capital" subtitle={`Balances on ${period.range.to}`}>
          {workingCapital ? (
            <BarChart data={workingCapital} xKey="item" money currency={currency} colorKey="color" series={[{ key: "v", label: "Amount" }]} />
          ) : (
            chartSkeleton
          )}
        </ChartCard>
        <ChartCard title="Cash conversion" subtitle="Ordered, invoiced and collected each month">
          {cashConv ? (
            <LineChart
              data={cashConv}
              xKey="month"
              money
              currency={currency}
              legend
              series={[
                { key: "ordered", label: "Ordered" },
                { key: "invoiced", label: "Invoiced" },
                { key: "collected", label: "Collected" },
              ]}
            />
          ) : (
            chartSkeleton
          )}
        </ChartCard>
        <ChartCard title="Cost structure" subtitle="Largest expense accounts">
          {costBars ? (
            <BarChart data={costBars} xKey="account" money currency={currency} colorKey="color" angledLabels height={280} series={[{ key: "v", label: "Expense" }]} />
          ) : (
            chartSkeleton
          )}
        </ChartCard>
      </div>

      {/* Module cards */}
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">By module</h3>
          <Link to="/analytics/accounts" className="text-xs text-primary hover:underline">
            Open analytics <ArrowRight className="inline h-3 w-3" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shownModules.map((m) => (
            <ModuleCard key={m.id} id={m.id} dash={all[m.id].dash} currency={currency} />
          ))}
        </div>
      </div>

      <p className="text-right text-[11px] text-muted-foreground">
        Deltas compare the last month in the period with the month before · figures cached up to 15 minutes
      </p>

      <DrillDialog
        module={drill?.module ?? "accounts"}
        kpi={drill?.kpi ?? null}
        range={period.range}
        company={company}
        currency={currency}
        onClose={() => setDrill(null)}
      />
    </div>
  );
}
