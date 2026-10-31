import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import {
  ArrowDownRight, ArrowUpRight, Check, ChevronDown, Layers, LayoutGrid, Minus, PiggyBank, Plus, Receipt, RotateCcw, Search,
  SlidersHorizontal, TrendingUp, ZoomIn, ZoomOut, ChevronsDownUp, ChevronsUpDown, type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { cn } from "@/utils/cn";
import { AnalyticsTabs, PeriodBar, usePeriod } from "./analytics-kit";

// ------------------------------------------------------------------ data (sugarcane.erp_insights.pnl_simulator.get_pnl_tree)
interface ApiNode { id: string; name: string; number?: string; series: number[]; kids?: ApiNode[] }
interface PnlTree {
  company: string; currency: string; from: string; to: string;
  months: { key: string; label: string }[];
  revenue: ApiNode; direct: ApiNode; indirect: ApiNode;
}

/** One card of the tree. `calc` nodes (net profit, gross margin) are worked out from their children: no slider. */
interface TNode {
  id: string; name: string; number?: string; series: number[]; kids?: TNode[];
  good: 1 | -1; calc?: "np" | "gm"; parent?: TNode;
}

/** Every posting account of a section, with the group path above it (for the card picker). */
interface LeafInfo { id: string; name: string; number?: string; path: string; section: "rev" | "dir" | "ind" }
function leavesOf(d: PnlTree): LeafInfo[] {
  const out: LeafInfo[] = [];
  const rec = (n: ApiNode, section: LeafInfo["section"], path: string[]) => {
    if (!n.kids?.length) out.push({ id: n.id, name: n.name, number: n.number, path: path.join(" › "), section });
    else n.kids.forEach((k) => rec(k, section, n.id === section ? path : [...path, n.name]));
  };
  rec(d.revenue, "rev", []);
  rec(d.direct, "dir", []);
  rec(d.indirect, "ind", []);
  return out;
}

/** The tree of cards. With `selected` accounts, each section shows just those accounts as cards plus one
 * "Other …" card for the rest of the section — totals, gross margin and net profit stay exact. */
function buildTree(d: PnlTree, selected: string[] | null): TNode {
  const conv = (n: ApiNode, good: 1 | -1, parent?: TNode): TNode => {
    const t: TNode = { id: n.id, name: n.name, number: n.number, series: n.series, good, parent };
    t.kids = n.kids?.map((k) => conv(k, good, t));
    return t;
  };
  const pick = (sec: ApiNode, good: 1 | -1, parent: TNode, otherLabel: string): TNode => {
    if (!selected) return conv(sec, good, parent);
    const leaves: ApiNode[] = [];
    const rec = (n: ApiNode) => (n.kids?.length ? n.kids.forEach(rec) : leaves.push(n));
    rec(sec);
    const chosen = leaves.filter((l) => selected.includes(l.id));
    const t: TNode = { id: sec.id, name: sec.name, series: sec.series, good, parent };
    const kids: TNode[] = chosen.map((l) => ({ id: l.id, name: l.name, number: l.number, series: l.series, good, parent: t }));
    const rest = sec.series.map((v, i) => v - chosen.reduce((s, l) => s + (l.series[i] ?? 0), 0));
    if (rest.some((v) => Math.abs(v) >= 1)) {
      kids.push({ id: `${sec.id}:other`, name: `${otherLabel} (${leaves.length - chosen.length} accounts)`, series: rest, good, parent: t });
    }
    t.kids = kids.length ? kids : undefined;
    return t;
  };
  const np: TNode = { id: "np", name: "Net profit", series: [], good: 1, calc: "np" };
  const gm: TNode = { id: "gm", name: "Gross margin", series: [], good: 1, calc: "gm", parent: np };
  gm.kids = [pick(d.revenue, 1, gm, "Other revenue"), pick(d.direct, -1, gm, "Other direct expenses")];
  np.kids = [gm, pick(d.indirect, -1, np, "Other indirect expenses")];
  return np;
}

const walk = (n: TNode, fn: (n: TNode) => void) => {
  fn(n);
  n.kids?.forEach((k) => walk(k, fn));
};

/** Actual and simulated monthly series for every node. A slider scales its node and everything under it. */
function compute(root: TNode, c: Record<string, number>, months: number) {
  const act: Record<string, number[]> = {};
  const sim: Record<string, number[]> = {};
  const factor = (n: TNode): number => {
    let f = 1;
    for (let p: TNode | undefined = n; p; p = p.parent) if (!p.calc) f *= 1 + (c[p.id] ?? 0) / 100;
    return f;
  };
  const rec = (n: TNode) => {
    if (n.calc) {
      n.kids!.forEach(rec);
      const [a, b] = n.kids!;
      act[n.id] = Array.from({ length: months }, (_, i) => act[a.id][i] - act[b.id][i]);
      sim[n.id] = Array.from({ length: months }, (_, i) => sim[a.id][i] - sim[b.id][i]);
      return;
    }
    if (n.kids?.length) {
      n.kids.forEach(rec);
      act[n.id] = Array.from({ length: months }, (_, i) => n.kids!.reduce((s, k) => s + act[k.id][i], 0));
      sim[n.id] = Array.from({ length: months }, (_, i) => n.kids!.reduce((s, k) => s + sim[k.id][i], 0));
      return;
    }
    const f = factor(n);
    act[n.id] = n.series.slice(0, months);
    sim[n.id] = n.series.slice(0, months).map((v) => v * f);
  };
  rec(root);
  return { act, sim };
}

// ------------------------------------------------------------------ money: Lakh / Crore for PKR & INR, K / M otherwise
function fmtParts(v: number, currency: string): [string, string] {
  const a = Math.abs(v);
  if (currency === "PKR" || currency === "INR") {
    if (a >= 1e7) return [(a / 1e7).toFixed(2), "Cr"];
    if (a >= 1e3) return [(a / 1e5).toFixed(2), "Lakh"];
    return [a.toFixed(0), ""];
  }
  if (a >= 1e6) return [(a / 1e6).toFixed(2), "M"];
  if (a >= 1e3) return [(a / 1e3).toFixed(1), "K"];
  return [a.toFixed(0), ""];
}
const amt = (v: number, cur: string) => {
  const [n, u] = fmtParts(v, cur);
  return `${v < 0 ? "−" : ""}${n}${u ? ` ${u}` : ""}`;
};
const signedAmt = (v: number, cur: string) => `${v < 0 ? "−" : "+"}${amt(Math.abs(v), cur)}`;

/** Which side a balance sits on. `good` = 1 for income-side lines (natural credit, incl. profit), -1 for expenses
 * (natural debit); a value below zero is on the other side — a contra balance (e.g. an income account in debit). */
function side(v: number, good: 1 | -1): { label: "Dr" | "Cr"; contra: boolean } {
  const natural = good === 1 ? "Cr" : "Dr";
  if (v >= 0) return { label: natural, contra: false };
  return { label: natural === "Cr" ? "Dr" : "Cr", contra: true };
}
const SIDE_TEXT = { Cr: "text-teal-600 dark:text-teal-400", Dr: "text-orange-600 dark:text-orange-400" } as const;
const SIDE_BADGE = { Cr: "bg-teal-500/10 text-teal-700 dark:text-teal-300", Dr: "bg-orange-500/10 text-orange-700 dark:text-orange-300" } as const;

function DrCr({ v, good, small }: { v: number; good: 1 | -1; small?: boolean }) {
  const s = side(v, good);
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("rounded font-bold", small ? "px-1 py-px text-[9px]" : "px-1.5 py-0.5 text-[10px]", SIDE_BADGE[s.label])}>{s.label}</span>
      {s.contra && (
        <span className={cn("rounded bg-amber-500/15 font-semibold text-amber-700 dark:text-amber-300", small ? "px-1 py-px text-[9px]" : "px-1.5 py-0.5 text-[10px]")}
          title={good === 1 ? "Income-side line with a debit balance (reduces revenue / a loss)" : "Expense-side line with a credit balance (reduces cost)"}>
          contra
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ layout
const CW = 244;
const GAP = 66;
const H_SIM = 186;
const H_CALC = 150;
const PITCH = 212;

interface Placed { n: TNode; x: number; cy: number; h: number; depth: number }

function layout(root: TNode, open: Record<string, boolean>) {
  const placed: Placed[] = [];
  let row = 0;
  let maxDepth = 0;
  const place = (n: TNode, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    const h = n.calc ? H_CALC : H_SIM;
    let cy: number;
    if (n.kids?.length && open[n.id]) {
      const ys = n.kids.map((k) => place(k, depth + 1));
      cy = (ys[0] + ys[ys.length - 1]) / 2;
    } else {
      cy = row * PITCH + PITCH / 2;
      row++;
    }
    placed.push({ n, x: depth * (CW + GAP), cy, h, depth });
    return cy;
  };
  place(root, 0);
  return { placed, W: (maxDepth + 1) * CW + maxDepth * GAP + 16, H: row * PITCH };
}

// ------------------------------------------------------------------ page
interface SimState {
  c: Record<string, number>; open: Record<string, boolean>; month: number | "all"; zoom: number;
  /** accounts that get their own card; null = the full chart-of-accounts tree */
  cards: string[] | null;
}
const stateKey = (company?: string) => `micromax.pnl-sim.${company ?? ""}.v1`;

/** Profit & loss what-if: the period's P&L as a value-driver tree of real accounts. Each slider scales a line (and
 * everything under it); net profit and gross margin follow. Dotted sparkline = actual, solid = simulated. */
export function PnlSimulatorPage() {
  const { company } = useCompanyContext();
  const period = usePeriod();
  const { data, error, isLoading } = useFrappeGetCall<{ message: PnlTree }>(
    "sugarcane.erp_insights.pnl_simulator.get_pnl_tree",
    { company: company ?? "", from_date: period.range.from, to_date: period.range.to },
    company && !period.invalid ? `pnl-sim-${company}-${period.range.from}-${period.range.to}` : null,
    { revalidateOnFocus: false, keepPreviousData: true },
  );
  const d = data?.message;
  return (
    <div className="space-y-4">
      <AnalyticsTabs />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-emerald-500/10 via-primary/10 to-violet-500/10 p-5">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <span className="relative inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary shadow-sm">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Accounts · what-if
        </span>
        <h1 className="relative mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Profit &amp; loss simulator</h1>
        <p className="relative mt-1 max-w-3xl text-sm text-muted-foreground">
          Your P&amp;L as a value-driver tree of real accounts. Open a card with its round <b>+</b>, move a line up or down with its slider, and watch gross
          margin and net profit follow.
        </p>
      </div>
      <PeriodBar period={period} company={company} page="pnl" />
      {!company ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Choose a company in the header.</Card>
      ) : error ? (
        <Card className="p-6 text-sm text-rose-600">Could not load the profit and loss for this period.</Card>
      ) : isLoading || !d ? (
        <Skeleton className="h-[560px] rounded-2xl" />
      ) : (
        <Simulator key={`${company}-${d.from}-${d.to}`} d={d} company={company} />
      )}
    </div>
  );
}

function Simulator({ d, company }: { d: PnlTree; company: string }) {
  const cur = d.currency || "PKR";
  const months = d.months.length;
  const leaves = useMemo(() => leavesOf(d), [d]);
  const fresh = (): SimState => ({ c: {}, open: { np: true, gm: true }, month: "all", zoom: typeof window !== "undefined" && window.innerWidth < 700 ? 0.7 : 1, cards: null });
  const [st, setSt] = useState<SimState>(() => {
    const base = fresh();
    try {
      const s = JSON.parse(localStorage.getItem(stateKey(company)) || "null");
      if (s && s.c && s.open) return { ...base, ...s, month: s.month === "all" || (s.month >= 0 && s.month < months) ? s.month : "all" };
    } catch {
      /* fresh */
    }
    return base;
  });
  useEffect(() => {
    try {
      localStorage.setItem(stateKey(company), JSON.stringify(st));
    } catch {
      /* private mode */
    }
  }, [st, company]);

  // a saved selection only keeps accounts that exist in this period
  const cards = useMemo(() => (st.cards ? st.cards.filter((id) => leaves.some((l) => l.id === id)) : null), [st.cards, leaves]);
  const root = useMemo(() => buildTree(d, cards), [d, cards]);
  const { act, sim } = useMemo(() => compute(root, st.c, months), [root, st.c, months]);
  const per = (a: number[]) => (st.month === "all" ? a.reduce((s, v) => s + v, 0) : a[st.month] ?? 0);
  const { placed, W, H } = useMemo(() => layout(root, st.open), [root, st.open]);
  const byId = useMemo(() => Object.fromEntries(placed.map((p) => [p.n.id, p])), [placed]);
  const setC = (id: string, v: number) => setSt((s) => ({ ...s, c: { ...s.c, [id]: Math.max(-50, Math.min(50, v)) } }));
  const toggle = (id: string) => setSt((s) => ({ ...s, open: { ...s.open, [id]: !s.open[id] } }));
  const zoom = (dz: number) => setSt((s) => ({ ...s, zoom: Math.min(1.3, Math.max(0.4, Math.round((s.zoom + dz) * 10) / 10)) }));
  const anySim = Object.values(st.c).some((v) => v);
  // every card that has children, for Expand all / Collapse all
  const groupIds = useMemo(() => {
    const ids: string[] = [];
    walk(root, (n) => n.kids?.length && ids.push(n.id));
    return ids;
  }, [root]);
  const allOpen = groupIds.every((id) => st.open[id]);
  const noneOpen = groupIds.every((id) => id === "np" || !st.open[id]);

  const revA = per(act.rev), revS = per(sim.rev);
  const summary: Metric[] = [
    { label: "Revenue", id: "rev", good: 1, icon: TrendingUp, color: "hsl(221 83% 53%)" },
    { label: "Gross margin", id: "gm", good: 1, pct: true, icon: Layers, color: "hsl(262 83% 58%)" },
    { label: "Indirect expenses", id: "ind", good: -1, pct: true, icon: Receipt, color: "hsl(35 92% 50%)" },
    { label: "Net profit", id: "np", good: 1, pct: true, icon: PiggyBank, color: "hsl(160 84% 39%)" },
  ];

  return (
    <div className="space-y-4">
      {/* summary strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((m) => (
          <SummaryCard key={m.id} metric={m} act={act[m.id]} sim={sim[m.id]} actRev={act.rev} simRev={sim.rev} per={per} month={st.month} cur={cur} />
        ))}
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Period shown"
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          value={String(st.month)}
          onChange={(e) => setSt((s) => ({ ...s, month: e.target.value === "all" ? "all" : Number(e.target.value) }))}
        >
          <option value="all">
            Whole period · {d.months[0]?.label} – {d.months[months - 1]?.label}
          </option>
          {d.months.map((m, i) => ({ m, i })).reverse().map(({ m, i }) => (
            <option key={m.key} value={i}>
              {m.label}
            </option>
          ))}
        </select>
        <CardPicker
          leaves={leaves}
          selected={cards}
          onChange={(sel) => setSt((s) => ({ ...s, cards: sel, open: sel ? { ...s.open, rev: true, dir: true, ind: true } : s.open }))}
        />
        <button type="button" onClick={() => {
            // back to actual: every slider at 0%, whole period, all accounts as cards, default tree and zoom
            try {
              localStorage.removeItem(stateKey(company));
            } catch {
              /* nothing saved */
            }
            setSt(fresh());
          }}
          title="Back to actual: sliders 0%, whole period, all account cards, default view"
          className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition",
            anySim ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15" : "border-border bg-background hover:bg-muted")}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset simulation
          {anySim && <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{Object.values(st.c).filter(Boolean).length}</span>}
        </button>
        <span className="inline-flex rounded-lg border border-border bg-background p-1">
          <button type="button" onClick={() => setSt((s) => ({ ...s, open: Object.fromEntries(groupIds.map((id) => [id, true])) }))}
            className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition",
              allOpen ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <ChevronsUpDown className="h-3.5 w-3.5" /> Expand all
          </button>
          <button type="button" onClick={() => setSt((s) => ({ ...s, open: { np: true } }))}
            className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition",
              noneOpen ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <ChevronsDownUp className="h-3.5 w-3.5" /> Collapse all
          </button>
        </span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-background p-1">
          <button type="button" aria-label="Zoom out" onClick={() => zoom(-0.1)} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">{Math.round(st.zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => zoom(0.1)} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted">
            <ZoomIn className="h-4 w-4" />
          </button>
        </span>
      </div>

      {/* board */}
      <Card className="max-h-[82vh] overflow-auto bg-gradient-to-b from-card to-muted/30 p-6 scrollbar-thin">
        <div style={{ width: W * st.zoom, height: H * st.zoom }} className="relative mx-auto">
          <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${st.zoom})` }}>
            <svg className="pointer-events-none absolute left-0 top-0" width={W} height={H}>
              {placed.filter((p) => p.n.kids?.length && st.open[p.n.id]).flatMap((p) =>
                p.n.kids!.map((k) => {
                  const q = byId[k.id];
                  if (!q) return null;
                  const a = p.x + CW + 12, b = q.x, m = (a + b) / 2;
                  return <path key={`${p.n.id}-${k.id}`} d={`M${a} ${p.cy} C${m} ${p.cy} ${m} ${q.cy} ${b} ${q.cy}`} fill="none" stroke="hsl(var(--border))" strokeWidth={1.6} />;
                }),
              )}
            </svg>
            {placed.map((p) => (
              <NodeCard key={p.n.id} p={p} a={act[p.n.id]} s={sim[p.n.id]} per={per} month={st.month} cur={cur} revS={revS} revA={revA}
                c={st.c[p.n.id] ?? 0} setC={setC} open={!!st.open[p.n.id]} toggle={toggle} />
            ))}
          </div>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">
        Round <b>+ / −</b> on a card's right edge shows more or less of the tree. The slider (or its − / + steps) changes that line by up to ±50% — a group's slider
        moves everything under it. In each small chart the dotted line is actual and the solid line simulated. Your simulation is kept in this browser.
      </p>
    </div>
  );
}

function NodeCard({ p, a, s, per, month, cur, revS, revA, c, setC, open, toggle }: {
  p: Placed; a: number[]; s: number[]; per: (x: number[]) => number; month: number | "all"; cur: string; revS: number; revA: number;
  c: number; setC: (id: string, v: number) => void; open: boolean; toggle: (id: string) => void;
}) {
  const n = p.n;
  const base = per(a), val = per(s), diff = val - base;
  const flat = Math.abs(diff) < 0.5;
  const better = diff * n.good > 0;
  const tone = flat ? "neutral" : better ? "good" : "bad";
  const [num, unit] = fmtParts(val, cur);
  const pctChange = Math.abs(base) > 1e-9 ? (diff / Math.abs(base)) * 100 : 0;
  return (
    <div className="absolute" style={{ left: p.x, top: p.cy - p.h / 2, width: CW, height: p.h }}>
      {!flat && (
        <span className={cn("absolute -top-[18px] left-1 whitespace-nowrap text-[11px] font-semibold", better ? "text-emerald-600" : "text-rose-600")}>
          {Math.abs(pctChange).toFixed(2)}% {better ? "better" : "worse"}
        </span>
      )}
      <div
        className={cn(
          "h-full rounded-xl border border-t-4 bg-card px-3 pb-2.5 pt-2 shadow-[0_8px_24px_-14px_rgba(15,23,42,0.45)] transition-colors",
          tone === "good" ? "border-t-emerald-500" : tone === "bad" ? "border-t-rose-500" : n.calc ? "border-t-primary" : "border-t-border",
        )}
      >
        <p className="truncate text-[13px] font-semibold" title={n.number ? `${n.number} · ${n.name}` : n.name}>
          {n.number && <span className="mr-1 text-[11px] font-medium text-muted-foreground">{n.number}</span>}
          {n.name}
        </p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className={cn("whitespace-nowrap text-[22px] font-bold leading-tight tabular-nums", SIDE_TEXT[side(val, n.good).label])}>
              {num}
              {unit && <span className="ml-1 text-xs font-semibold opacity-70">{unit}</span>}
            </p>
            <DrCr v={val} good={n.good} small />
          </div>
          <Spark act={a} sim={s} month={month} tone={tone} />
        </div>
        {n.calc && (
          <p className="text-[11px] text-muted-foreground">
            {revS ? `${((val / revS) * 100).toFixed(1)}%` : "–"} of revenue · actual {revA ? `${((base / revA) * 100).toFixed(1)}%` : "–"}
          </p>
        )}
        <div className="mt-2 grid grid-cols-[1.1fr_1.1fr_0.9fr] gap-1.5 border-t border-border pt-1.5">
          <Trio v={amt(base, cur)} l="Actual" />
          <Trio v={flat ? "0.00" : signedAmt(diff, cur)} l="Variance" />
          <Trio v={flat || !Math.abs(base) ? "0.0%" : `${pctChange > 0 ? "+" : "−"}${Math.abs(pctChange).toFixed(1)}%`} l="Variance %" />
        </div>
        {!n.calc && (
          <div className="mt-2 flex items-center gap-1.5">
            <button type="button" aria-label={`Decrease ${n.name} by 1%`} onClick={() => setC(n.id, c - 1)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary hover:bg-primary/20">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input type="range" min={-50} max={50} step={1} value={c} aria-label={`Increase or decrease ${n.name}`}
              onChange={(e) => setC(n.id, Number(e.target.value))} className="min-w-0 flex-1 cursor-pointer accent-primary" />
            <button type="button" aria-label={`Increase ${n.name} by 1%`} onClick={() => setC(n.id, c + 1)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary hover:bg-primary/20">
              <Plus className="h-3.5 w-3.5" />
            </button>
            <span className="w-10 text-right text-xs font-bold tabular-nums">{c > 0 ? "+" : c < 0 ? "−" : ""}{Math.abs(c)}%</span>
          </div>
        )}
      </div>
      {n.kids?.length ? (
        <button
          type="button"
          onClick={() => toggle(n.id)}
          aria-expanded={open}
          aria-label={`${open ? "Show less under" : "Show more under"} ${n.name}`}
          title={open ? "Show less" : "Show more"}
          className={cn(
            "absolute -right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-card shadow-sm transition hover:scale-110",
            open ? "border-primary text-primary" : "border-border text-muted-foreground",
          )}
        >
          {open ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </button>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ summary cards
interface Metric { label: string; id: string; good: 1 | -1; pct?: boolean; icon: LucideIcon; color: string }

/** Headline tile: simulated value with its unit, change vs actual, share of revenue (actual → simulated) and the trend. */
function SummaryCard({ metric, act, sim, actRev, simRev, per, month, cur }: {
  metric: Metric; act: number[]; sim: number[]; actRev: number[]; simRev: number[];
  per: (x: number[]) => number; month: number | "all"; cur: string;
}) {
  const a = per(act), v = per(sim), diff = v - a;
  const ra = per(actRev), rv = per(simRev);
  const flat = Math.abs(diff) < 0.5;
  const better = diff * metric.good > 0;
  const [num, unit] = fmtParts(v, cur);
  const pct = Math.abs(a) > 1e-9 ? (diff / Math.abs(a)) * 100 : 0;
  const shareS = rv ? (v / rv) * 100 : 0;
  const shareA = ra ? (a / ra) * 100 : 0;
  const Icon = metric.icon;
  const status = flat ? "As actual" : better ? "Better than actual" : "Worse than actual";
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
      style={{ backgroundImage: `radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, ${metric.color} 13%, transparent), transparent 60%)` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl shadow-sm"
            style={{ background: `color-mix(in srgb, ${metric.color} 16%, transparent)`, color: metric.color }}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-[13px] font-semibold leading-tight">{metric.label}</p>
            <p className="text-[11px] text-muted-foreground">{status}</p>
          </div>
        </div>
        {!flat && (
          <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums",
            better ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400")}>
            {diff > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(pct).toFixed(1)}%
          </span>
        )}
      </div>

      <div className="mt-3 flex items-end gap-1.5">
        <span className={cn("text-[32px] font-bold leading-none tracking-tight tabular-nums", SIDE_TEXT[side(v, metric.id === "ind" ? -1 : 1).label])}>
          {num}
        </span>
        {unit && <span className="mb-1 text-sm font-semibold text-muted-foreground">{unit}</span>}
        <span className="mb-1 ml-auto flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <DrCr v={v} good={metric.id === "ind" ? -1 : 1} />
          {cur}
        </span>
      </div>
      <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
        Actual <span className="font-semibold text-foreground">{amt(a, cur)}</span>
        {!flat && (
          <span className={cn("ml-1.5 font-semibold", better ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
            {signedAmt(diff, cur)}
          </span>
        )}
      </p>

      {metric.pct && metric.id !== "rev" ? (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
            <span>of revenue</span>
            <span>
              {shareA.toFixed(1)}% → <span className="font-semibold text-foreground">{shareS.toFixed(1)}%</span>
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 left-0 rounded-full opacity-35" style={{ width: `${Math.min(100, Math.max(0, shareA))}%`, background: metric.color }} />
            <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, shareS))}%`, background: metric.color }} />
          </div>
        </div>
      ) : (
        <div className="mt-3 flex justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>{month === "all" ? "whole period" : "selected month"}</span>
          <span>monthly avg {amt(sim.reduce((s_, x) => s_ + x, 0) / Math.max(1, sim.length), cur)}</span>
        </div>
      )}

      <AreaSpark act={act} sim={sim} month={month} color={metric.color} />
    </div>
  );
}

