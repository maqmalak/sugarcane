/**
 * MIS & messaging (Phase 8):
 * - MisWallPage (/mis): the mill right now on one screen — cane today (gate / depots, by hour), yard, trucks on the road,
 *   payments, the last DMR, stock, plant alerts, stoppages, season progress, circles. Reloads on the server's `sugar_mis`
 *   realtime event (debounced) and every 60 s; a wall / TV mode hides the chrome.
 * - MessagesPage (/mis/messages): message log, templates with a live preview, a test send, the keyword simulator, settings.
 * Data: sugarcane.api.v1.mis.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFrappeEventListener } from "frappe-react-sdk";
import {
  AlertTriangle, Banknote, CheckCircle2, Clock, Factory, Gauge, Leaf, Maximize2, MessageSquare, Minimize2, Package, Radio,
  RefreshCw, Send, Settings2, Smartphone, Target, Truck, Warehouse,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, ChartCard, ChartTip, DataTable, KpiCard, Segmented, useChartTheme } from "@/sc/components/analytics/kit";
import { Badge, type Tone } from "@/sc/components/ui/badge";
import { Button } from "@/sc/components/ui/button";
import { Input } from "@/sc/components/ui/input";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get, post } from "@/sc/lib/api";
import { money, num } from "@/sc/lib/format";
import { cn } from "@/sc/lib/utils";
import { useTheme } from "@/sc/providers/theme";

const API = "sugarcane.api.v1.mis";
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const dayLabel = (s?: string | null) => (s ? new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "—");
const clock = (s?: string | null) => (s ? new Date(s.replace(" ", "T")).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—");
const mins = (m?: number | null) => (m == null ? "—" : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
const md = (v: number) => `${num(Math.round(v))} md`;

function Header({ title, sub, children }: { title: string; sub: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-600"><Gauge className="size-4" />Management information</div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

// =============================================================== MIS wall
interface Snap {
  at: string; day: string; current_day: string; live: boolean; mill: string; capacity_tcd: number;
  cane: { loads: number; maund: number; net_kg: number; payable: number; value: number; growers: number; gate_loads: number;
    depots: { depot: string; loads: number; maund: number }[]; target_maund: number; pct_target: number; hours: { hour: string; maund: number }[] };
  yard: { waiting_gross: number; waiting_tare: number; oldest: string | null; oldest_minutes: number | null; stock_kg: number };
  road: { trucks: number; kg: number; since: string | null };
  payments: { unpaid_cprs: number; unpaid_amount: number; oldest_unpaid: string | null; paid_today: number; bilties: number; bilty_amount: number; loans: number };
  production: null | { name: string; crushing_day: string; status: string; cane_crushed_maund: number; sugar_bags: number; recovery_pct: number;
    std_recovery_pct: number; crush_rate_tph: number; capacity_use_pct: number; stoppage_minutes: number; running_hours: number; loss_known: number; loss_undetermined: number };
  stock: { sugar_bags: number; molasses_kg: number; cane_yard_kg: number };
  stoppages: { count: number; minutes: number; open: null | { name: string; start: string; minutes: number; category: string; section: string; reason: string };
    list: { name: string; start: string; end: string | null; minutes: number; category: string; section: string; reason: string }[] };
  plant: { points: number; alert_count: number; alerts: { name: string; section: string; unit: string; value: number; min_value: number; max_value: number; at: string }[] };
  season: { name: string; start_date: string; end_date: string; crushing_target_maund: number; maund: number; amount: number; loads: number; growers: number;
    days: number; pct_target: number; bags: number; recovery_pct: number; avg_day_maund: number; days_to_target: number };
  trend: { day: string; maund: number; loads: number; bags: number; recovery: number }[];
  circles: Circle[];
  messages: Record<string, number>;
}
interface Circle { circle: string; zone: string; expected_maund: number; quota_maund: number; indents: number; indents_used: number; indent_use_pct: number;
  loads: number; growers: number; supplied_maund: number; pct_quota: number; pct_survey: number }

/** The page reloads on the server's sugar_mis event, at most every 5 s, and every minute anyway. */
function useLiveReload(key: unknown[]) {
  const qc = useQueryClient();
  const timer = useRef<number | undefined>(undefined);
  const [pulse, setPulse] = useState(0);
  useFrappeEventListener("sugar_mis", () => {
    setPulse((p) => p + 1);
    if (timer.current) return;
    timer.current = window.setTimeout(() => { timer.current = undefined; void qc.invalidateQueries({ queryKey: key }); }, 5000);
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return pulse;
}

export function MisWallPage() {
  const [params, setParams] = useSearchParams();
  const day = params.get("day") || "";
  const wall = params.get("wall") === "1";
  const key = ["mis", day];
  const q = useQuery({ queryKey: key, queryFn: () => get<Snap>(`${API}.snapshot`, day ? { day } : {}), refetchInterval: 60_000 });
  const pulse = useLiveReload(["mis"]);
  const { dark } = useTheme();
  const ct = useChartTheme(dark);
  const s = q.data;
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  useEffect(() => {
    document.documentElement.classList.toggle("mis-wall", wall);
    return () => document.documentElement.classList.remove("mis-wall");
  }, [wall]);

  if (q.isLoading || !s) return <div className="space-y-4 p-1">{q.error ? <p className="text-rose-600">{err(q.error)}</p> : <><Skeleton className="h-16" /><Skeleton className="h-64" /></>}</div>;
  const p = s.production;
  const sent = Object.entries(s.messages).reduce((a, [, n]) => a + n, 0);
  return (
    <div className={cn("space-y-4", wall && "fixed inset-0 z-50 overflow-auto bg-background p-4 sm:p-6")}>
      <Header title={`${s.mill} — ${s.live ? "live" : dayLabel(s.day)}`} sub={<>
        Crushing day {dayLabel(s.day)} · updated {clock(s.at)}
        {!s.live && <> · <span className="text-amber-600">today ({dayLabel(s.current_day)}) has no cane yet — showing the last day</span></>}
      </>}>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", pulse ? "text-emerald-600" : "text-muted-foreground")}>
          <Radio className={cn("size-3.5", pulse && "animate-pulse")} />{pulse ? `${pulse} live update${pulse > 1 ? "s" : ""}` : "listening"}
        </span>
        <Input type="date" value={day} onChange={(e) => set("day", e.target.value)} className="h-9 w-40" />
        <Button variant="outline" size="sm" onClick={() => q.refetch()}><RefreshCw className={cn("size-4", q.isFetching && "animate-spin")} /></Button>
        <Button variant="outline" size="sm" onClick={() => set("wall", wall ? "" : "1")}>{wall ? <><Minimize2 className="size-4" />Exit wall</> : <><Maximize2 className="size-4" />Wall mode</>}</Button>
      </Header>

      {s.stoppages.open && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle className="size-5 shrink-0" />
          <span><b>Mill stopped</b> since {clock(s.stoppages.open.start)} ({mins(s.stoppages.open.minutes)}) — {s.stoppages.open.category}, {s.stoppages.open.section}: {s.stoppages.open.reason}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard icon={Leaf} label="Cane bought today" value={md(s.cane.maund)} color={C.emerald} to={`/procurement?day=${s.day}`}
          sub={`${s.cane.loads} loads · ${s.cane.growers} growers`} progress={s.cane.target_maund ? s.cane.pct_target : undefined}
          footer={<>Gate <b>{s.cane.gate_loads}</b> · depots <b>{s.cane.depots.reduce((a, d) => a + d.loads, 0)}</b></>} />
        <KpiCard icon={Clock} label="In the yard" value={`${s.yard.waiting_gross + s.yard.waiting_tare} trucks`} color={C.amber} to="/procurement/yard"
          sub={`${s.yard.waiting_gross} before gross · ${s.yard.waiting_tare} before tare`}
          footer={<>Oldest <b>{s.yard.oldest_minutes != null ? mins(s.yard.oldest_minutes) : clock(s.yard.oldest)}</b> · cane stock <b>{num(Math.round(s.yard.stock_kg / 40))} md</b></>} />
        <KpiCard icon={Truck} label="On the road from depots" value={`${s.road.trucks} trucks`} color={C.violet} to="/depot"
          sub={`${num(Math.round(s.road.kg / 40))} maund`} footer={<>First left <b>{clock(s.road.since)}</b></>} />
        <KpiCard icon={Banknote} label="Unpaid to growers" value={money(s.payments.unpaid_amount, { compact: true })} color={C.rose} to="/accounts"
          sub={`${s.payments.unpaid_cprs} CPRs · oldest ${dayLabel(s.payments.oldest_unpaid)}`}
          footer={<>Paid today <b>{money(s.payments.paid_today, { compact: true })}</b> · bilties <b>{money(s.payments.bilty_amount, { compact: true })}</b></>} />
        <KpiCard icon={Factory} label={`Sugar — DMR ${p ? dayLabel(p.crushing_day) : ""}`} value={p ? `${num(p.sugar_bags)} bags` : "—"} color={C.teal} to="/lab/dmr"
          sub={p ? `Recovery ${p.recovery_pct.toFixed(2)}% (std ${p.std_recovery_pct.toFixed(2)}%)` : "No DMR yet"}
          footer={p && <>{p.status} · {num(Math.round(p.cane_crushed_maund))} md crushed · {p.capacity_use_pct.toFixed(0)}% capacity</>} />
        <KpiCard icon={Package} label="In stock" value={`${num(s.stock.sugar_bags)} bags`} color={C.blue} to="/production"
          sub={`Molasses ${num(Math.round(s.stock.molasses_kg / 1000))} t`} footer={<>Loans out <b>{money(s.payments.loans, { compact: true })}</b></>} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Cane by hour" sub={`Payable maund per hour of the crushing day (${s.cane.hours[0]?.hour}:00 start)`} className="xl:col-span-2" bodyClass="h-64">
          <ResponsiveContainer>
            <BarChart data={s.cane.hours} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: ct.axis }} />
              <YAxis tick={{ fontSize: 11, fill: ct.axis }} width={48} />
              <Tooltip content={<ChartTip fmt={(v) => md(v)} />} cursor={{ fill: ct.grid }} />
              <Bar dataKey="maund" name="Maund" fill={C.emerald} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold"><Target className="size-4 text-teal-600" />Season {s.season.name}</div>
          <p className="mt-2 text-3xl font-bold tabular-nums">{md(s.season.maund)}</p>
          <p className="text-xs text-muted-foreground">of {md(s.season.crushing_target_maund)} target · {s.season.pct_target.toFixed(1)}%</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, s.season.pct_target)}%` }} /></div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {([["Crushing days", s.season.days], ["Avg / day", md(s.season.avg_day_maund)], ["Growers", s.season.growers], ["Loads", s.season.loads],
              ["Sugar bags", num(s.season.bags)], ["Recovery", `${s.season.recovery_pct.toFixed(2)}%`], ["Payable (season)", money(s.season.amount, { compact: true })],
              ["Days to target", s.season.days_to_target ? num(s.season.days_to_target) : "—"]] as [string, ReactNode][]).map(([k, v]) => (
              <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>
            ))}
          </dl>
          <Link to="/reports?r=Season%20Progress" className="mt-3 inline-block text-xs font-semibold text-teal-600 hover:underline">Season progress report →</Link>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Last 14 days" sub="Cane bought (maund) and sugar bags from the DMR" className="xl:col-span-2" bodyClass="h-64">
          <ResponsiveContainer>
            <ComposedChart data={s.trend.map((t) => ({ ...t, label: dayLabel(t.day) }))} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: ct.axis }} />
              <YAxis yAxisId="m" tick={{ fontSize: 11, fill: ct.axis }} width={48} />
              <YAxis yAxisId="b" orientation="right" tick={{ fontSize: 11, fill: ct.axis }} width={40} />
              <Tooltip content={<ChartTip fmt={(v, k) => (k === "bags" ? `${num(v)} bags` : md(v))} />} />
              <Bar yAxisId="m" dataKey="maund" name="Maund" fill={C.teal} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line yAxisId="b" dataKey="bags" name="Bags" stroke={C.amber} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span className="flex items-center gap-2"><Gauge className="size-4 text-rose-600" />Plant and stoppages</span>
            <Link to="/production/plant" className="text-xs text-teal-600 hover:underline">Plant levels →</Link>
          </div>
          {s.plant.alert_count ? s.plant.alerts.map((a) => (
            <div key={a.name} className="flex items-center justify-between rounded-lg bg-rose-500/10 px-3 py-1.5 text-sm">
              <span><b>{a.name}</b> <span className="text-xs text-muted-foreground">{a.section}</span></span>
              <span className="tabular-nums text-rose-600">{a.value} {a.unit} <span className="text-xs text-muted-foreground">({a.min_value}–{a.max_value})</span></span>
            </div>
          )) : <p className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="size-4" />All {s.plant.points} plant points in range</p>}
          <div className="border-t pt-3 text-sm">
            <p className="font-medium">{s.stoppages.count} stoppage{s.stoppages.count === 1 ? "" : "s"} · {mins(s.stoppages.minutes)}</p>
            {s.stoppages.list.map((x) => (
              <p key={x.name} className="mt-1 truncate text-xs text-muted-foreground">{clock(x.start)}–{x.end ? clock(x.end) : "now"} · <b>{x.category}</b> {x.section}: {x.reason}</p>
            ))}
          </div>
          <div className="border-t pt-3 text-xs text-muted-foreground">
            <Link to="/mis/messages" className="flex items-center gap-2 hover:underline"><MessageSquare className="size-3.5" />{sent} message{sent === 1 ? "" : "s"} to growers today
              {Object.entries(s.messages).map(([k, n]) => <Badge key={k} tone={MSG_TONE[k] ?? "gray"}>{k} {n}</Badge>)}</Link>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Circles" sub="Cane supplied this season against the quota and the survey" className="xl:col-span-2" bodyClass="">
          <div className="px-3 pb-3">
            <DataTable<Circle> rows={s.circles} rowKey={(r) => r.circle} dense initialSort={{ key: "supplied_maund", dir: "desc" }}
              onRow={(r) => `/reports?r=${encodeURIComponent("Grower Supply Ranking")}&circle=${encodeURIComponent(r.circle)}`}
              cols={[
                { key: "circle", label: "Circle" },
                { key: "supplied_maund", label: "Supplied", align: "right", render: (r) => md(r.supplied_maund), bar: { color: C.teal } },
                { key: "pct_quota", label: "% quota", align: "right", render: (r) => `${r.pct_quota.toFixed(1)}%` },
                { key: "pct_survey", label: "% survey", align: "right", render: (r) => `${r.pct_survey.toFixed(1)}%`, hideSm: true },
                { key: "indent_use_pct", label: "Indents used", align: "right", render: (r) => `${r.indents_used}/${r.indents}`, hideSm: true },
                { key: "growers", label: "Growers", align: "right", hideSm: true },
              ]} />
          </div>
        </ChartCard>
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold"><Warehouse className="size-4 text-violet-600" />Depots today</div>
          {s.cane.depots.length ? s.cane.depots.map((d) => (
            <div key={d.depot} className="mt-3">
              <div className="flex justify-between text-sm"><span>{d.depot}</span><b className="tabular-nums">{md(d.maund)}</b></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, (100 * d.maund) / Math.max(1, s.cane.maund))}%` }} /></div>
              <p className="text-xs text-muted-foreground">{d.loads} loads</p>
            </div>
          )) : <p className="mt-3 text-sm text-muted-foreground">No depot purchase today.</p>}
          <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            <Link to="/reports?r=Circle%20Wise%20Performance" className="block hover:underline">Circle wise performance →</Link>
            <Link to="/reports?r=Grower%20Supply%20Ranking" className="mt-1 block hover:underline">Grower supply ranking →</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

