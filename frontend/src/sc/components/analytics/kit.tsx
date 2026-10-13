/**
 * Analytics kit for the Dashboard and Insights pages: KPI cards with sparkline and change badge, chart cards with an
 * insight footer, donut with centre total and legend, radial gauge, styled tooltip, highlight callouts and a sortable
 * data table with inline bars. Colours work in light and dark mode.
 */
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, ChevronUp, ChevronsUpDown, Info, Lightbulb, Minus, TrendingDown, TrendingUp, TriangleAlert, type LucideIcon } from "lucide-react";
import { cloneElement, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipProps } from "recharts";
import { money, num } from "@/sc/lib/format";
import { cn } from "@/sc/lib/utils";

export const C = {
  teal: "#0d9488", blue: "#3b82f6", indigo: "#6366f1", violet: "#8b5cf6", amber: "#f59e0b", orange: "#f97316", red: "#ef4444",
  rose: "#e11d48", green: "#16a34a", emerald: "#10b981", sky: "#0ea5e9", slate: "#64748b",
};
export const SERIES = [C.teal, C.blue, C.amber, C.violet, C.rose, C.sky, C.emerald, C.orange, C.slate];
export const STATUS_TONE: Record<string, string> = {
  Available: C.emerald, Booked: C.blue, Sold: C.indigo, "Possession Given": C.violet, Blocked: C.slate, Reserved: C.amber, Hold: C.orange,
  Paid: C.green, Due: C.amber, Overdue: C.red, Cancelled: C.slate, Unpaid: C.orange,
};
export const compact = (v: number) => money(v, { compact: true }).replace("Rs ", "");
/** Short axis ticks: 3.2Cr, 80L, 45K. */
export const axisShort = (v: number) => {
  const a = Math.abs(v);
  const f = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ""));
  return a >= 1e7 ? `${f(v / 1e7)}Cr` : a >= 1e5 ? `${f(v / 1e5)}L` : a >= 1e3 ? `${f(v / 1e3)}K` : String(v);
};

// ------------------------------------------------------------------ chart chrome
export function useChartTheme(dark: boolean) {
  return { axis: dark ? "#94a3b8" : "#64748b", grid: dark ? "rgba(148,163,184,.12)" : "rgba(100,116,139,.15)", tick: { fontSize: 11 } };
}

