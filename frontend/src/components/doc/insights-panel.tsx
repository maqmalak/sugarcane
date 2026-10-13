import { useState } from "react";
import useSWR from "swr";
import { BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { BarChart, LineChart } from "@/components/charts/charts";
import { docUrl } from "@/app/doc-routes";
import { postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { formatMoney, formatNumber } from "@/utils/currency";

type Fmt = "money" | "number" | "days" | "percent" | "text";
export interface InsightsData {
  tiles: { label: string; value: number | string | null; fmt: Fmt; sub?: string | null; tone: string }[];
  bars?: { label: string; pct: number; sub?: string | null; tone: string }[];
  lists?: { title: string; rows: { label: string; value: number; fmt: Fmt; sub?: string | null; link?: { doctype: string; name: string } | null }[] }[];
  /** Full-width summary tables (e.g. activity by account); `hrefKey` makes a column a link. */
  tables?: {
    title: string; subtitle?: string;
    columns: { key: string; label: string; fmt?: "money" | "number" | "drcr" | "share"; align?: "left" | "right"; hrefKey?: string }[];
    rows: Record<string, any>[]; total?: Record<string, any>;
  }[];
  chart?: { title: string; xKey: string; money?: boolean; type?: "bar" | "line"; series: { key: string; label: string; color?: string }[]; data: Record<string, any>[] };
}

const TONE: Record<string, string> = {
  primary: "from-primary/15", emerald: "from-emerald-500/15", amber: "from-amber-500/15", rose: "from-rose-500/15", sky: "from-sky-500/15", violet: "from-violet-500/15",
};
const BAR: Record<string, string> = { primary: "bg-primary", emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", sky: "bg-sky-500", violet: "bg-violet-500" };

export const fmtInsight = (v: number | string | null | undefined, f: Fmt, currency = "PKR") => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" || f === "text") return String(v);
  if (f === "money") return formatMoney(v, currency, { decimals: 2 });
  if (f === "days") return `${formatNumber(v, 0)} d`;
  if (f === "percent") return `${formatNumber(v, 1)}%`;
  return formatNumber(v, Math.abs(v) < 100 && v % 1 ? 2 : 0);
};

/**
 * Generic "at a glance" block: gradient KPI tiles, progress bars and short ranked lists, loaded from a whitelisted
 * method (`args` are passed through). Used by the selling documents; any form can reuse it.
 */
export function InsightsPanel({ method, args, cacheKey, currency = "PKR", loadingNote, omitTiles, hideBars, hideChart, collapsible, title = "Insights" }: {
  method: string; args: Record<string, unknown>; cacheKey: string | null; currency?: string; loadingNote?: string;
  /** Tile labels to drop (or `true` for all) — when the host page already shows those figures. */
  omitTiles?: string[] | true; hideBars?: boolean; hideChart?: boolean;
  /** Start collapsed to one bar naming the sections; "Show more" expands it. */
  collapsible?: boolean; title?: string;
}) {
  const [open, setOpen] = useState(!collapsible);
  const { data, isLoading } = useSWR(cacheKey, () => postCall<InsightsData>(method, args), { revalidateOnFocus: false });
  if (!cacheKey) return null;
  if (isLoading && !data)
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>
        {loadingNote && <p className="text-xs text-muted-foreground">{loadingNote}</p>}
      </div>
    );
  if (!data) return null;
  const lists = (data.lists ?? []).filter((l) => l.rows.length);
  const tiles = omitTiles === true ? [] : data.tiles.filter((t) => !(omitTiles ?? []).includes(t.label));
  const bars = hideBars ? [] : data.bars ?? [];
  const chart = hideChart ? undefined : data.chart;
  const tables = data.tables ?? [];
  const hasChart = Boolean(chart && chart.data.some((r) => chart.series.some((s) => Number(r[s.key]))));
  if (collapsible) {
    const sections = [...(hasChart ? [chart!.title] : []), ...tables.map((t) => t.title), ...(bars.length ? ["Progress"] : []), ...lists.map((l) => l.title)];
    if (!sections.length && !tiles.length) return null;
    const toggle = (
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-left shadow-sm transition-colors hover:bg-muted/40">
        <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-sm font-semibold">{title}</span>
        {!open && (
          <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">{sections.join(" · ")}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
          {open ? <>Show less <ChevronUp className="h-3.5 w-3.5" /></> : <>Show more <ChevronDown className="h-3.5 w-3.5" /></>}
        </span>
      </button>
    );
    if (!open) return toggle;
    return (
      <div className="space-y-4">
        {toggle}
        {renderBody()}
      </div>
    );
  }
  return renderBody();

  function renderBody() {
  return (
    <div className="space-y-4">
      {tiles.length > 0 && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className={cn("relative overflow-hidden bg-gradient-to-br to-transparent p-4", TONE[t.tone] ?? TONE.primary)}>
            <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
            <p className="mt-1 truncate text-xl font-bold tabular-nums">{fmtInsight(t.value, t.fmt, currency)}</p>
            {t.sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={t.sub}>{t.sub}</p>}
            <span className={cn("absolute inset-x-0 bottom-0 h-0.5", BAR[t.tone] ?? BAR.primary)} />
          </Card>
        ))}
      </div>}
      {hasChart && chart && (
        <Card className="p-5">
          <p className="mb-2 text-sm font-semibold">{chart.title}</p>
          {chart.type === "line" ? (
            <LineChart data={chart.data} xKey={chart.xKey} series={chart.series} height={240} money={chart.money} currency={currency} legend />
          ) : (
            <BarChart data={chart.data} xKey={chart.xKey} series={chart.series} height={240} money={chart.money} currency={currency} legend={chart.series.length > 1} />
          )}
        </Card>
      )}
      {tables.map((t) => <SummaryTable key={t.title} t={t} currency={currency} />)}
      {(bars.length > 0 || lists.length > 0) && (
        // With a progress card: 1/3 for it, lists share the rest. Without: lists in two wide columns (an odd last one spans both).
        <div className={cn("grid gap-4", bars.length ? "lg:grid-cols-3" : lists.length > 1 ? "lg:grid-cols-2" : "")}>
          {bars.length > 0 && (
            <Card className="space-y-3 p-5">
              <p className="text-sm font-semibold">Progress</p>
              {bars.map((b) => (
                <div key={b.label}>
                  <div className="mb-1 flex justify-between text-xs"><span className="font-medium">{b.label}</span><span className="tabular-nums text-muted-foreground">{formatNumber(b.pct, 1)}%{b.sub ? ` · ${b.sub}` : ""}</span></div>
                  <div className="h-2.5 rounded-full bg-muted"><div className={cn("h-2.5 rounded-full transition-[width] duration-500", BAR[b.tone] ?? BAR.primary)} style={{ width: `${b.pct}%` }} /></div>
                </div>
              ))}
            </Card>
          )}
          {lists.map((l, li) => {
            const max = Math.max(1, ...l.rows.map((r) => Math.abs(r.value)));
            return (
              <Card key={l.title} className={cn("p-5", bars.length ? "lg:col-span-2" : lists.length > 1 && lists.length % 2 === 1 && li === lists.length - 1 ? "lg:col-span-2" : "")}>
                <p className="mb-3 text-sm font-semibold">{l.title}</p>
                <ul className="max-h-80 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
                  {l.rows.map((r, i) => {
                    const u = r.link ? docUrl(r.link.doctype, r.link.name) : null;
                    return (
                      <li key={`${r.label}-${i}`}>
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                          {u ? <Link to={u.href} className="truncate font-medium text-primary hover:underline">{r.label}</Link> : <span className="truncate font-medium" title={r.label}>{r.label}</span>}
                          <span className="shrink-0 tabular-nums">{r.fmt !== "text" && <b>{fmtInsight(r.value, r.fmt, currency)}</b>}{r.sub ? <span className="ml-1.5 text-muted-foreground">{r.sub}</span> : null}</span>
                        </div>
                        {r.fmt !== "text" && <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary/80" style={{ width: `${r.fmt === "percent" ? Math.min(100, r.value) : (Math.abs(r.value) / max) * 100}%` }} /></div>}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
  }
}

function SummaryTable({ t, currency }: { t: NonNullable<InsightsData["tables"]>[number]; currency: string }) {
  const cell = (c: (typeof t.columns)[number], r: Record<string, any>) => {
    const v = r[c.key];
    if (v === undefined || v === null || v === "") return c.fmt === "share" ? null : "—";
    if (c.fmt === "money") return formatMoney(Number(v), currency, { decimals: 2 });
    if (c.fmt === "number") return formatNumber(Number(v), 0);
    if (c.fmt === "drcr") {
      const n = Number(v);
      return <span>{formatMoney(Math.abs(n), currency, { decimals: 2 })} <span className={cn("text-[11px] font-semibold", n >= 0 ? "text-sky-600 dark:text-sky-400" : "text-amber-600 dark:text-amber-400")}>{n >= 0 ? "Dr" : "Cr"}</span></span>;
    }
    if (c.fmt === "share") return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, Number(v))}%` }} /></div>
        <span className="text-[11px] tabular-nums text-muted-foreground">{formatNumber(Number(v), 1)}%</span>
      </div>
    );
    return c.hrefKey && r[c.hrefKey] ? <Link to={r[c.hrefKey]} className="font-medium text-primary hover:underline">{String(v)}</Link> : String(v);
  };
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border px-5 py-3">
        <p className="text-sm font-semibold">{t.title}</p>
        {t.subtitle && <p className="text-xs text-muted-foreground">{t.subtitle}</p>}
      </div>
      <div className="max-h-[28rem] overflow-auto scrollbar-thin">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-10 bg-card text-[11px] uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_hsl(var(--border))]">
            <tr>{t.columns.map((c) => <th key={c.key} className={cn("px-4 py-2", c.align === "right" ? "text-right" : "text-left")}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i} className="border-t border-border/60 hover:bg-muted/40">
                {t.columns.map((c) => <td key={c.key} className={cn("px-4 py-2", c.align === "right" && "text-right tabular-nums")}>{cell(c, r)}</td>)}
              </tr>
            ))}
          </tbody>
          {t.total && (
            <tfoot className="sticky bottom-0 bg-card font-semibold shadow-[0_-1px_0_hsl(var(--border))]">
              <tr>{t.columns.map((c) => <td key={c.key} className={cn("px-4 py-2", c.align === "right" && "text-right tabular-nums")}>{c.fmt === "share" ? null : cell({ ...c, hrefKey: undefined }, t.total!)}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