// =============================================================== messages
interface LogRow { name: string; direction: "In" | "Out"; status: string; event: string; mobile: string; grower: string | null; party_name: string | null;
  reference_doctype: string | null; reference_name: string | null; channel: string; language: string; queued_at: string; sent_at: string | null;
  message: string; segments: number; response: string | null; in_reply_to: string | null }
interface Template { name: string; event: string; language: string; channel: string; audience: string; is_active: number; body: string; chars: number; segments: number }
interface Keyword { name: string; keyword: string; action: string; is_active: number; description: string }
interface Settings { enabled: number; gateway: string; sender: string; language: string; test_number: string; quiet_from: number; quiet_to: number; cap: number;
  quiet_now: boolean; has_token: boolean; whatsapp_installed: boolean }
interface Msgs { rows: LogRow[]; stats: { event: string; status: string; n: number; parts: number }[]; templates: Template[]; keywords: Keyword[]; settings: Settings;
  events: string[]; defaults: Record<string, string>; sample: Record<string, string> }
const MSG_TONE: Record<string, Tone> = { Sent: "green", Mocked: "blue", Queued: "amber", Failed: "red", Skipped: "gray" };
const LANGS = ["English", "Roman Urdu", "Urdu"];

type Tab = "log" | "templates" | "keywords" | "settings";