/** Recharts tooltip with a card look; `fmt` formats values (money by default). */
export function ChartTip({ active, payload, label, fmt = (v: number) => money(v) }: TooltipProps<number, string> & { fmt?: (v: number, key: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-xl border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      {label !== undefined && <p className="mb-1 font-semibold text-foreground">{label}</p>}
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-full" style={{ background: p.color ?? (p.payload as { fill?: string })?.fill }} />{p.name}</span>
          <span className="font-semibold tabular-nums text-foreground">{fmt(Number(p.value ?? 0), String(p.dataKey))}</span>
        </p>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ KPI card
export function Delta({ value, suffix = "%", invert = false, className = "" }: { value: number | null | undefined; suffix?: string; invert?: boolean; className?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const up = value > 0;
  const good = invert ? !up : up;
  const Icon = value === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
      value === 0 ? "bg-muted text-muted-foreground" : good ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/15 text-red-700 dark:text-red-300", className)}>
      <Icon className="size-3" />{Math.abs(value).toFixed(Math.abs(value) < 10 ? 1 : 0)}{suffix}
    </span>
  );
}

export function Sparkline({ data, color = C.teal, height = 36 }: { data: number[]; color?: string; height?: number }) {
  const id = useMemo(() => `sp${Math.random().toString(36).slice(2, 8)}`, []);
  const rows = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KpiCard({ icon: Icon, label, value, sub, delta, deltaInvert, spark, color = C.teal, to, progress, footer }: {
  icon: LucideIcon; label: string; value: string; sub?: ReactNode; delta?: number | null; deltaInvert?: boolean; spark?: number[]; color?: string;
  to?: string; progress?: number; footer?: ReactNode;
}) {
  const body = (
    <div className="group relative h-full overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full opacity-[0.12] blur-2xl" style={{ background: color }} />
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-9 place-items-center rounded-xl text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}><Icon className="size-[18px]" /></span>
        <Delta value={delta} invert={deltaInvert} />
      </div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
      {progress !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(progress, 100))}%`, background: color }} />
        </div>
      )}
      {spark && spark.length > 1 && <div className="-mx-1 mt-2"><Sparkline data={spark} color={color} /></div>}
      {footer && <div className="mt-2 border-t pt-2 text-xs text-muted-foreground [&_b]:whitespace-nowrap">{footer}</div>}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{body}</Link> : body;
}

// ------------------------------------------------------------------ chart card
export function ChartCard({ title, sub, actions, children, insight, className = "", bodyClass = "h-72" }: {
  title: string; sub?: string; actions?: ReactNode; children: ReactNode; insight?: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={cn("flex flex-col rounded-2xl border bg-card shadow-sm", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
        <div className="min-w-0">
          <h3 className="font-semibold tracking-tight">{title}</h3>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        {actions}
      </header>
      <div className={cn("min-h-0 flex-auto px-3 pb-3 pt-2 sm:px-4", bodyClass)}>{children}</div>
      {insight && (
        <footer className="flex items-start gap-2 border-t bg-muted/30 px-5 py-2.5 text-xs text-muted-foreground">
          <Lightbulb className="mt-px size-3.5 shrink-0 text-amber-500" /><span>{insight}</span>
        </footer>
      )}
    </section>
  );
}

export function Segmented<T extends string>({ value, onChange, options, accent = false }: { value: T; onChange: (v: T) => void; options: [T, string][]; accent?: boolean }) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/50 p-0.5 text-xs" role="radiogroup">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn("rounded-md px-2.5 py-1 font-medium transition", value === v ? (accent ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "bg-card text-foreground shadow-sm") : "text-muted-foreground hover:bg-background/70 hover:text-foreground")}>
          {l}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ donut
export interface Slice { name: string; value: number; color?: string; hint?: string }

export function Donut({ data, centerLabel, centerValue, fmt = num, height = 220, legendFmt }: {
  data: Slice[]; centerLabel: string; centerValue?: string; fmt?: (v: number) => string; height?: number; legendFmt?: (s: Slice) => string;
}) {
  // the centre figure is sized to the ring's hole (66% of the radius), so it never spills over the ring
  const box = useRef<HTMLDivElement>(null);
  const [hole, setHole] = useState(120);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setHole(Math.min(e.contentRect.width, e.contentRect.height) * 0.92 * 0.66 * 0.9));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = (text: string) => Math.max(11, Math.min(20, hole / Math.max(text.length * 0.62, 1)));
  const total = data.reduce((a, s) => a + s.value, 0);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover !== null ? data[hover] : null;
  return (
    <div className="grid h-full items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative" style={{ height }} ref={box}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="92%" paddingAngle={2} stroke="none"
              onMouseEnter={(_, i) => setHover(i)} onMouseLeave={() => setHover(null)} isAnimationActive={false}>
              {data.map((s, i) => <Cell key={s.name} fill={s.color ?? SERIES[i % SERIES.length]} opacity={hover === null || hover === i ? 1 : 0.35} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="mx-auto truncate text-[11px] uppercase tracking-wide text-muted-foreground" style={{ maxWidth: hole }}>{shown ? shown.name : centerLabel}</p>
            <p className="font-bold leading-tight tabular-nums" style={{ fontSize: fit(shown ? fmt(shown.value) : centerValue ?? fmt(total)) }}>
              {shown ? fmt(shown.value) : centerValue ?? fmt(total)}</p>
            {shown && total > 0 && <p className="text-xs text-muted-foreground">{((shown.value * 100) / total).toFixed(1)}%</p>}
          </div>
        </div>
      </div>
      <ul className="space-y-1.5 text-sm">
        {data.map((s, i) => (
          <li key={s.name} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            className={cn("flex items-center gap-2 rounded-lg px-2 py-1 transition", hover === i && "bg-muted")}>
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color ?? SERIES[i % SERIES.length] }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.name}</span>
              <span className="block truncate text-xs tabular-nums text-muted-foreground">{legendFmt ? legendFmt(s) : fmt(s.value)}</span>
            </span>
            <span className="w-11 text-right text-xs font-semibold tabular-nums">{total ? `${Math.round((s.value * 100) / total)}%` : "–"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ gauge
/** Half-ring gauge (220° arc) drawn as SVG, so it scales with its box and the figure always sits inside the ring.
 *  `label` is the figure shown in the middle (default: the rounded value); `sub` goes underneath. */
export function Gauge({ value, label, sub, color }: { value: number; label?: string; sub?: string; color?: string }) {
  const v = Math.max(0, Math.min(Number(value) || 0, 100));
  const tone = color ?? (v >= 80 ? C.green : v >= 60 ? C.amber : C.red);
  const cx = 100, cy = 100, r = 80, start = 200, sweep = 220;
  const pt = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)];
  const arc = (from: number, to: number) => {
    const [x1, y1] = pt(from), [x2, y2] = pt(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${from - to > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const text = label ?? `${Math.round(v)}%`;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 150" className="w-full max-w-56" role="img" aria-label={`${text}${sub ? ` ${sub}` : ""}`}>
        <path d={arc(start, start - sweep)} fill="none" stroke="hsl(var(--muted))" strokeWidth={16} strokeLinecap="round" />
        {v > 0 && <path d={arc(start, start - (sweep * v) / 100)} fill="none" stroke={tone} strokeWidth={16} strokeLinecap="round" />}
        <text x={cx} y={cy + 4} textAnchor="middle" dominantBaseline="middle" fill={tone}
          style={{ fontSize: text.length > 6 ? 30 : 38, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{text}</text>
      </svg>
      {sub && <p className="-mt-6 text-center text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ highlights
export interface Highlight { tone: "good" | "bad" | "warn" | "info"; text: string }

export function Highlights({ items }: { items: Highlight[] }) {
  if (!items.length) return null;
  const look = {
    good: [TrendingUp, "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-800 dark:text-emerald-200"],
    bad: [TrendingDown, "border-red-500/30 bg-red-500/[0.07] text-red-800 dark:text-red-200"],
    warn: [TriangleAlert, "border-amber-500/30 bg-amber-500/[0.08] text-amber-900 dark:text-amber-200"],
    info: [Info, "border-sky-500/30 bg-sky-500/[0.07] text-sky-900 dark:text-sky-200"],
  } as const;
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((h, i) => {
        const [Icon, cls] = look[h.tone];
        return (
          <div key={i} className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm", cls)}>
            <Icon className="mt-0.5 size-4 shrink-0" /><span>{h.text}</span>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ data table
export interface Col<T> {
  key: string; label: string; align?: "left" | "right" | "center"; width?: string;
  value?: (r: T) => number | string; render?: (r: T) => ReactNode; bar?: { color?: string | ((r: T) => string); max?: number }; hideSm?: boolean;
}

/** Sortable table with sticky header, optional rank and inline data bars (bar width = value / column max). */
export function DataTable<T>({ rows, cols, initialSort, rank = false, rowKey, onRow, dense = false, maxHeight }: {
  rows: T[]; cols: Col<T>[]; initialSort?: { key: string; dir: "asc" | "desc" }; rank?: boolean; rowKey: (r: T) => string;
  onRow?: (r: T) => string | undefined; dense?: boolean; maxHeight?: string;
}) {
  const [sort, setSort] = useState(initialSort);
  const val = (c: Col<T>, r: T) => (c.value ? c.value(r) : (r as Record<string, unknown>)[c.key] as number | string);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find((x) => x.key === sort.key);
    if (!c) return rows;
    return [...rows].sort((a, b) => {
      const x = val(c, a), y = val(c, b);
      const d = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
      return sort.dir === "asc" ? d : -d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, cols]);
  const maxes = useMemo(() => Object.fromEntries(cols.filter((c) => c.bar).map((c) => [c.key, c.bar?.max ?? Math.max(...rows.map((r) => Number(val(c, r)) || 0), 1)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, cols]);
  const toggle = (key: string) => setSort((s) => (s?.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const pad = dense ? "py-1.5" : "py-2.5";

  return (
    <div className="overflow-auto rounded-xl border" style={{ maxHeight }}>
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10">
          <tr>
            {rank && <th className="border-b bg-muted/80 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">#</th>}
            {cols.map((c) => (
              <th key={c.key} style={{ width: c.width }} className={cn("whitespace-nowrap border-b bg-muted/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur",
                c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left", c.hideSm && "hidden md:table-cell")}>
                <button className={cn("inline-flex items-center gap-1 hover:text-foreground", c.align === "right" && "flex-row-reverse")} onClick={() => toggle(c.key)}>
                  {c.label}
                  {sort?.key === c.key ? (sort.dir === "desc" ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />) : <ChevronsUpDown className="size-3 opacity-40" />}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const href = onRow?.(r);
            return (
              <tr key={rowKey(r)} className={cn("group transition-colors hover:bg-accent/60", href && "cursor-pointer")}
                onClick={href ? () => { window.location.href = href; } : undefined}>
                {rank && (
                  <td className={cn("border-b px-3 text-xs font-semibold text-muted-foreground", pad)}>
                    <span className={cn("grid size-6 place-items-center rounded-full", i === 0 ? "bg-amber-400/25 text-amber-700 dark:text-amber-300" : i === 1 ? "bg-slate-400/25" : i === 2 ? "bg-orange-400/20 text-orange-700 dark:text-orange-300" : "")}>{i + 1}</span>
                  </td>
                )}
                {cols.map((c) => {
                  const v = val(c, r);
                  const barColor = typeof c.bar?.color === "function" ? c.bar.color(r) : c.bar?.color ?? C.teal;
                  return (
                    <td key={c.key} className={cn("whitespace-nowrap border-b px-3", pad, c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : "", c.hideSm && "hidden md:table-cell")}>
                      {c.bar ? (
                        <div className="flex min-w-28 items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(2, ((Number(v) || 0) * 100) / (maxes[c.key] || 1))}%`, background: barColor }} />
                          </div>
                          <span className="w-16 text-right text-xs font-medium tabular-nums">{c.render ? c.render(r) : String(v ?? "")}</span>
                        </div>
                      ) : c.render ? c.render(r) : String(v ?? "")}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <p className="p-6 text-center text-sm text-muted-foreground">No data</p>}
    </div>
  );
}

