import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { FileText, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ChartCard } from "@/components/charts/chart-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { cn } from "@/utils/cn";
import {
  DrillDialog,
  AnalyticsTabs,
  InsightStrip,
  KpiTile,
  PeriodBar,
  WidgetChart,
  isEmptyWidget,
  moduleMeta,
  useModuleDashboard,
  usePeriod,
  type Kpi,
} from "./analytics-kit";

/** One module's dashboard (Accounts, Purchase, Production, Stock, Sales, HR, Payroll, Assets) for a fiscal period. */
export function AnalyticsDashboardPage({ module: fixedModule }: { module?: string } = {}) {
  const params = useParams();
  const module = fixedModule ?? params.module ?? "accounts";
  const meta = moduleMeta(module);
  const { company, companyCurrency } = useCompanyContext();
  const currency = companyCurrency ?? "PKR";
  const period = usePeriod();
  const [refreshToken, setRefreshToken] = useState(0);
  const [tolerance, setTolerance] = useState(5);
  const [drill, setDrill] = useState<Kpi | null>(null);
  const { dash, error, isLoading, isValidating, mutate, notPermitted } = useModuleDashboard(
    module,
    period.range,
    company,
    refreshToken,
    !!meta && !period.invalid,
    module === "procurement" ? tolerance : undefined,
  );

  if (!meta) return <Navigate to="/analytics/accounts" replace />;
  if (notPermitted)
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        You don't have access to the {meta.label} dashboard. Ask an administrator for read access to its records.
      </Card>
    );
  const Icon = meta.icon;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${meta.label} dashboard`}
        subtitle={`${meta.subtitle} · ${period.label}`}
        icon={<Icon className="h-5 w-5" />}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRefreshToken((t) => t + 1);
              void mutate();
            }}
            disabled={isValidating}
          >
            <RefreshCw className={cn("mr-1.5 h-4 w-4", isValidating && "animate-spin")} /> Refresh
          </Button>
        }
      />

      <div className="-mt-2">
        <AnalyticsTabs />
      </div>

      <PeriodBar period={period} company={company} module={module} />

      {module === "procurement" && (
        <Card className="flex flex-wrap items-center gap-3 p-3 text-xs">
          <span className="font-medium text-muted-foreground">Rate tolerance vs standard</span>
          <div className="flex gap-1 rounded-md bg-muted p-1">
            {[2, 5, 10, 15].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTolerance(t)}
                className={cn("rounded px-2.5 py-1 font-medium", tolerance === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                ±{t}%
              </button>
            ))}
          </div>
          <span className="text-muted-foreground">
            Standard = "Standard Buying" price when within 0.5×–2× of actual, else the item's average purchase rate. Lines beyond ±200% are treated as suspect.
          </span>
        </Card>
      )}

      {period.invalid && <p className="text-sm text-rose-600">The start date must be before the end date.</p>}
      {error && (
        <Card className="border-rose-500/40 p-4 text-sm text-rose-600">
          Could not load the dashboard: {(error as any)?.message ?? String(error)}
        </Card>
      )}

      {/* KPIs */}
      {isLoading && !dash ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-lg" />
          ))}
        </div>
      ) : dash ? (
        <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4 transition-opacity", isValidating && "opacity-60")}>
          {dash.kpis.map((k) => (
            <KpiTile key={k.key} kpi={k} currency={currency} accent={meta.accent} onClick={() => setDrill(k)} />
          ))}
        </div>
      ) : null}

      {dash?.insights && <InsightStrip insights={dash.insights} />}

      {module === "financials" && (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Full statements:</span>
          {[
            ["Profit and Loss", "/accounting/reports/profit-and-loss"],
            ["Balance Sheet", "/accounting/reports/balance-sheet"],
            ["Cash Flow", "/accounting/reports/cash-flow"],
            ["Trial Balance", "/accounting/reports/trial-balance"],
            ["General Ledger", "/accounting/reports/general-ledger"],
          ].map(([label, to]) => (
            <Link
              key={to}
              to={to}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary hover:text-primary"
            >
              <FileText className="h-3.5 w-3.5" /> {label}
            </Link>
          ))}
        </Card>
      )}

      {/* charts */}
      {isLoading && !dash ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className={cn("h-[340px] rounded-lg", i % 3 === 0 && "lg:col-span-2")} />
          ))}
        </div>
      ) : dash ? (
        <div className={cn("grid gap-4 lg:grid-cols-3 transition-opacity", isValidating && "opacity-60")}>
          {dash.widgets.map((w) => (
            <ChartCard key={w.id} title={w.title} subtitle={w.subtitle ?? undefined} className={cn(w.span >= 2 && "lg:col-span-2", w.span >= 3 && "lg:col-span-3")}>
              {isEmptyWidget(w) ? (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No data in this period.</div>
              ) : (
                <WidgetChart w={w} currency={currency} />
              )}
            </ChartCard>
          ))}
        </div>
      ) : null}

      {dash?.generated_at && (
        <p className="text-right text-[11px] text-muted-foreground">
          Figures as of {dash.generated_at.slice(0, 16)} · cached up to 15 minutes · deltas compare the last month in the period with the month before
        </p>
      )}

      <DrillDialog
        module={module}
        kpi={drill}
        range={period.range}
        company={company}
        currency={currency}
        tolerance={module === "procurement" ? tolerance : undefined}
        onClose={() => setDrill(null)}
      />
    </div>
  );
}