export function MessagesPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "log";
  const [status, setStatus] = useState(""), [event, setEvent] = useState(""), [search, setSearch] = useState("");
  const key = ["messages", status, event, search];
  const q = useQuery({ queryKey: key, queryFn: () => get<Msgs>(`${API}.messages`, { status, event, q: search }) });
  const qc = useQueryClient();
  const reload = () => qc.invalidateQueries({ queryKey: ["messages"] });
  const d = q.data;
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of d?.stats ?? []) t[r.status] = (t[r.status] ?? 0) + r.n;
    return t;
  }, [d]);
  if (!d) return <div className="space-y-4">{q.error ? <p className="text-rose-600">{err(q.error)}</p> : <Skeleton className="h-64" />}</div>;
  return (
    <div className="space-y-4">
      <Header title="Grower messages" sub={<>SMS / WhatsApp to growers and drivers on indents, CPRs, bilties, payments and loans, and the keyword replies.
        Gateway <b>{d.settings.gateway}</b>{d.settings.gateway === "Mock" && " (nothing leaves the server)"}{!d.settings.enabled && <b className="text-rose-600"> — messaging is off</b>}
        {d.settings.test_number && <b className="text-amber-600"> — test mode: everything goes to {d.settings.test_number}</b>}</>}>
        <Segmented<Tab> value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })}
          options={[["log", "Log"], ["templates", "Templates"], ["keywords", "Keywords"], ["settings", "Settings"]]} />
      </Header>
      <div className="grid gap-3 sm:grid-cols-5">
        {(["Sent", "Mocked", "Queued", "Failed", "Skipped"] as const).map((k) => (
          <button key={k} onClick={() => { setStatus(status === k ? "" : k); setParams({ tab: "log" }, { replace: true }); }}
            className={cn("rounded-2xl border bg-card p-3 text-left shadow-sm transition hover:shadow", status === k && "ring-2 ring-teal-500")}>
            <p className="text-xs text-muted-foreground">{k}</p><p className="text-2xl font-bold tabular-nums">{num(totals[k] ?? 0)}</p>
          </button>
        ))}
      </div>
      {tab === "log" && <LogTab d={d} status={status} event={event} setEvent={setEvent} search={search} setSearch={setSearch} reload={reload} />}
      {tab === "templates" && <TemplatesTab d={d} reload={reload} />}
      {tab === "keywords" && <KeywordsTab d={d} reload={reload} />}
      {tab === "settings" && <SettingsTab s={d.settings} reload={reload} />}
    </div>
  );
}

