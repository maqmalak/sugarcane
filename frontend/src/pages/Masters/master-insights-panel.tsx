import useSWR from "swr";
import { BarChart3 } from "lucide-react";
import type { ExtraContext } from "@/components/doc/doc-config";
import { Card } from "@/components/ui/card";
import { BarChart } from "@/components/charts/charts";
import { postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { formatMoney, formatNumber } from "@/utils/currency";

type Fmt = "money" | "number" | "days" | "percent";
interface Tile { label: string; value: number | string | null; fmt: Fmt; sub?: string | null; tone: string }
interface Insights {
  period: { from: string; to: string };
  tiles: Tile[];
  trend: { title: string; series: { key: string; label: string }[]; data: Record<string, number | string>[] };
  lists: { title: string; rows: { label: string; value: number; fmt: Fmt; sub?: string | null }[] }[];
}

const TONES: Record<string, string> = {
  primary: "from-primary/15 text-primary", emerald: "from-emerald-500/15 text-emerald-600 dark:text-emerald-400", amber: "from-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "from-rose-500/15 text-rose-600 dark:text-rose-400", sky: "from-sky-500/15 text-sky-600 dark:text-sky-400", violet: "from-violet-500/15 text-violet-600 dark:text-violet-400",
};
const BAR: Record<string, string> = { primary: "bg-primary", emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", sky: "bg-sky-500", violet: "bg-violet-500" };

const fmt = (v: number | string | null | undefined, f: Fmt, compact = false) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  if (f === "money") return formatMoney(v, "PKR", compact ? { compact: true } : {});
  if (f === "days") return `${formatNumber(v, 0)} d`;
  if (f === "percent") return `${formatNumber(v, 1)}%`;
  return compact && Math.abs(v) >= 100_000 ? formatMoney(v, "PKR", { compact: true, symbol: "" }) : formatNumber(v, Math.abs(v) < 100 && v % 1 ? 2 : 0);
};

/** "At a glance" block on master forms: KPI tiles, a 12-month trend and ranked lists (server: master_insights). */
export function MasterInsightsPanel({ doctype, name, isNew }: ExtraContext & { doctype: string }) {
  const { data, isLoading, error } = useSWR(!isNew && name ? `master-insights:${doctype}:${name}` : null,
    () => postCall<Insights>("sugarcane.erp_insights.master_insights.get_master_insights", { doctype, name }), { revalidateOnFocus: false });
  if (isNew || !name) return null;
  if (isLoading && !data) return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>;
  if (error || !data) return null;
  const hasTrend = data.trend.data.some((d) => data.trend.series.some((s) => Number(d[s.key])));
  const money = data.trend.title.toLowerCase().includes("invoiced") || data.trend.title.toLowerCase().includes("sales and purchases");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5 text-primary" /> At a glance · fiscal year {data.period.from} → {data.period.to}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {data.tiles.map((t) => (
          <Card key={t.label} className={cn("relative overflow-hidden bg-gradient-to-br to-transparent p-4", TONES[t.tone] ?? TONES.primary)}>
            <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
            <p className="mt-1 truncate text-xl font-bold tabular-nums text-foreground" title={typeof t.value === "number" ? fmt(t.value, t.fmt) : undefined}>{fmt(t.value, t.fmt, true)}</p>
            {t.sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={t.sub}>{t.sub}</p>}
            <span className={cn("absolute inset-x-0 bottom-0 h-0.5", BAR[t.tone] ?? BAR.primary)} />
          </Card>
        ))}
      </div>
      <div className={cn("grid gap-4", data.lists.length > 1 ? "lg:grid-cols-3" : "lg:grid-cols-5")}>
        {hasTrend && (
          <Card className={cn("p-5", data.lists.length > 1 ? "lg:col-span-3" : "lg:col-span-3")}>
            <p className="mb-2 text-sm font-semibold">{data.trend.title}</p>
            <BarChart data={data.trend.data as any} xKey="month" series={data.trend.series} height={220} money={money} currency="PKR" legend={data.trend.series.length > 1} />
          </Card>
        )}
        {data.lists.filter((l) => l.rows.length).map((l) => {
          const max = Math.max(1, ...l.rows.map((r) => Math.abs(r.value)));
          return (
            <Card key={l.title} className={cn("p-5", data.lists.length > 1 ? "" : "lg:col-span-2")}>
              <p className="mb-3 text-sm font-semibold">{l.title}</p>
              <ul className="space-y-2.5">
                {l.rows.map((r, i) => (
                  <li key={`${r.label}-${i}`}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                      <span className="truncate font-medium" title={r.label}>{r.label}</span>
                      <span className="shrink-0 tabular-nums"><b>{fmt(r.value, r.fmt)}</b>{r.sub ? <span className="ml-1.5 text-muted-foreground">{r.sub}</span> : null}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary/80" style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
