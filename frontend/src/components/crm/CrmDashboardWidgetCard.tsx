import { ArrowDown, ArrowUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ChartCard } from "@/components/charts/chart-card";
import { BarChart, LineChart, DonutChart } from "@/components/charts/charts";
import { formatMoney, formatNumber } from "@/utils/currency";
import { cn } from "@/utils/cn";
import type { CrmDashboardWidgetRaw } from "@/services/api";

/**
 * This deployment is a donor/fundraising CRM, not a generic sales CRM — but
 * the backend is still the stock Frappe CRM app (CRM Lead/CRM Deal, "Won"/
 * "Lost" deal statuses, etc.), which we don't rename at the schema level
 * (that's vendored code, and Deal Status values are shared master data).
 * Instead we relabel the *display* strings the dashboard endpoint returns
 * (`widget.name` -> a fundraising-appropriate title), same idea for the
 * per-series keys inside axis charts (`leads`/`deals`/`won_deals`). Anything
 * not in these maps just falls back to the server's own label, so new/future
 * widgets never render blank.
 */
const WIDGET_TITLES: Record<string, string> = {
  total_leads: "Total Prospects",
  ongoing_deals: "Active Pledges",
  won_deals: "Donations Closed",
  average_won_deal_value: "Avg. Donation Received",
  average_deal_value: "Avg. Pledge Value",
  average_time_to_close_a_lead: "Avg. Time to Qualify a Prospect",
  average_time_to_close_a_deal: "Avg. Time to Close a Donation",
  sales_trend: "Fundraising Trend",
  forecasted_revenue: "Forecasted Funds",
  funnel_conversion: "Donor Conversion Funnel",
  deals_by_stage_donut: "Pledges by Stage",
  lost_deal_reasons: "Reasons Donors Declined",
  leads_by_source: "Prospects by Source",
  deals_by_source: "Donations by Source",
  deals_by_territory: "Donations by Region",
  deals_by_salesperson: "Donations by Fundraiser",
};

const SERIES_LABELS: Record<string, string> = {
  leads: "Prospects",
  deals: "Pledges",
  won_deals: "Donations",
  forecasted: "Forecasted",
  actual: "Actual",
};

function widgetTitle(widget: CrmDashboardWidgetRaw, fallback?: string): string {
  return WIDGET_TITLES[widget.name] ?? fallback ?? widget.name;
}
function seriesLabel(key: string): string {
  return SERIES_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isMoneyMetric(name: string): boolean {
  return /value|revenue/.test(name);
}
function isDurationMetric(name: string): boolean {
  return /time_to_close/.test(name);
}

/** A single `number_chart` widget (e.g. Total Prospects, Donations Closed, Avg. Pledge Value). */
function NumberWidget({ widget }: { widget: CrmDashboardWidgetRaw }) {
  const d = widget.data ?? {};
  const raw = typeof d.value === "number" ? d.value : 0;
  const display = isMoneyMetric(widget.name)
    ? formatMoney(raw, undefined, { compact: true })
    : isDurationMetric(widget.name)
      ? `${Math.round(raw)} days`
      : formatNumber(raw, 0);
  const delta = typeof d.delta === "number" ? d.delta : undefined;
  const positive = (delta ?? 0) >= 0;

  return (
    <Card className="flex flex-col justify-between gap-2 p-4">
      <span className="text-xs font-medium text-muted-foreground">{widgetTitle(widget, d.title)}</span>
      <span className="text-2xl font-bold tabular-nums leading-none">{display}</span>
      {delta !== undefined && (
        <span className={cn("flex items-center gap-1 text-xs font-medium", positive ? "text-emerald-600" : "text-rose-600")}>
          {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {Math.abs(delta).toFixed(1)}
          {d.deltaSuffix ?? "%"}
        </span>
      )}
    </Card>
  );
}

/** A single `axis_chart` widget (line/bar) — fundraising trend, funnel, lost reasons, donations by region/fundraiser. */
function AxisWidget({ widget }: { widget: CrmDashboardWidgetRaw }) {
  const d = widget.data ?? {};
  const rows: Record<string, any>[] = Array.isArray(d.data) ? d.data : [];
  const seriesSpec: { name: string; type?: string }[] = Array.isArray(d.series) ? d.series : [];
  const xKey: string = d.xAxis?.key ?? "name";
  const isBar = seriesSpec.some((s) => s.type === "bar") || seriesSpec.length === 0;
  const series = seriesSpec.length
    ? seriesSpec.map((s) => ({ key: s.name, label: seriesLabel(s.name) }))
    : [{ key: "count", label: "Count" }];
  const Chart = isBar ? BarChart : LineChart;

  return (
    <ChartCard title={widgetTitle(widget, d.title)} subtitle={d.subtitle}>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No data yet</p>
      ) : (
        <Chart data={rows} series={series} xKey={xKey} height={240} legend={series.length > 1} />
      )}
    </ChartCard>
  );
}

/** A single `donut_chart` widget — pledges by stage/source, prospects by source. */
function DonutWidget({ widget }: { widget: CrmDashboardWidgetRaw }) {
  const d = widget.data ?? {};
  const rows: Record<string, any>[] = Array.isArray(d.data) ? d.data : [];
  const categoryKey: string = d.categoryColumn ?? "name";
  const valueKey: string = d.valueColumn ?? "count";
  const pieData = rows.map((r) => ({ label: String(r[categoryKey] ?? "—"), value: Number(r[valueKey] ?? 0) }));

  return (
    <ChartCard title={widgetTitle(widget, d.title)} subtitle={d.subtitle}>
      {pieData.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No data yet</p>
      ) : (
        <DonutChart data={pieData} height={240} />
      )}
    </ChartCard>
  );
}

/** Renders one dashboard widget by its server-declared `type`. Returns null for spacers. */
export function CrmDashboardWidgetCard({ widget }: { widget: CrmDashboardWidgetRaw }) {
  switch (widget.type) {
    case "number_chart":
      return <NumberWidget widget={widget} />;
    case "axis_chart":
      return <AxisWidget widget={widget} />;
    case "donut_chart":
      return <DonutWidget widget={widget} />;
    default:
      return null;
  }
}