function LogTab({ d, status, event, setEvent, search, setSearch, reload }: { d: Msgs; status: string; event: string; setEvent: (v: string) => void;
  search: string; setSearch: (v: string) => void; reload: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(""), [text, setText] = useState("");
  const send = async () => {
    try { const r = await post<LogRow>(`${API}.test_send`, { mobile, text }); toast.success(`${r.status}: ${r.mobile}`); reload(); } catch (e) { toast.error(err(e)); }
  };
  const flush = async () => {
    try { const r = await post<{ sent: number }>(`${API}.flush`); toast.success(`${r.sent} queued message(s) handed to the gateway`); reload(); } catch (e) { toast.error(err(e)); }
  };
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <section className="rounded-2xl border bg-card shadow-sm xl:col-span-2">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Input placeholder="Mobile, grower, name, CPR…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-56" />
          <select value={event} onChange={(e) => setEvent(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm">
            <option value="">All events</option>{[...d.events, "Keyword"].map((e) => <option key={e}>{e}</option>)}
          </select>
          {status && <Badge tone={MSG_TONE[status]}>{status}</Badge>}
          <span className="flex-1" />
          <Button variant="outline" size="sm" onClick={flush}><Send className="size-4" />Send queued</Button>
        </div>
        <div className="max-h-[640px] divide-y overflow-auto">
          {d.rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No messages.</p>}
          {d.rows.map((r) => (
            <button key={r.name} onClick={() => setOpen(open === r.name ? null : r.name)} className="block w-full px-4 py-2.5 text-left hover:bg-accent/50">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge tone={r.direction === "In" ? "violet" : MSG_TONE[r.status]}>{r.direction === "In" ? "Incoming" : r.status}</Badge>
                <b>{r.event}</b><span className="tabular-nums text-muted-foreground">{r.mobile}</span>
                {r.party_name && <span>{r.party_name}</span>}
                <span className="ml-auto text-muted-foreground">{new Date(r.queued_at.replace(" ", "T")).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className={cn("mt-1 text-sm", open !== r.name && "line-clamp-1")} dir="auto">{r.message}</p>
              {open === r.name && (
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{r.channel} · {r.language || "—"} · {r.segments} part{r.segments === 1 ? "" : "s"}</span>
                  {r.reference_name && <span>{r.reference_doctype} <b>{r.reference_name}</b></span>}
                  {r.grower && <Link to={`/accounts/grower?g=${encodeURIComponent(r.grower)}`} className="text-teal-600 hover:underline" onClick={(e) => e.stopPropagation()}>Grower {r.grower}</Link>}
                  {r.response && <span>Gateway: {r.response}</span>}
                </div>
              )}
            </button>
          ))}
        </div>
      </section>
      <div className="space-y-4">
        <Simulator keywords={d.keywords} reload={reload} />
        <section className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold"><Send className="size-4 text-teal-600" />Test message</div>
          <Input placeholder="0300-1234567" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Message" dir="auto"
            className="w-full rounded-lg border bg-background p-2 text-sm" />
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{text.length} characters</span>
            <Button size="sm" onClick={send} disabled={!mobile || !text}>Send</Button></div>
        </section>
      </div>
    </div>
  );
}

function Simulator({ keywords, reload }: { keywords: Keyword[]; reload: () => void }) {
  const [mobile, setMobile] = useState(""), [msg, setMsg] = useState("BAL");
  const [chat, setChat] = useState<{ me: boolean; text: string }[]>([]);
  const go = async (text = msg) => {
    if (!mobile || !text) return;
    setChat((c) => [...c, { me: true, text }]);
    try {
      const r = await post<{ reply: string; grower: string | null }>(`${API}.simulate_inbound`, { mobile, message: text });
      setChat((c) => [...c, { me: false, text: r.reply }]);
      reload();
    } catch (e) { toast.error(err(e)); }
  };
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="size-4 text-violet-600" />Keyword simulator</div>
      <p className="text-xs text-muted-foreground">Text the mill as a grower would — the mobile must be on the grower's record.</p>
      <Input placeholder="Grower's mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
      <div className="max-h-64 min-h-24 space-y-2 overflow-auto rounded-xl bg-muted/50 p-2">
        {chat.length === 0 && <p className="p-2 text-center text-xs text-muted-foreground">No messages yet</p>}
        {chat.map((m, i) => (
          <div key={i} className={cn("max-w-[85%] rounded-2xl px-3 py-1.5 text-sm", m.me ? "ml-auto bg-teal-600 text-white" : "bg-card shadow-sm")} dir="auto">{m.text}</div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {keywords.filter((k) => k.is_active).map((k) => (
          <button key={k.name} onClick={() => go(k.keyword)} title={k.description} className="rounded-full border px-2 py-0.5 text-xs font-semibold hover:bg-accent">{k.keyword}</button>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <Input value={msg} onChange={(e) => setMsg(e.target.value)} />
        <Button size="sm" type="submit" disabled={!mobile}>Send</Button>
      </form>
    </section>
  );
}

function TemplatesTab({ d, reload }: { d: Msgs; reload: () => void }) {
  const [event, setEvent] = useState(d.events[0]), [language, setLanguage] = useState("English");
  const existing = d.templates.find((t) => t.event === event && t.language === language);
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<{ text: string; chars: number; segments: number } | null>(null);
  useEffect(() => { setBody(existing?.body ?? d.defaults[event] ?? ""); }, [event, language, existing?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = window.setTimeout(() => { post<{ text: string; chars: number; segments: number }>(`${API}.preview`, { body, event }).then(setPreview).catch(() => setPreview(null)); }, 300);
    return () => window.clearTimeout(t);
  }, [body, event]);
  const save = async () => {
    try { await post(`${API}.save_template`, { name: existing?.name, event, language, body }); toast.success("Template saved"); reload(); } catch (e) { toast.error(err(e)); }
  };
  const fields = Array.from(new Set((d.defaults[event] ?? "").match(/{{\s*\w+\s*}}/g) ?? [])).map((f) => f.replace(/[{}\s]/g, ""));
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <section className="rounded-2xl border bg-card shadow-sm">
        <div className="border-b p-3 text-sm font-semibold">Events</div>
        <div className="divide-y">
          {d.events.map((e) => {
            const own = d.templates.filter((t) => t.event === e);
            return (
              <button key={e} onClick={() => setEvent(e)} className={cn("flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-accent/50", e === event && "bg-accent")}>
                <span>{e}</span>
                <span className="flex gap-1">{own.length ? own.map((t) => <Badge key={t.name} tone={t.is_active ? "green" : "gray"}>{t.language}</Badge>) : <Badge>built-in</Badge>}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm xl:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-lg font-semibold">{event}</h3>
          <Segmented<string> value={language} onChange={setLanguage} options={LANGS.map((l) => [l, l])} />
        </div>
        <p className="text-xs text-muted-foreground">{existing ? <>Template <b>{existing.name}</b></> : "Built-in text — saving makes it a template you can change."}
          {" "}Fields: {fields.map((f) => <code key={f} className="mx-0.5 rounded bg-muted px-1">{`{{ ${f} }}`}</code>)}</p>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} dir="auto" className="w-full rounded-lg border bg-background p-3 font-mono text-sm" />
        <div className="rounded-xl border bg-muted/40 p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span>Preview with sample data</span>
            {preview && <span className={cn(preview.segments > 1 && "font-semibold text-amber-600")}>{preview.chars} characters · {preview.segments} SMS</span>}</div>
          <div className="max-w-md rounded-2xl bg-card px-3 py-2 text-sm shadow-sm" dir="auto">{preview?.text || "—"}</div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setBody(d.defaults[event] ?? "")}>Built-in text</Button>
          <Button onClick={save}>Save template</Button>
        </div>
      </section>
    </div>
  );
}

function KeywordsTab({ d }: { d: Msgs; reload: () => void }) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="mb-3 text-sm text-muted-foreground">A grower texts a keyword to the mill's number; the reply goes at once (quiet hours and the daily limit don't apply).
        Keywords are records — <Link to="/mis/d/sms-keyword" className="text-teal-600 hover:underline">edit them</Link>.</p>
      <DataTable<Keyword> rows={d.keywords} rowKey={(r) => r.name} cols={[
        { key: "keyword", label: "Keyword", render: (r) => <b className="font-mono">{r.keyword}</b> },
        { key: "action", label: "Reply with" },
        { key: "description", label: "What it does" },
        { key: "is_active", label: "Active", render: (r) => (r.is_active ? <Badge tone="green">Active</Badge> : <Badge>Off</Badge>) },
      ]} />
    </section>
  );
}

function SettingsTab({ s, reload }: { s: Settings; reload: () => void }) {
  const [v, setV] = useState({ ...s, inbound_token: "" });
  const save = async () => {
    try { await post(`${API}.save_settings`, { ...v, enabled: v.enabled ? 1 : 0 }); toast.success("Saved"); reload(); } catch (e) { toast.error(err(e)); }
  };
  const field = (label: string, node: ReactNode, hint?: string) => (
    <label className="block space-y-1 text-sm"><span className="font-medium">{label}</span>{node}{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</label>
  );
  return (
    <section className="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm md:grid-cols-2">
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked ? 1 : 0 })} />Send messages to growers and drivers</label>
        {field("Gateway", <select value={v.gateway} onChange={(e) => setV({ ...v, gateway: e.target.value })} className="h-9 w-full rounded-lg border bg-background px-2">
          {["Mock", "Frappe SMS Settings", "WhatsApp"].map((g) => <option key={g}>{g}</option>)}</select>,
          v.gateway === "WhatsApp" && !s.whatsapp_installed ? "The WhatsApp app is not installed on this site." : "Mock: logged only. Frappe SMS Settings: the gateway URL set in the desk's SMS Settings.")}
        {field("Sender ID", <Input value={v.sender} onChange={(e) => setV({ ...v, sender: e.target.value })} />)}
        {field("Default language", <select value={v.language} onChange={(e) => setV({ ...v, language: e.target.value })} className="h-9 w-full rounded-lg border bg-background px-2">
          {LANGS.map((l) => <option key={l}>{l}</option>)}</select>)}
      </div>
      <div className="space-y-3">
        {field("Test mode: send everything to", <Input value={v.test_number} onChange={(e) => setV({ ...v, test_number: e.target.value })} placeholder="empty = off" />)}
        <div className="grid grid-cols-2 gap-3">
          {field("Quiet from (hour)", <Input type="number" value={v.quiet_from} onChange={(e) => setV({ ...v, quiet_from: Number(e.target.value) })} />)}
          {field("Quiet to (hour)", <Input type="number" value={v.quiet_to} onChange={(e) => setV({ ...v, quiet_to: Number(e.target.value) })} />)}
        </div>
        <p className="text-xs text-muted-foreground">{s.quiet_now ? "It is quiet hours now — queued messages wait." : "Not quiet hours now."}</p>
        {field("Most messages a number gets a day", <Input type="number" value={v.cap} onChange={(e) => setV({ ...v, cap: Number(e.target.value) })} />)}
        {field("Inbound token", <Input type="password" value={v.inbound_token} onChange={(e) => setV({ ...v, inbound_token: e.target.value })} placeholder={s.has_token ? "set — type to change" : "not set"} />,
          "The gateway posts incoming SMS to /api/method/sugarcane.api.v1.sms.inbound?token=…&from=…&text=…")}
      </div>
      <div className="flex items-center justify-end gap-2 md:col-span-2">
        <Settings2 className="size-4 text-muted-foreground" /><Button onClick={save}>Save settings</Button>
      </div>
    </section>
  );
}