/** Wide trend for a summary card: simulated as a filled area, actual dotted. */
function AreaSpark({ act, sim, month, color }: { act: number[]; sim: number[]; month: number | "all"; color: string }) {
  const w = 280, h = 46, pad = 3;
  const all = [...act, ...sim];
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1e-9) {
    hi += 1;
    lo -= 1;
  }
  const n = Math.max(1, sim.length - 1);
  const X = (i: number) => pad + (i * (w - 2 * pad)) / n;
  const Y = (v: number) => pad + ((hi - v) / (hi - lo)) * (h - 2 * pad);
  const line = (a: number[]) => a.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
  const id = `ag-${color.replace(/[^0-9]/g, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="-mx-1 mt-3 h-11 w-[calc(100%+0.5rem)]" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line(sim)} L${X(sim.length - 1)} ${h} L${X(0)} ${h} Z`} fill={`url(#${id})`} />
      <path d={line(act)} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.2} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <path d={line(sim)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {month !== "all" && sim[month] != null && <circle cx={X(month)} cy={Y(sim[month])} r={3.5} fill={color} stroke="white" strokeWidth={1.5} />}
    </svg>
  );
}

// ------------------------------------------------------------------ card picker
const SECTION_LABEL: Record<LeafInfo["section"], string> = { rev: "Revenue", dir: "Direct expenses", ind: "Indirect expenses" };

