/**
 * Report centre (/reports, ported from the real-estate app): every sugar-mill script report this user may open. A searchable catalogue of report
 * cards on the left; on the right the chosen report with quick date presets and filters, its own summary figures (or
 * column totals), a Table / Chart switch using the report's chart, and a sortable, searchable table with a totals row.
 * Excel / PDF downloads carry the same filters (sugarcane.exports.*); PDFs use the company letterhead.
 */
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Beaker, Boxes, ClipboardList, Factory, FileSpreadsheet, FileText, Leaf, Loader2,
  Receipt, RefreshCw, Scale, Search, Sparkles, Table2, TrendingUp, Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Sector, Tooltip, XAxis, YAxis } from "recharts";
import { axisShort, ChartTip, GRADIENTS, SERIES, SeriesLegend, useChartTheme, useSeriesPrefs, type SeriesStyle } from "@/sc/components/analytics/kit";
import { Empty, Skeleton } from "@/sc/components/ui/skeleton";
import { get } from "@/sc/lib/api";
import { date, money, num, todayISO } from "@/sc/lib/format";
import { cn } from "@/sc/lib/utils";
import { useTheme } from "@/sc/providers/theme";
import { StatusBadge } from "@/components/common/status-badge";

interface FilterDef { key: string; label: string; kind: "date" | "select" | "link" | "text" }
interface Entry { name: string; group: string; filters: string[]; filter_defs: FilterDef[]; description: string }
interface Column { label: string; fieldname: string; fieldtype: string }
interface Summary { label: string; value: number | string; datatype?: string; indicator?: string | null }
interface FrappeChart { type?: string; data?: { labels?: string[]; datasets?: { name?: string; values?: number[] }[] } }
interface Preview { columns: Column[]; rows: Record<string, unknown>[]; total: number; filters: Record<string, string | number>; summary: Summary[]; chart: FrappeChart | null; message: string | null; options: Record<string, { value: string; label: string }[]> }

const NUMERIC = new Set(["Currency", "Float", "Int", "Percent"]);
const GROUP: Record<string, { icon: typeof Wallet; tone: string }> = {
  "Crop Survey": { icon: Leaf, tone: "from-emerald-500 to-teal-600" },
  Indenting: { icon: ClipboardList, tone: "from-sky-500 to-indigo-600" },
  Procurement: { icon: Receipt, tone: "from-amber-500 to-orange-600" },
  Weighbridge: { icon: Scale, tone: "from-slate-500 to-slate-700" },
  "Cane Accounts": { icon: Wallet, tone: "from-violet-500 to-fuchsia-600" },
  Laboratory: { icon: Beaker, tone: "from-cyan-500 to-sky-600" },
  Production: { icon: Factory, tone: "from-orange-500 to-rose-600" },
  MIS: { icon: TrendingUp, tone: "from-teal-500 to-emerald-600" },
  "Purchase & Stores": { icon: Boxes, tone: "from-cyan-500 to-sky-600" },
  "Sugar Sales": { icon: Receipt, tone: "from-amber-500 to-orange-600" },
  Finance: { icon: Wallet, tone: "from-blue-500 to-indigo-600" },
  "HR & Payroll": { icon: ClipboardList, tone: "from-rose-500 to-pink-600" },
  Masters: { icon: Boxes, tone: "from-indigo-500 to-violet-600" },
};
const IND: Record<string, string> = { Green: "text-emerald-600", Red: "text-rose-600", Orange: "text-amber-600", Blue: "text-blue-600" };

function cell(v: unknown, type: string): string {
  if (v === null || v === undefined || v === "") return "";
  if (type === "Currency") return money(Number(v));
  if (type === "Percent") return `${Number(v).toFixed(1)}%`;
  if (type === "Float" || type === "Int") return num(Number(v));
  if (type === "Date") return date(String(v));
  return String(v);
}
const isStatus = (c: Column) => /status|state/i.test(c.fieldname) && c.fieldtype !== "Currency";