export function Avatar({ name, color }: { name: string; color?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % SERIES.length;
  return <span className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: color ?? SERIES[h] }}>{initials}</span>;
}

export function Pill({ children, color }: { children: ReactNode; color: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${color}22`, color }}>
    <span className="size-1.5 rounded-full" style={{ background: color }} />{children}</span>;
}

export const pctDelta = (now: number, before: number) => (before ? ((now - before) * 100) / before : null);
export { Tooltip };

// ------------------------------------------------------------------ interactive series legend (show / hide, colour picker)
export interface SeriesStyle { from: string; to: string }
export const GRADIENTS: { name: string; from: string; to: string }[] = [
  { name: "Emerald", from: "#34d399", to: "#059669" }, { name: "Teal", from: "#2dd4bf", to: "#0f766e" }, { name: "Sky", from: "#7dd3fc", to: "#0284c7" },
  { name: "Indigo", from: "#a5b4fc", to: "#6366f1" }, { name: "Violet", from: "#c4b5fd", to: "#7c3aed" }, { name: "Amber", from: "#fcd34d", to: "#d97706" },
  { name: "Orange", from: "#fdba74", to: "#ea580c" }, { name: "Rose", from: "#fda4af", to: "#e11d48" }, { name: "Slate", from: "#cbd5e1", to: "#475569" },
  { name: "Lime", from: "#bef264", to: "#4d7c0f" },
];

/** Per-chart series colours and visibility, remembered in this browser (`storageKey`). */
export function useSeriesPrefs(storageKey: string, defaults: Record<string, SeriesStyle>) {
  const load = (): { colors: Record<string, SeriesStyle>; hidden: string[] } => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const v = JSON.parse(raw) as { colors?: Record<string, SeriesStyle>; hidden?: string[] };
        return { colors: { ...defaults, ...(v.colors ?? {}) }, hidden: v.hidden ?? [] };
      }
    } catch {
      /* storage blocked or bad JSON — use defaults */
    }
    return { colors: defaults, hidden: [] };
  };
  const [state, setState] = useState(load);
  const save = (next: typeof state) => {
    setState(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* not remembered */
    }
  };
  return {
    colors: state.colors,
    hidden: new Set(state.hidden),
    toggle: (key: string) => save({ ...state, hidden: state.hidden.includes(key) ? state.hidden.filter((k) => k !== key) : [...state.hidden, key] }),
    setHidden: (keys: string[]) => save({ ...state, hidden: keys }),
    setColor: (key: string, style: SeriesStyle) => save({ ...state, colors: { ...state.colors, [key]: style } }),
    reset: () => save({ colors: defaults, hidden: [] }),
    customised: state.hidden.length > 0 || Object.keys(defaults).some((k) => state.colors[k]?.from !== defaults[k].from),
  };
}

export function SeriesLegend({ series, colors, hidden, onToggle, onColor, onReset, customised, onSetHidden }: {
  series: { key: string; label: string; value?: string }[]; colors: Record<string, SeriesStyle>; hidden: Set<string>;
  onToggle: (key: string) => void; onColor: (key: string, s: SeriesStyle) => void; onReset?: () => void; customised?: boolean;
  /** Enables the All / None buttons. */
  onSetHidden?: (keys: string[]) => void;
}) {
  const [picking, setPicking] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picking) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setPicking(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [picking]);
  return (
    <div ref={box} className="flex flex-wrap items-center gap-1.5">
      {series.map((sr) => {
        const off = hidden.has(sr.key);
        const c = colors[sr.key];
        return (
          <div key={sr.key} className={cn("relative flex items-center rounded-full border text-xs transition", off ? "border-dashed opacity-50" : "bg-card shadow-sm",
            picking === sr.key && "ring-2 ring-ring/50")}>
            <button type="button" title="Change colour" aria-label={`Change ${sr.label} colour`} onClick={() => setPicking(picking === sr.key ? null : sr.key)}
              className="ml-1 grid size-5 place-items-center rounded-full hover:ring-2 hover:ring-ring/40">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }} />
            </button>
            <button type="button" aria-pressed={!off} title={off ? "Show" : "Hide"} onClick={() => onToggle(sr.key)}
              className={cn("flex items-center gap-1.5 py-1 pl-1 pr-2.5", off && "line-through")}>
              <span className="font-medium text-foreground">{sr.label}</span>
              {sr.value && <span className="tabular-nums text-muted-foreground">{sr.value}</span>}
            </button>
            {picking === sr.key && (
              <div className="absolute left-0 top-full z-30 mt-1.5 w-60 rounded-xl border bg-popover p-2 opacity-100 shadow-xl" role="dialog" aria-label={`${sr.label} colour`}>
                <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{sr.label} colour</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {GRADIENTS.map((g) => (
                    <button key={g.name} type="button" title={g.name} onClick={() => { onColor(sr.key, { from: g.from, to: g.to }); setPicking(null); }}
                      className={cn("grid h-8 place-items-center rounded-lg ring-offset-2 ring-offset-popover", c.from === g.from && "ring-2 ring-ring")}
                      style={{ background: `linear-gradient(135deg, ${g.from}, ${g.to})` }}>
                      {c.from === g.from && <Check className="size-3.5 text-white drop-shadow" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {onSetHidden && series.length > 1 && <AllNone allOn={hidden.size === 0} noneOn={series.every((x) => hidden.has(x.key))} onAll={() => onSetHidden([])} onNone={() => onSetHidden(series.map((x) => x.key))} />}
      {customised && onReset && <button type="button" onClick={onReset} className="ml-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline">Reset</button>}
    </div>
  );
}

/** Chart fill opacity (0.1–1), remembered per chart in this browser. */
export function useChartOpacity(storageKey: string, initial = 0.55) {
  const [v, setV] = useState<number>(() => {
    try { const raw = localStorage.getItem(storageKey); const n = raw === null ? NaN : Number(raw); return Number.isFinite(n) ? Math.min(1, Math.max(0.1, n)) : initial; } catch { return initial; }
  });
  const set = (n: number) => { setV(n); try { localStorage.setItem(storageKey, String(n)); } catch { /* not remembered */ } };
  return [v, set] as const;
}

/** Compact opacity slider for chart headers. */
export function OpacityControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground" title="Fill opacity">
      <span className="relative size-3.5 overflow-hidden rounded-sm border bg-[conic-gradient(#cbd5e1_25%,transparent_0_50%,#cbd5e1_0_75%,transparent_0)] bg-[length:6px_6px]">
        <span className="absolute inset-0 bg-primary" style={{ opacity: value }} />
      </span>
      Opacity
      <input type="range" min={10} max={100} step={5} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-1 w-24 cursor-pointer accent-[hsl(var(--primary))]" aria-label="Fill opacity" />
      <span className="w-8 text-right tabular-nums text-foreground">{Math.round(value * 100)}%</span>
    </label>
  );
}

/** "All · None" switch for legends. */
function AllNone({ allOn, noneOn, onAll, onNone }: { allOn: boolean; noneOn: boolean; onAll: () => void; onNone: () => void }) {
  const b = (on: boolean) => cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium transition", on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground");
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5" role="group" aria-label="Show series">
      <button type="button" className={b(allOn)} onClick={onAll}>All</button>
      <button type="button" className={b(noneOn)} onClick={onNone}>None</button>
    </span>
  );
}

interface LegendItem { value?: string; dataKey?: unknown; color?: string }
/** Recharts legend content: each series is a toggle chip (click to hide / show) plus All · None. */
export function ToggleLegend({ payload, hidden, onToggle, onSet }: { payload?: LegendItem[]; hidden: Set<string>; onToggle: (k: string) => void; onSet: (keys: string[]) => void }) {
  const items = (payload ?? []).filter((p) => p.dataKey !== undefined);
  const keys = items.map((p) => String(p.dataKey));
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 text-xs">
      {items.map((p) => {
        const k = String(p.dataKey), off = hidden.has(k);
        return (
          <button key={k} type="button" onClick={() => onToggle(k)} aria-pressed={!off} title={off ? "Show" : "Hide"}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 transition", off ? "border-dashed text-muted-foreground line-through opacity-60" : "bg-card shadow-sm hover:border-primary/40")}>
            <span className="size-2.5 rounded-full" style={{ background: off ? "transparent" : p.color, boxShadow: off ? `inset 0 0 0 1.5px ${p.color}` : undefined }} />
            {p.value}
          </button>
        );
      })}
      {items.length > 1 && <AllNone allOn={hidden.size === 0} noneOn={keys.every((k) => hidden.has(k))} onAll={() => onSet([])} onNone={() => onSet(keys)} />}
    </div>
  );
}

/**
 * Click-to-toggle legend for any Recharts chart: put `lt.legend` inside the chart and pass its series through
 * `lt.series([...])` (they get `hide` when switched off).
 */
export function useLegendToggle() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setHidden((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const set = (keys: string[]) => setHidden(new Set(keys));
  return {
    hidden,
    toggle,
    legend: <Legend content={<ToggleLegend hidden={hidden} onToggle={toggle} onSet={set} />} />,
    series: (els: ReactElement<{ dataKey?: unknown; hide?: boolean }>[]) =>
      els.map((el, i) => cloneElement(el, { key: el.key ?? String(el.props.dataKey ?? i), hide: hidden.has(String(el.props.dataKey)) })),
  };
}