/** Choose which accounts get their own card: all (chart-of-accounts tree) or a selection (+ one "Other" card per section). */
function CardPicker({ leaves, selected, onChange }: { leaves: LeafInfo[]; selected: string[] | null; onChange: (sel: string[] | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 368)), top: r.bottom + 6 });
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-card-menu]")) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const sel = new Set(selected ?? leaves.map((l) => l.id));
  const term = q.trim().toLowerCase();
  const shown = leaves.filter((l) => !term || `${l.number ?? ""} ${l.name} ${l.path}`.toLowerCase().includes(term));
  const set = (ids: Set<string>) => onChange(ids.size === leaves.length ? null : [...ids]);
  const toggle = (id: string) => {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    set(n);
  };
  const label = selected ? `${selected.length} of ${leaves.length} accounts` : "All accounts";
  return (
    <div ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:border-primary/50">
        <LayoutGrid className="h-4 w-4 text-primary" /> Cards: {label}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open && pos &&
        createPortal(
          <div data-card-menu style={{ left: pos.left, top: pos.top }} className="fixed z-50 w-[360px] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
            <div className="space-y-2 border-b border-border p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search account name or number…"
                  className="h-9 w-full rounded-lg bg-muted/60 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Unticked accounts are grouped as “Other …”</span>
                <span className="flex gap-1">
                  <button type="button" onClick={() => onChange(null)} className="rounded-md px-2 py-1 font-medium text-primary hover:bg-primary/10">All</button>
                  <button type="button" onClick={() => onChange([])} className="rounded-md px-2 py-1 font-medium text-muted-foreground hover:bg-muted">None</button>
                </span>
              </div>
            </div>
            <div className="max-h-[380px] overflow-y-auto p-1 scrollbar-thin">
              {(["rev", "dir", "ind"] as const).map((sec) => {
                const rows = shown.filter((l) => l.section === sec);
                if (!rows.length) return null;
                const all = rows.every((r) => sel.has(r.id));
                return (
                  <div key={sec} className="py-1">
                    <button type="button" onClick={() => {
                      const n = new Set(sel);
                      rows.forEach((r) => (all ? n.delete(r.id) : n.add(r.id)));
                      set(n);
                    }} className="flex w-full items-center justify-between px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
                      {SECTION_LABEL[sec]}
                      <span className="normal-case">{all ? "untick all" : "tick all"}</span>
                    </button>
                    {rows.map((l) => (
                      <button key={l.id} type="button" onClick={() => toggle(l.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
                        <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          sel.has(l.id) ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                          {sel.has(l.id) && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {l.number && <span className="mr-1 text-xs text-muted-foreground">{l.number}</span>}
                            {l.name}
                          </span>
                          {l.path && <span className="block truncate text-[10px] text-muted-foreground">{l.path}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Trio({ v, l }: { v: string; l: string }) {
  return (
    <div className="min-w-0">
      <b className="block truncate text-xs font-semibold tabular-nums">{v}</b>
      <small className="block text-[10px] text-muted-foreground">{l}</small>
    </div>
  );
}

function Spark({ act, sim, month, tone }: { act: number[]; sim: number[]; month: number | "all"; tone: "good" | "bad" | "neutral" }) {
  const w = 76, h = 32, pad = 3;
  const all = [...act, ...sim];
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1e-9) {
    hi += 1;
    lo -= 1;
  }
  const n = Math.max(1, act.length - 1);
  const X = (i: number) => pad + (i * (w - 2 * pad)) / n;
  const Y = (v: number) => pad + ((hi - v) / (hi - lo)) * (h - 2 * pad);
  const path = (a: number[]) => a.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
  const color = tone === "good" ? "rgb(16 185 129)" : tone === "bad" ? "rgb(244 63 94)" : "hsl(var(--primary))";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <path d={path(act)} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.2} strokeDasharray="2 2.5" />
      <path d={path(sim)} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      {month !== "all" && sim[month] != null && <circle cx={X(month)} cy={Y(sim[month])} r={3} fill={color} />}
    </svg>
  );
}