function iso(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function presets(): [string, string, string][] {
  const t = new Date(), y = t.getFullYear(), m = t.getMonth();
  const back = (months: number) => iso(new Date(y, m - months, t.getDate()));
  return [
    ["This month", iso(new Date(y, m, 1)), todayISO()],
    ["Last 3 months", back(3), todayISO()],
    ["Last 6 months", back(6), todayISO()],
    ["Last 12 months", back(12), todayISO()],
    ["This year", `${y}-01-01`, todayISO()],
  ];
}

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const { data: list, isLoading } = useQuery({ queryKey: ["sc-reports"], queryFn: () => get<Entry[]>("sugarcane.exports.catalogue"), staleTime: 600_000 });
  const groupParam = params.get("g");
  const report = params.get("r") ?? (groupParam ? list?.find((e) => e.group === groupParam)?.name : undefined) ?? list?.[0]?.name ?? "";
  const entry = list?.find((e) => e.name === report);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [find, setFind] = useState("");
  const [rowFind, setRowFind] = useState("");
  const [view, setView] = useState<"table" | "chart">("table");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const query = useMemo(() => JSON.stringify(Object.fromEntries(Object.entries(filters).filter(([k, v]) => v && entry?.filters.includes(k)))), [filters, entry]);
  const { data, isFetching, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["sc-report", report, query], enabled: Boolean(report), placeholderData: (p) => p,
    queryFn: () => get<Preview>("sugarcane.exports.preview", { report, filters: query }),
  });
  const groups = useMemo(() => {
    const g = new Map<string, Entry[]>();
    const q = find.trim().toLowerCase();
    for (const e of list ?? []) if (!q || `${e.name} ${e.description} ${e.group}`.toLowerCase().includes(q)) g.set(e.group, [...(g.get(e.group) ?? []), e]);
    return [...g.entries()];
  }, [list, find]);
  const url = (fmt: "xlsx" | "pdf") => `/api/method/sugarcane.exports.download?report=${encodeURIComponent(report)}&file_format=${fmt}&filters=${encodeURIComponent(query)}`;
  const value = (k: string) => filters[k] ?? String(data?.filters[k] ?? "");
  const setF = (k: string, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const pick = (name: string) => { setFilters({}); setRowFind(""); setSort(null); setView("table"); setParams({ r: name }, { replace: true }); };

  const cols = data?.columns ?? [];
  const rows = useMemo(() => {
    let r = data?.rows ?? [];
    const q = rowFind.trim().toLowerCase();
    if (q) r = r.filter((x) => cols.some((c) => String(x[c.fieldname] ?? "").toLowerCase().includes(q)));
    if (sort) {
      const c = cols.find((x) => x.fieldname === sort.key);
      const numeric = c && NUMERIC.has(c.fieldtype);
      r = [...r].sort((a, b) => {
        const va = a[sort.key], vb = b[sort.key];
        return (numeric ? Number(va ?? 0) - Number(vb ?? 0) : String(va ?? "").localeCompare(String(vb ?? ""), undefined, { numeric: true })) * sort.dir;
      });
    }
    return r;
  }, [data, rowFind, sort, cols]);
  const totals = useMemo(() => Object.fromEntries(cols.filter((c) => NUMERIC.has(c.fieldtype) && c.fieldtype !== "Percent")
    .map((c) => [c.fieldname, rows.reduce((a, r) => a + Number(r[c.fieldname] ?? 0), 0)])), [cols, rows]);
  // summary: the report's own figures, else the three largest money totals
  const summary: Summary[] = data?.summary?.length ? data.summary
    : cols.filter((c) => c.fieldtype === "Currency" && totals[c.fieldname]).sort((a, b) => Math.abs(totals[b.fieldname]) - Math.abs(totals[a.fieldname]))
      .slice(0, 4).map((c) => ({ label: `Total ${c.label}`, value: totals[c.fieldname], datatype: "Currency" }));
  // the report's own chart; otherwise one built from the table (first text column → labels, number columns → series)
  const chart = useMemo((): { rows: Record<string, string | number>[]; series: string[]; type: string; fromTable: boolean } | null => {
    const rc = data?.chart?.data;
    if (rc?.labels?.length) {
      // some reports send one dataset per document (Accounts Receivable: ~1,600) — keep the 8 largest, fold the rest into "Other"
      const all = (rc.datasets ?? []).map((d, k) => ({ name: d.name ?? `Series ${k + 1}`, values: rc.labels!.map((_, i) => Number(d.values?.[i] ?? 0)) }));
      const ranked = [...all].sort((a, b) => b.values.reduce((x, v) => x + Math.abs(v), 0) - a.values.reduce((x, v) => x + Math.abs(v), 0));
      // more than 12 datasets (unnamed, one per document) read best as one total per label; otherwise top 8 + "Other"
      const keep = all.length > 12 ? [{ name: "Total", values: rc.labels.map((_, i) => all.reduce((x, d) => x + d.values[i], 0)) }] : ranked.slice(0, 8);
      const rest = all.length > 12 ? [] : ranked.slice(8);
      if (rest.length) keep.push({ name: `Other (${rest.length})`, values: rc.labels.map((_, i) => rest.reduce((x, d) => x + d.values[i], 0)) });
      const series = keep.map((d) => d.name);
      return { rows: rc.labels.map((l, i) => Object.fromEntries([["label", l], ...keep.map((d) => [d.name, d.values[i]])])),
        series, type: data?.chart?.type ?? "bar", fromTable: false };
    }
    const labelCol = cols.find((c) => !NUMERIC.has(c.fieldtype));
    const numCols = cols.filter((c) => NUMERIC.has(c.fieldtype) && c.fieldtype !== "Percent").slice(0, 4);
    if (!labelCol || !numCols.length || !rows.length) return null;
    return { rows: rows.slice(0, 40).map((r) => Object.fromEntries([["label", String(r[labelCol.fieldname] ?? "")], ...numCols.map((c) => [c.label, Number(r[c.fieldname] ?? 0)])])),
      series: numCols.map((c) => c.label), type: "bar", fromTable: true };
  }, [data, cols, rows]);
  const G = GROUP[entry?.group ?? ""] ?? { icon: ClipboardList, tone: "from-slate-500 to-slate-700" };

  return (
    <div className="grid min-h-full gap-5 p-4 sm:p-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
      {/* catalogue */}
      <aside className="space-y-4 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:pr-1 scrollbar-thin">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/25"><Sparkles className="size-5" /></span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Report centre</h1>
            <p className="text-xs text-muted-foreground">{list?.length ?? 0} reports · preview, chart, Excel & PDF</p>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a report…" aria-label="Find a report"
            className="h-10 w-full rounded-xl border bg-card pl-9 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        {isLoading && <Skeleton className="h-64 rounded-2xl" />}
        {groups.map(([group, items]) => {
          const g = GROUP[group] ?? { icon: ClipboardList, tone: "from-slate-500 to-slate-700" };
          return (
            <div key={group}>
              <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <span className={cn("grid size-5 place-items-center rounded-md bg-gradient-to-br text-white", g.tone)}><g.icon className="size-3" /></span>{group}
                <span className="rounded-full bg-muted px-1.5 text-[10px]">{items.length}</span>
              </p>
              <div className="space-y-1">
                {items.map((e) => {
                  const on = e.name === report;
                  return (
                    <button key={e.name} type="button" onClick={() => pick(e.name)} aria-current={on}
                      className={cn("block w-full rounded-xl border px-3 py-2 text-left transition",
                        on ? "border-primary/50 bg-primary/10 shadow-sm ring-1 ring-primary/20" : "border-transparent hover:border-border hover:bg-card")}>
                      <span className={cn("block text-sm font-semibold", on && "text-primary")}>{e.name}</span>
                      {e.description && <span className="block text-[11px] leading-snug text-muted-foreground">{e.description}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!isLoading && !groups.length && <Empty title={find ? "No report matches" : "No reports for your role"} />}
      </aside>

      {/* report */}
      <section className="min-w-0 space-y-4">
        <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.08] via-transparent to-transparent" />
          <div className="relative flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md", G.tone)}><G.icon className="size-5" /></span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{entry?.group ?? "Report"}</p>
                <h2 className="truncate text-xl font-bold tracking-tight">{report || "Choose a report"}</h2>
                <p className="text-xs text-muted-foreground">
                  {entry?.description}{data ? ` · ${num(data.total)} rows${data.total > data.rows.length ? ` (preview ${data.rows.length})` : ""}` : ""}
                  {dataUpdatedAt ? ` · run ${new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void refetch()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium shadow-sm hover:bg-muted" title="Run again">
                <RefreshCw className={cn("size-4", isFetching && "animate-spin")} /> Refresh
              </button>
              <a href={report ? url("xlsx") : undefined} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-emerald-500/20 dark:text-emerald-300">
                <FileSpreadsheet className="size-4" /> Excel
              </a>
              <a href={report ? url("pdf") : undefined} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-500/20 dark:text-rose-300">
                <FileText className="size-4" /> PDF
              </a>
            </div>
          </div>

          {/* filters */}
          {entry && entry.filters.length > 0 && (
            <div className="relative flex flex-wrap items-end gap-3 border-t bg-muted/20 px-4 py-3 sm:px-5">
              {entry.filters.includes("from_date") && (
                <>
                  <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">From<input type="date" className="field h-9 w-36" value={value("from_date")} onChange={(e) => setF("from_date", e.target.value)} /></label>
                  <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">To<input type="date" className="field h-9 w-36" value={value("to_date")} onChange={(e) => setF("to_date", e.target.value)} /></label>
                  <div className="flex flex-wrap gap-1">
                    {presets().map(([label, f, to]) => {
                      const on = value("from_date") === f && value("to_date") === to;
                      return (
                        <button key={label} type="button" onClick={() => setFilters((x) => ({ ...x, from_date: f, to_date: to }))}
                          className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition", on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{label}</button>
                      );
                    })}
                  </div>
                </>
              )}
              {entry.filter_defs.filter((f) => f.kind !== "date").map((f) => {
                const opts = data?.options?.[f.key] ?? [];
                return (
                  <label key={f.key} className="space-y-1 text-[11px] font-semibold text-muted-foreground">{f.label}
                    {opts.length || f.kind !== "text" ? (
                      <select className="field h-9 w-40" value={value(f.key)}
                        onChange={(e) => setFilters((x) => ({ ...x, [f.key]: e.target.value, ...(f.key === "circle" ? { village: "" } : {}) }))}>
                        <option value="">{f.key === "season" ? "Active season" : `All`}</option>
                        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : <input className="field h-9 w-36" value={value(f.key)} onChange={(e) => setF(f.key, e.target.value)} />}
                  </label>
                );
              })}
              {Object.values(filters).some(Boolean) && <button type="button" onClick={() => setFilters({})} className="mb-2 text-xs text-muted-foreground underline-offset-2 hover:underline">Reset filters</button>}
            </div>
          )}
        </div>

        {data?.message && <p className="rounded-xl border bg-sky-500/5 px-3 py-2 text-xs text-sky-800 dark:text-sky-200">{data.message}</p>}

        {/* summary */}
        {summary.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summary.map((s, i) => (
              <div key={s.label} className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm">
                <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: SERIES[i % SERIES.length] }} />
                <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                <p className={cn("mt-1 truncate text-2xl font-bold tabular-nums tracking-tight", s.indicator ? IND[s.indicator] : undefined)}>
                  {s.datatype === "Currency" ? money(Number(s.value), { compact: true }) : s.datatype === "Percent" ? `${Number(s.value).toFixed(1)}%` : typeof s.value === "number" ? num(s.value) : String(s.value)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* results */}
        <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
            <div className="flex rounded-lg border bg-muted/40 p-0.5">
              {([["table", Table2, "Table"], ["chart", BarChart3, "Chart"]] as const).map(([k, Icon, label]) => (
                <button key={k} type="button" disabled={k === "chart" && !chart} onClick={() => setView(k)}
                  className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition disabled:opacity-40",
                    view === k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="size-3.5" />{label}
                </button>
              ))}
            </div>
            {view === "table" && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input value={rowFind} onChange={(e) => setRowFind(e.target.value)} placeholder="Search in results…" aria-label="Search in results"
                  className="h-8 w-56 rounded-lg border bg-background pl-8 pr-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
            )}
            {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>

          {error ? <div className="p-6 text-sm text-rose-600">{(error as Error).message}</div>
            : !data ? <Skeleton className="m-4 h-64 rounded-xl" />
            : view === "chart" && chart ? (
              <ReportChart key={report} report={report} chart={chart} />
            ) : !rows.length ? <Empty title={rowFind ? "No rows match your search" : "No rows for these filters"} />
            : (
              <div className="max-h-[65vh] overflow-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                    <tr>
                      {cols.map((c) => {
                        const on = sort?.key === c.fieldname;
                        return (
                          <th key={c.fieldname} className={cn("whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", NUMERIC.has(c.fieldtype) ? "text-right" : "text-left")}>
                            <button type="button" onClick={() => setSort(on ? (sort!.dir === 1 ? { key: c.fieldname, dir: -1 } : null) : { key: c.fieldname, dir: 1 })}
                              className={cn("inline-flex items-center gap-1 hover:text-foreground", on && "text-foreground")}>
                              {c.label}{on ? (sort!.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={cn("border-t border-border/60 transition-colors hover:bg-primary/[0.05]", i % 2 === 1 && "bg-muted/20")}>
                        {cols.map((c, ci) => (
                          <td key={c.fieldname} className={cn("whitespace-nowrap px-3 py-2", NUMERIC.has(c.fieldtype) && "text-right tabular-nums", ci === 0 && "font-medium")}>
                            {isStatus(c) && r[c.fieldname] ? <StatusBadge status={String(r[c.fieldname])} /> : cell(r[c.fieldname], c.fieldtype)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {Object.keys(totals).length > 0 && (
                    <tfoot className="sticky bottom-0 bg-muted/95 font-semibold backdrop-blur">
                      <tr className="border-t-2 border-border">
                        {cols.map((c, ci) => (
                          <td key={c.fieldname} className={cn("whitespace-nowrap px-3 py-2.5", NUMERIC.has(c.fieldtype) && "text-right tabular-nums")}>
                            {ci === 0 ? `Total · ${num(rows.length)} rows` : c.fieldname in totals ? cell(totals[c.fieldname], c.fieldtype) : ""}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
        </div>
      </section>
    </div>
  );
}

type ChartType = "bar" | "line" | "area" | "pie" | "donut";
const TYPES: [ChartType, string][] = [["bar", "Bar"], ["line", "Line"], ["area", "Area"], ["pie", "Pie"], ["donut", "Donut"]];

/** Least-squares straight line through a series (for the trend overlay). */
function trend(values: number[]): number[] {
  const n = values.length;
  if (n < 2) return values;
  const xs = values.map((_, i) => i), mx = (n - 1) / 2, my = values.reduce((a, v) => a + v, 0) / n;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (values[i] - my), 0) / Math.max(xs.reduce((a, x) => a + (x - mx) ** 2, 0), 1e-9);
  return xs.map((x) => my + slope * (x - mx));
}

const defaults = (keys: string[]): Record<string, SeriesStyle> =>
  Object.fromEntries(keys.map((k, i) => [k, { from: GRADIENTS[i % GRADIENTS.length].from, to: GRADIENTS[i % GRADIENTS.length].to }]));

function ReportChart({ report, chart }: { report: string; chart: { rows: Record<string, string | number>[]; series: string[]; type: string; fromTable: boolean } }) {
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const [type, setType] = useState<ChartType>(chart.type === "line" ? "line" : chart.type === "pie" ? "pie" : chart.type === "donut" ? "donut" : "bar");
  const [showTrend, setShowTrend] = useState(false);
  const [slice, setSlice] = useState(chart.series[0] ?? "");
  const [hover, setHover] = useState<number | null>(null);
  // series colours / visibility per report, and slice colours / visibility for pie & donut — remembered in this browser
  const prefs = useSeriesPrefs(`re-report-chart:${report}`, defaults(chart.series));
  const labels = chart.rows.map((r) => String(r.label));
  const slicePrefs = useSeriesPrefs(`re-report-pie:${report}`, defaults(labels));
  const colorOf = (s: string) => prefs.colors[s] ?? defaults([s])[s];
  const visible = chart.series.filter((s) => !prefs.hidden.has(s));
  const trendKey = visible[0] ?? chart.series[0];
  const rows = useMemo(() => {
    if (!showTrend || !trendKey) return chart.rows;
    const line = trend(chart.rows.map((r) => Number(r[trendKey] ?? 0)));
    return chart.rows.map((r, i) => ({ ...r, __trend: Math.round(line[i]) }));
  }, [chart, showTrend, trendKey]);
  const pieData = chart.rows.map((r) => ({ name: String(r.label), value: Math.max(0, Number(r[slice] ?? 0)) }))
    .filter((d) => d.value > 0 && !slicePrefs.hidden.has(d.name))
    .map((d) => ({ ...d, color: (slicePrefs.colors[d.name] ?? defaults([d.name])[d.name]).to }));
  const pieTotal = pieData.reduce((a, d) => a + d.value, 0);
  const gid = (s: string) => s.replace(/[^a-z0-9]/gi, "_");
  const axes = (
    <>
      <defs>
        {chart.series.map((s) => (
          <linearGradient key={`${s}-${colorOf(s).from}`} id={`rg-${gid(s)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorOf(s).to} stopOpacity={type === "area" ? 0.45 : 1} />
            <stop offset="100%" stopColor={colorOf(s).from} stopOpacity={type === "area" ? 0.05 : 0.85} />
          </linearGradient>
        ))}
      </defs>
      <CartesianGrid vertical={false} stroke={t.grid} />
      <XAxis dataKey="label" tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
      <YAxis tickFormatter={axisShort} tick={t.tick} stroke={t.axis} tickLine={false} axisLine={false} width={52} />
      <Tooltip content={<ChartTip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
    </>
  );
  const trendLine = showTrend && <Line key="__trend" dataKey="__trend" name={`Trend (${trendKey})`} stroke="hsl(var(--foreground))" strokeOpacity={0.6} strokeWidth={2} strokeDasharray="6 5" dot={false} type="linear" legendType="plainline" />;

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-muted/40 p-0.5">
          {TYPES.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setType(k)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition", type === k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}>{label}</button>
          ))}
        </div>
        {type !== "pie" && type !== "donut" ? (
          <button type="button" onClick={() => setShowTrend((v) => !v)} aria-pressed={showTrend}
            className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition", showTrend ? "border-primary/50 bg-primary/10 text-primary" : "hover:bg-muted")}>
            <TrendingUp className="size-3.5" /> Trend line
          </button>
        ) : chart.series.length > 1 && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Slice by
            <select className="field h-8 w-48 text-xs" value={slice} onChange={(e) => setSlice(e.target.value)}>{chart.series.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
        )}
        {chart.fromTable && <span className="ml-auto text-[11px] text-muted-foreground">Built from the table{chart.rows.length >= 40 ? " (first 40 rows)" : ""}</span>}
      </div>
      {type === "pie" || type === "donut" ? (
        <SeriesLegend colors={Object.fromEntries(labels.map((l) => [l, slicePrefs.colors[l] ?? defaults([l])[l]]))} hidden={slicePrefs.hidden}
          onToggle={slicePrefs.toggle} onColor={slicePrefs.setColor} onReset={slicePrefs.reset} customised={slicePrefs.customised} onSetHidden={slicePrefs.setHidden}
          series={labels.slice(0, 24).map((l) => ({ key: l, label: l }))} />
      ) : (
        <SeriesLegend colors={Object.fromEntries(chart.series.map((s) => [s, colorOf(s)]))} hidden={prefs.hidden}
          onToggle={prefs.toggle} onColor={prefs.setColor} onReset={prefs.reset} customised={prefs.customised} onSetHidden={prefs.setHidden}
          series={chart.series.map((s) => ({ key: s, label: s, value: money(chart.rows.reduce((a, r) => a + Number(r[s] ?? 0), 0), { compact: true }) }))} />
      )}
      <div className="relative h-[420px]">
        {type === "donut" && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center text-center">
            {hover !== null && pieData[hover] ? (
              <>
                <span className="mb-1 h-2 w-8 rounded-full" style={{ background: pieData[hover].color }} />
                <span className="max-w-[140px] truncate text-xs font-medium text-muted-foreground">{pieData[hover].name}</span>
                <span className="text-xl font-bold tabular-nums">{money(pieData[hover].value, { compact: true })}</span>
                <span className="text-xs font-semibold" style={{ color: pieData[hover].color }}>{pieTotal ? ((pieData[hover].value * 100) / pieTotal).toFixed(1) : 0}%</span>
              </>
            ) : (
              <>
                <span className="text-xs font-medium text-muted-foreground">Total {slice}</span>
                <span className="text-xl font-bold tabular-nums">{money(pieTotal, { compact: true })}</span>
                <span className="text-xs text-muted-foreground">{pieData.length} items</span>
              </>
            )}
          </div>
        )}
        <ResponsiveContainer>
          {type === "pie" || type === "donut" ? (
            <PieChart>
              {type === "pie" && <Tooltip formatter={(v: number) => [`${money(v, { compact: true })} · ${pieTotal ? ((v * 100) / pieTotal).toFixed(1) : 0}%`, slice]} />}
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={type === "donut" ? "52%" : 0} outerRadius="78%" paddingAngle={2}
                stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}
                activeIndex={pieData.map((_, i) => i)} activeShape={(p: unknown) => { const sp = p as SliceProps; const on = hover !== null && pieData[hover]?.name === sp.name; return <PizzaSlice {...sp} lifted={on} dim={hover !== null && !on} />; }}
                onMouseEnter={(_: unknown, i: number) => setHover(i)} onMouseLeave={() => setHover(null)}
                label={({ percent }: { percent: number }) => (percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : "")} labelLine={false}>
                {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
            </PieChart>
          ) : type === "line" ? (
            <ComposedChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              {axes}
              {visible.map((s) => <Line key={s} dataKey={s} stroke={colorOf(s).to} strokeWidth={2.5} dot={{ r: 2.5, fill: colorOf(s).to }} type="monotone" />)}
              {trendLine}
            </ComposedChart>
          ) : type === "area" ? (
            <ComposedChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              {axes}
              {visible.map((s) => <Area key={s} dataKey={s} stroke={colorOf(s).to} fill={`url(#rg-${gid(s)})`} strokeWidth={2} type="monotone" />)}
              {trendLine}
            </ComposedChart>
          ) : (
            <ComposedChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              {axes}
              {visible.map((s) => <Bar key={s} dataKey={s} fill={`url(#rg-${gid(s)})`} radius={[6, 6, 0, 0]} maxBarSize={40} />)}
              {trendLine}
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
      {(type === "pie" || type === "donut") && (
        <p className="text-center text-xs text-muted-foreground">
          {hover !== null && pieData[hover]
            ? <><b className="text-foreground">{pieData[hover].name}</b> · {money(pieData[hover].value, { compact: true })} · {pieTotal ? ((pieData[hover].value * 100) / pieTotal).toFixed(1) : 0}%</>
            : <>{slice} · total {money(pieTotal, { compact: true })} across {pieData.length} items — hover a slice</>}
        </p>
      )}
    </div>
  );
}

interface SliceProps { cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; startAngle: number; endAngle: number; fill: string; name: string }

/** A pizza slice: every slice sits a little out from the centre. On hover the slice glides further out, grows, gets a
 *  halo ring in its colour, and the other slices fade back. */
function PizzaSlice({ cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, lifted, dim }: SliceProps & { lifted: boolean; dim: boolean }) {
  const r = Math.PI / 180, off = lifted ? 18 : 6;
  const dx = Math.cos(-midAngle * r) * off, dy = Math.sin(-midAngle * r) * off;
  return (
    <g>
    {/* invisible hit area at the slice's resting place (stretched to cover where it moves), so the pulled-out slice doesn't slip from under the pointer and flicker */}
    <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 28} startAngle={startAngle} endAngle={endAngle} fill="transparent" />
    <g style={{
      pointerEvents: "none",
      transform: `translate(${dx}px, ${dy}px) scale(${lifted ? 1.05 : 1})`, transformOrigin: `${cx}px ${cy}px`,
      transition: "transform 220ms cubic-bezier(.2,.8,.3,1.2), opacity 180ms ease, filter 180ms ease",
      opacity: dim ? 0.35 : 1, cursor: "pointer",
      filter: lifted ? `drop-shadow(0 8px 14px rgb(0 0 0 / 0.28)) saturate(1.15)` : "drop-shadow(0 2px 3px rgb(0 0 0 / 0.12))",
    }}>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius} startAngle={startAngle} endAngle={endAngle}
        fill={fill} stroke="hsl(var(--card))" strokeWidth={2} cornerRadius={innerRadius ? 4 : 3} />
      {lifted && (
        <Sector cx={cx} cy={cy} innerRadius={outerRadius + 4} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle}
          fill={fill} opacity={0.55} cornerRadius={2} />
      )}
    </g>
    </g>
  );
}
