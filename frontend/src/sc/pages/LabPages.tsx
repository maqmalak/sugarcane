/**
 * Laboratory & production (Phase 5):
 * - LabDashboardPage (/lab): recovery, crushing, losses, hourly mixed-juice purity, averages, variety recovery, stoppages.
 * - LabEntryPage (/lab/entry?day=): enter an hour's samples for every stream; the day's grid (type × hour), out-of-range in red.
 * - VehicleSamplesPage (/lab/vehicle?day=): core samples of the day's loads → CCS and estimated recovery.
 * - StoppagesPage (/lab/stoppages?day=): stop / restart the mill, the day's stoppages by category.
 * - DmrPage (/lab/dmr?day=): the Daily Manufacturing Report — computed from the day, the lab's entries, prepare → approve → post production.
 * - ProductionPage (/production): days, DMR status, production posted, cost per bag, stock of sugar and by-products.
 * - PlantPage (/production/plant): latest plant levels against their ranges, an hourly entry, the history of a point.
 * Data: sugarcane.api.v1.lab.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Beaker, CheckCircle2, ClipboardCheck, Factory, FlaskConical, Gauge as GaugeIcon, Hourglass, Package, Pause, Play, Save, Sprout,
  Timer, TrendingUp, Truck, Weight,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Link, useSearchParams } from "react-router-dom";
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, ChartCard, ChartTip, DataTable, KpiCard, useChartTheme } from "@/sc/components/analytics/kit";
import { Badge } from "@/sc/components/ui/badge";
import { Button } from "@/sc/components/ui/button";
import { Input } from "@/sc/components/ui/input";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get, post } from "@/sc/lib/api";
import { money, num } from "@/sc/lib/format";
import { cn } from "@/sc/lib/utils";
import { useTheme } from "@/sc/providers/theme";

const API = "sugarcane.api.v1.lab";
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (s?: string | null) => (s ? new Date(s.replace(" ", "T")).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const dayLabel = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const f2 = (v?: number | null, d = 2) => (v === null || v === undefined || (v === 0 && d > 0) ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const PARAM_LABEL: Record<string, string> = { brix: "Brix", pol: "Pol", purity: "Purity", ph: "pH", moisture_pct: "Moisture %", fibre_pct: "Fibre %", colour_icumsa: "Colour", temperature_c: "Temp °C" };

interface Limit { parameter: string; min_value: number; max_value: number; target: number }
interface SampleType { name: string; code: string; stage: string; every_hours: number; limits: Limit[] }
interface Masters { types: SampleType[]; day: string; can_record: boolean; can_approve: boolean }
type Cell = Record<string, number | string | null | undefined> & { name: string; out_of_range?: number; problems?: string };

function Header({ title, sub, children, kicker = "Laboratory" }: { title: string; sub: string; children?: ReactNode; kicker?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-600"><FlaskConical className="size-4" />{kicker}</div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
const NavBtn = ({ to, icon: Icon, children }: { to: string; icon: typeof Beaker; children: ReactNode }) => (
  <Link to={to} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:bg-accent"><Icon className="size-4" />{children}</Link>
);
function DayPick({ day, onChange }: { day: string; onChange: (d: string) => void }) {
  return <input type="date" value={day} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm" />;
}
function useDay(fallback?: string) {
  const [params, setParams] = useSearchParams();
  const day = params.get("day") || fallback || "";
  return [day, (d: string) => { const n = new URLSearchParams(params); n.set("day", d); setParams(n); }] as const;
}
const KV = ({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) => (
  <div className="flex justify-between gap-3 border-b border-dashed py-1.5 text-sm last:border-0"><span className="text-muted-foreground">{k}</span><span className={cn("text-right tabular-nums", strong ? "font-bold" : "font-medium")}>{v ?? "—"}</span></div>
);

// =============================================================== dashboard
interface Insights {
  day: string; from: string; samples_today: number;
  dmr?: { status: string; cane_crushed_kg: number; sugar_bags: number; recovery_pct: number; running_hours: number; stoppage_minutes: number; crush_rate_tph: number; loss_undetermined?: number } | null;
  trend: { crushing_day: string; status: string; cane_crushed_kg: number; sugar_bags: number; recovery_pct: number; stoppage_minutes: number; loss_bagasse: number; loss_molasses: number; loss_press_mud: number; loss_undetermined?: number }[];
  hourly: { hour: string; brix?: number; pol?: number; purity?: number }[];
  averages: Record<string, { sample_type: string; samples: number; brix?: number; pol?: number; purity?: number; moisture_pct?: number; out_of_range: number }>;
  out_of_range: { name: string; sample_type: string; hour: string; problems: string }[];
  by_variety: { variety: string; samples: number; ccs: number; recovery: number; purity: number; fibre: number }[];
  by_circle: { circle: string; samples: number; recovery: number; ccs: number }[];
  stoppages: { category: string; n: number; minutes: number }[];
}

export function LabDashboardPage() {
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const [day, setDay] = useDay();
  const { data } = useQuery({ queryKey: ["sc-lab-insights", day], queryFn: () => get<Insights>(`${API}.insights`, day ? { day } : {}), refetchInterval: 120_000 });
  if (!data) return <div className="grid gap-4 p-6 md:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>;
  const d = data.dmr;
  const trend = data.trend.map((r) => ({ ...r, label: dayLabel(r.crushing_day), crushed_t: Math.round(r.cane_crushed_kg / 1000) }));
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="Laboratory" sub={`Crushing day ${dayLabel(data.day)} · ${data.samples_today} samples`}>
        <DayPick day={day || data.day} onChange={setDay} />
        <NavBtn to={`/lab/entry?day=${data.day}`} icon={Beaker}>Hourly samples</NavBtn>
        <NavBtn to={`/lab/vehicle?day=${data.day}`} icon={Truck}>Vehicle samples</NavBtn>
        <NavBtn to={`/lab/stoppages?day=${data.day}`} icon={Pause}>Stoppages</NavBtn>
        <NavBtn to={`/lab/dmr?day=${data.day}`} icon={ClipboardCheck}>DMR</NavBtn>
      </Header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard icon={TrendingUp} label="Recovery" value={d ? `${f2(d.recovery_pct)}%` : "—"} color={C.green} sub={d ? `${num(d.sugar_bags)} bags · DMR ${d.status}` : "no DMR yet"} to={`/lab/dmr?day=${data.day}`} />
        <KpiCard icon={Weight} label="Cane crushed" value={d ? `${num(d.cane_crushed_kg / 1000)} t` : "—"} color={C.teal} sub={d ? `${f2(d.crush_rate_tph)} t/h` : ""} />
        <KpiCard icon={Timer} label="Running" value={d ? `${f2(d.running_hours, 1)} h` : "—"} color={C.blue} sub={d ? `${d.stoppage_minutes} min stopped` : ""} to={`/lab/stoppages?day=${data.day}`} />
        <KpiCard icon={Beaker} label="Mixed juice purity" value={data.averages["Mixed Juice"]?.purity ? `${f2(data.averages["Mixed Juice"].purity)}%` : "—"} color={C.violet} sub={`brix ${f2(data.averages["Mixed Juice"]?.brix)} · pol ${f2(data.averages["Mixed Juice"]?.pol)}`} />
        <KpiCard icon={AlertTriangle} label="Out of range" value={num(data.out_of_range.length)} color={data.out_of_range.length ? C.red : C.slate} sub="samples today" to={`/lab/entry?day=${data.day}`} />
        <KpiCard icon={Hourglass} label="Undetermined loss" value={d?.loss_undetermined !== undefined && d?.loss_undetermined !== null ? `${f2(d.loss_undetermined, 3)}%` : "—"} color={C.amber} sub="% cane" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Recovery and crushing" sub="Per crushing day" className="xl:col-span-2">
          <ResponsiveContainer>
            <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: t.axis, fontSize: 11 }} />
              <YAxis yAxisId="t" tick={{ fill: t.axis, fontSize: 11 }} width={44} unit=" t" />
              <YAxis yAxisId="r" orientation="right" tick={{ fill: t.axis, fontSize: 11 }} width={40} domain={[8, 12]} unit="%" />
              <Tooltip content={<ChartTip fmt={(v, k) => (k === "recovery_pct" ? `${f2(v)}%` : `${num(v)} t`)} />} />
              <Legend />
              <Bar yAxisId="t" dataKey="crushed_t" name="Crushed" fill={C.teal} radius={[5, 5, 0, 0]} isAnimationActive={false} />
              <Line yAxisId="r" dataKey="recovery_pct" name="Recovery %" stroke={C.green} strokeWidth={2.5} dot isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Mixed juice, hour by hour" sub="Purity % (line) and brix">
          <ResponsiveContainer>
            <LineChart data={data.hourly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: t.axis, fontSize: 10 }} interval={2} />
              <YAxis tick={{ fill: t.axis, fontSize: 11 }} width={36} domain={["auto", "auto"]} />
              <Tooltip content={<ChartTip fmt={(v) => f2(v)} />} />
              <Line dataKey="purity" name="Purity" stroke={C.violet} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              <Line dataKey="brix" name="Brix" stroke={C.amber} strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="The day's average analyses" bodyClass="h-auto">
          <DataTable rows={Object.values(data.averages)} rowKey={(r) => r.sample_type} dense cols={[
            { key: "t", label: "Stream", value: (r) => r.sample_type, render: (r) => <span className="font-semibold">{r.sample_type}</span> },
            { key: "n", label: "Samples", align: "right", value: (r) => r.samples },
            { key: "brix", label: "Brix", align: "right", value: (r) => r.brix ?? 0, render: (r) => f2(r.brix) },
            { key: "pol", label: "Pol", align: "right", value: (r) => r.pol ?? 0, render: (r) => f2(r.pol) },
            { key: "purity", label: "Purity", align: "right", value: (r) => r.purity ?? 0, render: (r) => f2(r.purity) },
            { key: "moist", label: "Moisture", align: "right", value: (r) => r.moisture_pct ?? 0, render: (r) => f2(r.moisture_pct) },
            { key: "oor", label: "Out", align: "right", value: (r) => r.out_of_range, render: (r) => (r.out_of_range ? <span className="font-bold text-red-600">{r.out_of_range}</span> : "—") },
          ]} />
        </ChartCard>
        <ChartCard title="Recovery by variety" sub={`Vehicle samples ${dayLabel(data.from)} – ${dayLabel(data.day)}: CCS × recovery factor`} bodyClass="h-auto">
          <DataTable rows={data.by_variety} rowKey={(r) => r.variety} dense initialSort={{ key: "rec", dir: "desc" }} cols={[
            { key: "v", label: "Variety", value: (r) => r.variety, render: (r) => <span className="font-semibold">{r.variety}</span> },
            { key: "n", label: "Samples", align: "right", value: (r) => r.samples },
            { key: "pur", label: "Purity", align: "right", value: (r) => r.purity, render: (r) => f2(r.purity) },
            { key: "fib", label: "Fibre", align: "right", value: (r) => r.fibre, render: (r) => f2(r.fibre) },
            { key: "ccs", label: "CCS %", align: "right", value: (r) => r.ccs, render: (r) => f2(r.ccs) },
            { key: "rec", label: "Est. recovery", align: "right", value: (r) => r.recovery, render: (r) => <b>{f2(r.recovery)}%</b>, bar: { color: C.green } },
          ]} />
        </ChartCard>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Stoppages by cause" sub={`${dayLabel(data.from)} – ${dayLabel(data.day)}`} bodyClass="h-auto">
          <DataTable rows={data.stoppages} rowKey={(r) => r.category} dense cols={[
            { key: "c", label: "Cause", value: (r) => r.category },
            { key: "n", label: "Times", align: "right", value: (r) => r.n },
            { key: "m", label: "Minutes", align: "right", value: (r) => r.minutes, bar: { color: C.red } },
          ]} />
        </ChartCard>
        <ChartCard title="Outside the limits today" bodyClass="h-auto">
          {data.out_of_range.length ? (
            <ul className="divide-y text-sm">{data.out_of_range.map((r) => <li key={r.name} className="flex gap-3 py-1.5"><span className="w-14 font-mono text-xs text-muted-foreground">{r.hour}</span><b className="w-36">{r.sample_type}</b><span className="text-red-600">{r.problems}</span></li>)}</ul>
          ) : <p className="py-6 text-center text-sm text-muted-foreground">Every sample within its limits.</p>}
        </ChartCard>
      </div>
    </div>
  );
}

// =============================================================== hourly entry
interface Grid { day: string; hours: string[]; start: string; cells: Record<string, Record<string, Cell>>; averages: Record<string, Record<string, number>> }

export function LabEntryPage() {
  const qc = useQueryClient();
  const { data: m } = useQuery({ queryKey: ["sc-lab-masters"], queryFn: () => get<Masters>(`${API}.masters`) });
  const [day, setDay] = useDay(m?.day);
  const { data: g, refetch } = useQuery({ queryKey: ["sc-lab-grid", day], enabled: !!day, queryFn: () => get<Grid>(`${API}.grid`, { day }) });
  const [hour, setHour] = useState(() => `${String(new Date().getHours()).padStart(2, "0")}:00`);
  const [vals, setVals] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const hourTime = useMemo(() => {
    if (!g) return "";
    const i = g.hours.indexOf(hour);
    const start = new Date(g.start.replace(" ", "T"));
    start.setHours(start.getHours() + Math.max(i, 0));
    const p = (n: number) => String(n).padStart(2, "0");
    return `${start.getFullYear()}-${p(start.getMonth() + 1)}-${p(start.getDate())} ${p(start.getHours())}:00:00`;
  }, [g, hour]);
  const due = (st: SampleType) => g ? g.hours.indexOf(hour) % Math.max(st.every_hours, 1) === 0 : false;
  const save = async () => {
    const rows = Object.entries(vals).map(([sample_type, v]) => ({ sample_type, sample_time: hourTime, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "")) }));
    if (!rows.length) return toast.error("Nothing entered");
    setBusy(true);
    try {
      const r = await post<{ saved: { name: string; out_of_range: number; problems?: string }[]; errors: { row: number; error: string }[] }>(`${API}.record`, { rows });
      toast.success(`${r.saved.length} sample(s) saved${r.saved.some((s) => s.out_of_range) ? " — some outside the limits" : ""}`);
      r.errors.forEach((e) => toast.error(`${rows[e.row]?.sample_type}: ${e.error}`));
      setVals({}); refetch(); qc.invalidateQueries({ queryKey: ["sc-lab-insights"] });
    } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  if (!m || !g) return <div className="p-6"><Skeleton className="h-96 rounded-2xl" /></div>;
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="Hourly samples" sub="Enter the hour's analyses for every stream; purity is computed, values outside a stream's limits are flagged">
        <DayPick day={day} onChange={setDay} />
        <NavBtn to={`/lab/dmr?day=${day}`} icon={ClipboardCheck}>DMR</NavBtn>
      </Header>
      {m.can_record && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h3 className="font-semibold">Enter samples for</h3>
            <select value={hour} onChange={(e) => setHour(e.target.value)} className="h-9 rounded-lg border bg-background px-2 font-mono text-sm">
              {g.hours.map((h) => <option key={h} value={h}>{h}</option>)}</select>
            <span className="text-xs text-muted-foreground">{hourTime}</span>
            <Button className="ml-auto" disabled={busy} onClick={save}><Save />{busy ? "Saving…" : "Save the hour"}</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {m.types.map((st) => {
              const done = g.cells[st.name]?.[hour];
              return (
                <div key={st.name} className={cn("rounded-xl border p-3", !due(st) && "opacity-60", done && "border-emerald-500/40 bg-emerald-500/5")}>
                  <div className="mb-2 flex items-center gap-2"><b className="text-sm">{st.name}</b><span className="text-[11px] text-muted-foreground">every {st.every_hours} h</span>
                    {done && <Badge tone={done.out_of_range ? "red" : "green"} className="ml-auto">{done.out_of_range ? "out of range" : "recorded"}</Badge>}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {st.limits.filter((l) => l.parameter !== "purity").map((l) => (
                      <label key={l.parameter} className="text-[11px] text-muted-foreground">{PARAM_LABEL[l.parameter]}
                        <Input disabled={!!done} inputMode="decimal" value={done ? String(done[l.parameter] ?? "") : vals[st.name]?.[l.parameter] ?? ""}
                          placeholder={String(l.target ?? "")} className="mt-0.5 h-8 font-mono text-sm"
                          onChange={(e) => setVals({ ...vals, [st.name]: { ...(vals[st.name] ?? {}), [l.parameter]: e.target.value } })} />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <header className="border-b px-4 py-3"><h3 className="font-semibold">The day — purity (pol where there's no purity)</h3></header>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground"><tr><th className="sticky left-0 bg-muted/40 px-2 py-1.5 text-left">Stream</th>
              {g.hours.map((h) => <th key={h} className={cn("px-1.5 py-1.5 font-mono", h === hour && "text-primary")}>{h.slice(0, 2)}</th>)}<th className="px-2">Avg</th></tr></thead>
            <tbody className="divide-y">
              {m.types.map((st) => (
                <tr key={st.name}>
                  <td className="sticky left-0 whitespace-nowrap bg-card px-2 py-1.5 font-semibold">{st.name}</td>
                  {g.hours.map((h) => {
                    const c = g.cells[st.name]?.[h];
                    const v = c ? (Number(c.purity) || Number(c.pol) || Number(c.moisture_pct) || null) : null;
                    return <td key={h} title={c?.problems ?? ""} onClick={() => setHour(h)} className={cn("cursor-pointer px-1.5 py-1.5 text-center tabular-nums", c?.out_of_range ? "bg-red-500/15 font-bold text-red-600" : c ? "" : "text-muted-foreground/40")}>{v !== null && v !== undefined ? Number(v).toFixed(1) : "·"}</td>;
                  })}
                  <td className="px-2 text-right font-semibold tabular-nums">{f2((g.averages[st.name]?.purity ?? g.averages[st.name]?.pol) as number | undefined, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// =============================================================== vehicle samples
interface VehicleData {
  day: string;
  samples: { name: string; cpr: string; grower_name: string; circle: string; variety?: string; vehicle_no: string; brix: number; pol: number; purity: number; fibre_pct: number; ccs_pct: number; est_recovery_pct: number }[];
  cprs: { name: string; grower_name: string; circle: string; vehicle_no: string; payable_maund: number; posted_at: string; point_name?: string; source: string }[];
}

function VehicleRow({ c, onDone }: { c: VehicleData["cprs"][number]; onDone: () => void }) {
  const [v, setV] = useState({ brix: "", pol: "", fibre_pct: "" });
  const [busy, setBusy] = useState(false);
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-1.5 font-mono text-xs">{c.name}</td><td className="px-3 py-1.5">{c.grower_name}<div className="text-[11px] text-muted-foreground">{c.circle} · {c.point_name || c.source}</div></td>
      <td className="px-3 py-1.5 font-mono text-xs">{c.vehicle_no}</td><td className="px-3 py-1.5 text-right tabular-nums">{f2(c.payable_maund, 1)}</td>
      {(["brix", "pol", "fibre_pct"] as const).map((k) => <td key={k} className="px-1 py-1"><Input value={v[k]} inputMode="decimal" onChange={(e) => setV({ ...v, [k]: e.target.value })} className="h-8 w-20 font-mono" /></td>)}
      <td className="px-2"><Button size="sm" disabled={busy || !v.brix || !v.pol || !v.fibre_pct} onClick={async () => {
        setBusy(true);
        try { const r = await post<{ ccs_pct: number; est_recovery_pct: number }>(`${API}.vehicle_sample`, { cpr: c.name, ...v }); toast.success(`CCS ${r.ccs_pct}% · recovery ${r.est_recovery_pct}%`); onDone(); } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
      }}>Save</Button></td>
    </tr>
  );
}

export function VehicleSamplesPage() {
  const { data: m } = useQuery({ queryKey: ["sc-lab-masters"], queryFn: () => get<Masters>(`${API}.masters`) });
  const [day, setDay] = useDay(m?.day);
  const { data, refetch } = useQuery({ queryKey: ["sc-lab-vehicle", day], enabled: !!day, queryFn: () => get<VehicleData>(`${API}.vehicle`, { day }) });
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="Vehicle (core) samples" sub="Juice brix and pol and fibre % cane of a load → CCS and estimated recovery, by grower, variety and circle"><DayPick day={day} onChange={setDay} /></Header>
      <ChartCard title={`Sampled (${data?.samples.length ?? 0})`} bodyClass="h-auto">
        <DataTable rows={data?.samples ?? []} rowKey={(r) => r.name} dense cols={[
          { key: "cpr", label: "CPR", value: (r) => r.cpr, render: (r) => <span className="font-mono text-xs">{r.cpr}</span> },
          { key: "g", label: "Grower", value: (r) => r.grower_name },
          { key: "v", label: "Variety", value: (r) => r.variety ?? "" },
          { key: "c", label: "Circle", value: (r) => r.circle },
          { key: "brix", label: "Brix", align: "right", value: (r) => r.brix, render: (r) => f2(r.brix) },
          { key: "pol", label: "Pol", align: "right", value: (r) => r.pol, render: (r) => f2(r.pol) },
          { key: "pur", label: "Purity", align: "right", value: (r) => r.purity, render: (r) => f2(r.purity) },
          { key: "fib", label: "Fibre", align: "right", value: (r) => r.fibre_pct, render: (r) => f2(r.fibre_pct) },
          { key: "ccs", label: "CCS %", align: "right", value: (r) => r.ccs_pct, render: (r) => <b>{f2(r.ccs_pct)}</b> },
          { key: "rec", label: "Recovery %", align: "right", value: (r) => r.est_recovery_pct, render: (r) => <b className="text-emerald-600">{f2(r.est_recovery_pct)}</b> },
        ]} />
      </ChartCard>
      {m?.can_record && (
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <header className="border-b px-4 py-3"><h3 className="font-semibold">Loads not sampled ({data?.cprs.length ?? 0})</h3></header>
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-sm"><thead className="sticky top-0 bg-muted/60 text-[11px] uppercase text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">CPR</th><th className="px-3 py-2 text-left">Grower</th><th className="px-3 py-2 text-left">Vehicle</th><th className="px-3 py-2 text-right">Maund</th>
              <th className="px-1 py-2 text-left">Brix</th><th className="px-1 py-2 text-left">Pol</th><th className="px-1 py-2 text-left">Fibre %</th><th /></tr></thead>
              <tbody className="divide-y">{data?.cprs.map((c) => <VehicleRow key={c.name} c={c} onDone={() => refetch()} />)}</tbody></table>
          </div>
        </section>
      )}
    </div>
  );
}

// =============================================================== stoppages
interface StopData { day: string; minutes: number; rows: { name: string; start: string; end?: string; category: string; section?: string; reason: string; minutes_in_day: number }[]; open: { name: string; start: string; category: string; reason: string }[] }
const CATS = ["Mechanical", "Electrical", "Process", "No Cane", "Power", "Planned Cleaning", "Other"];
const SECTIONS = ["Mill Tandem", "Cane Carrier", "Boiler", "Power House", "Boiling House", "Centrifugals", "Yard", "Other"];

export function StoppagesPage() {
  const { data: m } = useQuery({ queryKey: ["sc-lab-masters"], queryFn: () => get<Masters>(`${API}.masters`) });
  const [day, setDay] = useDay(m?.day);
  const { data, refetch } = useQuery({ queryKey: ["sc-lab-stops", day], enabled: !!day, queryFn: () => get<StopData>(`${API}.stoppages`, { day }), refetchInterval: 30_000 });
  const [f, setF] = useState({ category: "Mechanical", section: "Mill Tandem", reason: "", start: "", end: "" });
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); refetch(); } catch (e) { toast.error(err(e)); } };
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="Mill stoppages" sub="Every stop counts against the day's running hours and crush rate"><DayPick day={day} onChange={setDay} /></Header>
      {data?.open.map((o) => (
        <div key={o.name} className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
          <Pause className="size-5 text-red-600" /><b>Mill stopped since {fmt(o.start)}</b><span className="text-sm">{o.category} — {o.reason}</span>
          {m?.can_record && <Button className="ml-auto" onClick={() => run(() => post(`${API}.end_stoppage`, { name: o.name }), "Mill running again")}><Play />Restarted now</Button>}
        </div>
      ))}
      {m?.can_record && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="mb-3 font-semibold">Record a stoppage</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="h-9 rounded-lg border bg-background px-2 text-sm">{CATS.map((c) => <option key={c}>{c}</option>)}</select>
            <select value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} className="h-9 rounded-lg border bg-background px-2 text-sm">{SECTIONS.map((c) => <option key={c}>{c}</option>)}</select>
            <Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Reason" className="lg:col-span-2" />
            <Input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} title="Stopped at (empty = now)" />
            <Input type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} title="Restarted at (empty = still stopped)" />
          </div>
          <Button className="mt-3" disabled={!f.reason} onClick={() => run(() => post(`${API}.stoppage`, { ...f, start: f.start ? f.start.replace("T", " ") : new Date().toISOString().slice(0, 19).replace("T", " "), end: f.end ? f.end.replace("T", " ") : undefined }), "Stoppage recorded")}><Pause />Save stoppage</Button>
        </section>
      )}
      <ChartCard title={`The day: ${data?.minutes ?? 0} minutes stopped`} bodyClass="h-auto">
        <DataTable rows={data?.rows ?? []} rowKey={(r) => r.name} dense cols={[
          { key: "s", label: "Stopped", value: (r) => r.start, render: (r) => fmt(r.start) },
          { key: "e", label: "Restarted", value: (r) => r.end ?? "", render: (r) => (r.end ? fmt(r.end) : <Badge tone="red">still stopped</Badge>) },
          { key: "m", label: "Minutes (this day)", align: "right", value: (r) => r.minutes_in_day, bar: { color: C.red } },
          { key: "c", label: "Category", value: (r) => r.category },
          { key: "sec", label: "Section", value: (r) => r.section ?? "" },
          { key: "r", label: "Reason", value: (r) => r.reason },
        ]} />
      </ChartCard>
    </div>
  );
}

// =============================================================== DMR
interface Dmr {
  name?: string; saved: boolean; docstatus: number; status: string; crushing_day: string; season: string; day_closed: boolean;
  production?: { name: string; stock_entry: string; cost_per_bag: number } | null;
  cane_from_gate_kg: number; cane_from_depots_kg: number; cane_received_kg: number; yard_opening_kg: number; yard_closing_kg: number; cane_crushed_kg: number; cane_crushed_maund: number;
  stoppage_minutes: number; running_hours: number; crush_rate_tph: number; capacity_use_pct: number; sugar_bags: number; sugar_kg: number; recovery_pct: number;
  molasses_kg: number; bagasse_kg: number; press_mud_kg: number; molasses_pct_cane: number; bagasse_pct_cane: number; press_mud_pct_cane: number;
  pol_pct_cane?: number; loss_bagasse: number; loss_press_mud: number; loss_molasses: number; loss_known: number; loss_undetermined?: number;
  std_cane_crushed_kg: number; std_sugar_bags: number; std_recovery_pct: number; std_running_hours: number; remarks?: string;
  prepared_by?: string; prepared_at?: string; approved_by?: string; approved_at?: string;
  analyses: { sample_type: string; samples: number; brix?: number; pol?: number; purity?: number; moisture_pct?: number; out_of_range: number }[];
  stoppages: { name: string; start: string; category: string; reason: string; minutes_in_day: number }[];
}
const STATUS_TONE: Record<string, "gray" | "amber" | "green" | "red"> = { Draft: "gray", Prepared: "amber", Approved: "green", Cancelled: "red" };

export function DmrPage() {
  const qc = useQueryClient();
  const { data: m } = useQuery({ queryKey: ["sc-lab-masters"], queryFn: () => get<Masters>(`${API}.masters`) });
  const [day, setDay] = useDay(m?.day);
  const { data: d, refetch } = useQuery({ queryKey: ["sc-lab-dmr", day], enabled: !!day, queryFn: () => get<Dmr>(`${API}.dmr`, { day }) });
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const val = (k: keyof Dmr) => edit[k as string] ?? String(d?.[k] ?? "");
  const act = async (method: string, args: Record<string, string | number | undefined>, ok: string) => {
    setBusy(true);
    try { await post(`${API}.${method}`, args); toast.success(ok); setEdit({}); refetch(); qc.invalidateQueries({ queryKey: ["sc-lab-insights"] }); }
    catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  if (!d) return <div className="p-6"><Skeleton className="h-96 rounded-2xl" /></div>;
  const editable = d.docstatus === 0 && m?.can_record;
  const field = (k: keyof Dmr, label: string) => (
    <label className="block text-xs font-medium text-muted-foreground">{label}
      <Input disabled={!editable} inputMode="decimal" value={val(k)} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className="mt-1 font-mono" /></label>
  );
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title={`Daily Manufacturing Report · ${dayLabel(d.crushing_day)}`} sub={`Season ${d.season} · 07:00 → 07:00`}>
        <DayPick day={day} onChange={(x) => { setEdit({}); setDay(x); }} />
        <Badge tone={STATUS_TONE[d.status] ?? "gray"}>{d.saved ? d.status : "not saved"}</Badge>
        {editable && <Button variant="outline" disabled={busy} onClick={() => act("save_dmr", { day: d.crushing_day, ...Object.fromEntries(["yard_closing_kg", "sugar_bags", "molasses_kg", "bagasse_kg", "press_mud_kg", "pol_pct_cane", "remarks"].map((k) => [k, val(k as keyof Dmr)])) }, "Saved")}><Save />Save</Button>}
        {editable && d.saved && d.status === "Draft" && <Button disabled={busy} onClick={() => act("prepare", { day: d.crushing_day }, "Prepared — waiting for approval")}><ClipboardCheck />Prepare</Button>}
        {d.docstatus === 0 && d.status === "Prepared" && m?.can_approve && <Button disabled={busy} onClick={() => act("approve", { day: d.crushing_day }, "Approved")}><CheckCircle2 />Approve</Button>}
        {d.docstatus === 1 && !d.production && m?.can_approve && (d.day_closed
          ? <Button disabled={busy} onClick={() => act("post_production", { day: d.crushing_day }, "Production posted")}><Factory />Post production</Button>
          : <Link to="/procurement/day-close" className="text-xs font-semibold text-amber-600 underline">close the cane day first to post production</Link>)}
        {d.production && <Badge tone="green">Production {d.production.name} · Rs {num(d.production.cost_per_bag)}/bag</Badge>}
      </Header>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="mb-2 font-semibold">Cane</h3>
          <KV k="From the gate (CPRs)" v={`${num(d.cane_from_gate_kg)} kg`} />
          <KV k="From depots (trucks received)" v={`${num(d.cane_from_depots_kg)} kg`} />
          <KV k="Yard at 07:00 (opening)" v={`${num(d.yard_opening_kg)} kg`} />
          <div className="py-2">{field("yard_closing_kg", "Yard at 07:00 next day (closing), kg")}</div>
          <KV k="Cane crushed" v={`${num(d.cane_crushed_kg)} kg · ${f2(d.cane_crushed_maund, 0)} md`} strong />
          <KV k="Running · stopped" v={`${f2(d.running_hours, 1)} h · ${d.stoppage_minutes} min`} />
          <KV k="Crush rate · capacity" v={`${f2(d.crush_rate_tph)} t/h · ${f2(d.capacity_use_pct, 1)}%`} />
        </section>
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="mb-2 font-semibold">Production</h3>
          <div className="grid grid-cols-2 gap-2">
            {field("sugar_bags", "Sugar bags (50 kg)")}{field("molasses_kg", "Final molasses kg")}
            {field("bagasse_kg", "Bagasse kg")}{field("press_mud_kg", "Press mud kg")}
          </div>
          <div className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-center"><div className="text-3xl font-black tabular-nums text-emerald-700 dark:text-emerald-300">{f2(d.recovery_pct, 3)}%</div><div className="text-xs text-muted-foreground">recovery · {num(d.sugar_kg)} kg sugar</div></div>
          <KV k="Molasses · bagasse · mud % cane" v={`${f2(d.molasses_pct_cane)} · ${f2(d.bagasse_pct_cane)} · ${f2(d.press_mud_pct_cane)}`} />
        </section>
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="mb-2 font-semibold">Pol losses (% cane)</h3>
          <div className="pb-2">{field("pol_pct_cane", "Pol % cane (empty = from vehicle samples)")}</div>
          <KV k="In bagasse" v={f2(d.loss_bagasse, 3)} /><KV k="In press mud" v={f2(d.loss_press_mud, 3)} /><KV k="In final molasses" v={f2(d.loss_molasses, 3)} />
          <KV k="Known losses" v={f2(d.loss_known, 3)} /><KV k="Undetermined" v={f2(d.loss_undetermined, 3)} strong />
          <h3 className="mb-2 mt-4 font-semibold">Season to date</h3>
          <KV k="Cane crushed" v={`${num(d.std_cane_crushed_kg / 1000)} t`} /><KV k="Sugar bags" v={num(d.std_sugar_bags)} /><KV k="Recovery" v={`${f2(d.std_recovery_pct, 3)}%`} strong />
        </section>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Average analyses" bodyClass="h-auto">
          <DataTable rows={d.analyses} rowKey={(r) => r.sample_type} dense cols={[
            { key: "t", label: "Stream", value: (r) => r.sample_type, render: (r) => <b>{r.sample_type}</b> },
            { key: "n", label: "Samples", align: "right", value: (r) => r.samples },
            { key: "b", label: "Brix", align: "right", value: (r) => r.brix ?? 0, render: (r) => f2(r.brix) },
            { key: "p", label: "Pol", align: "right", value: (r) => r.pol ?? 0, render: (r) => f2(r.pol) },
            { key: "pu", label: "Purity", align: "right", value: (r) => r.purity ?? 0, render: (r) => f2(r.purity) },
            { key: "m", label: "Moisture", align: "right", value: (r) => r.moisture_pct ?? 0, render: (r) => f2(r.moisture_pct) },
            { key: "o", label: "Out", align: "right", value: (r) => r.out_of_range, render: (r) => (r.out_of_range ? <b className="text-red-600">{r.out_of_range}</b> : "—") },
          ]} />
        </ChartCard>
        <ChartCard title="Stoppages" bodyClass="h-auto">
          <DataTable rows={d.stoppages} rowKey={(r) => r.name} dense cols={[
            { key: "s", label: "At", value: (r) => r.start, render: (r) => fmt(r.start) },
            { key: "m", label: "Min", align: "right", value: (r) => r.minutes_in_day },
            { key: "c", label: "Category", value: (r) => r.category },
            { key: "r", label: "Reason", value: (r) => r.reason },
          ]} />
        </ChartCard>
      </div>
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <label className="block text-xs font-medium text-muted-foreground">Remarks
          <textarea disabled={!editable} value={val("remarks")} onChange={(e) => setEdit({ ...edit, remarks: e.target.value })} className="mt-1 h-20 w-full rounded-lg border bg-background p-2 text-sm" /></label>
        <p className="mt-2 text-xs text-muted-foreground">{d.prepared_by && `Prepared by ${d.prepared_by} ${fmt(d.prepared_at)}. `}{d.approved_by && `Approved by ${d.approved_by} ${fmt(d.approved_at)}.`}</p>
      </section>
    </div>
  );
}

// =============================================================== production
interface ProdDays {
  rows: { name: string; crushing_day: string; status: string; docstatus: number; cane_crushed_kg: number; sugar_bags: number; recovery_pct: number; molasses_kg: number; bagasse_kg: number; press_mud_kg: number; running_hours: number; crush_rate_tph: number; day_closed: boolean;
    production?: { name: string; stock_entry: string; work_order: string; cost_per_bag: number; sugar_value: number; by_product_value: number; cane_cost: number } | null }[];
  stock: Record<string, number>; can_post: boolean;
}

export function ProductionPage() {
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const { data, refetch } = useQuery({ queryKey: ["sc-prod-days"], queryFn: () => get<ProdDays>(`${API}.production_days`) });
  const [busy, setBusy] = useState("");
  if (!data) return <div className="p-6"><Skeleton className="h-96 rounded-2xl" /></div>;
  const s = data.stock;
  const chart = [...data.rows].reverse().map((r) => ({ label: dayLabel(r.crushing_day), bags: r.sugar_bags, cost: r.production?.cost_per_bag ?? null }));
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header kicker="Sugar production" title="Production" sub="Each approved DMR posts a Work Order and a Manufacture entry: the cane actually crushed and the packing bags in, sugar and by-products (at NRV) out">
        <NavBtn to="/production/plant" icon={GaugeIcon}>Plant levels</NavBtn><NavBtn to="/lab/dmr" icon={ClipboardCheck}>DMR</NavBtn>
      </Header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard icon={Package} label="Sugar in the godown" value={`${num(s.sugar_bags)} bags`} color={C.green} sub={`${num(s.sugar_bags * 50 / 1000)} t`} />
        <KpiCard icon={Beaker} label="Molasses" value={`${num(s.molasses_kg / 1000)} t`} color={C.amber} />
        <KpiCard icon={Sprout} label="Bagasse" value={`${num(s.bagasse_kg / 1000)} t`} color={C.teal} />
        <KpiCard icon={Factory} label="Press mud" value={`${num(s.press_mud_kg / 1000)} t`} color={C.slate} />
        <KpiCard icon={Package} label="Packing bags" value={num(s.packing_bags)} color={C.blue} />
        <KpiCard icon={Weight} label="Cane in the yard (books)" value={`${num(s.yard_kg / 1000)} t`} color={C.violet} />
      </div>
      <ChartCard title="Bags made and cost per bag">
        <ResponsiveContainer>
          <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: t.axis, fontSize: 11 }} />
            <YAxis yAxisId="b" tick={{ fill: t.axis, fontSize: 11 }} width={44} />
            <YAxis yAxisId="c" orientation="right" tick={{ fill: t.axis, fontSize: 11 }} width={52} />
            <Tooltip content={<ChartTip fmt={(v, k) => (k === "cost" ? money(v) : `${num(v)} bags`)} />} />
            <Legend />
            <Area yAxisId="b" dataKey="bags" name="Bags" stroke={C.green} fill={C.green} fillOpacity={0.25} isAnimationActive={false} />
            <Line yAxisId="c" dataKey="cost" name="Cost per bag" stroke={C.red} strokeWidth={2} dot connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Crushing days" bodyClass="h-auto">
        <DataTable rows={data.rows} rowKey={(r) => r.name} dense cols={[
          { key: "d", label: "Day", value: (r) => r.crushing_day, render: (r) => <Link className="font-semibold text-primary hover:underline" to={`/lab/dmr?day=${r.crushing_day}`}>{dayLabel(r.crushing_day)}</Link> },
          { key: "c", label: "Crushed t", align: "right", value: (r) => r.cane_crushed_kg, render: (r) => num(r.cane_crushed_kg / 1000) },
          { key: "b", label: "Bags", align: "right", value: (r) => r.sugar_bags },
          { key: "r", label: "Recovery", align: "right", value: (r) => r.recovery_pct, render: (r) => `${f2(r.recovery_pct)}%` },
          { key: "h", label: "Hours", align: "right", value: (r) => r.running_hours, render: (r) => f2(r.running_hours, 1) },
          { key: "cpb", label: "Cost / bag", align: "right", value: (r) => r.production?.cost_per_bag ?? 0, render: (r) => (r.production ? money(r.production.cost_per_bag) : "—") },
          { key: "s", label: "Status", value: (r) => r.status, render: (r) => (
            <span className="flex flex-wrap items-center gap-1">
              <Badge tone={STATUS_TONE[r.status] ?? "gray"}>DMR {r.status}</Badge>
              {r.production ? <Badge tone="green">posted {r.production.stock_entry}</Badge>
                : r.docstatus === 1 && data.can_post ? (r.day_closed
                  ? <Button size="sm" disabled={!!busy} onClick={async () => { setBusy(r.crushing_day); try { await post(`${API}.post_production`, { day: r.crushing_day }); toast.success("Production posted"); refetch(); } catch (e) { toast.error(err(e)); } finally { setBusy(""); } }}><Factory />{busy === r.crushing_day ? "Posting…" : "Post production"}</Button>
                  : <span className="text-[11px] text-amber-600">cane day not closed</span>) : null}
            </span>) },
        ]} />
      </ChartCard>
    </div>
  );
}

// =============================================================== plant
interface PlantData { points: { name: string; section: string; unit: string; min_value: number; max_value: number; capacity: number; value?: number; at?: string; out_of_range?: number }[]; can_record: boolean }

export function PlantPage() {
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const { data, refetch } = useQuery({ queryKey: ["sc-plant"], queryFn: () => get<PlantData>(`${API}.plant`), refetchInterval: 60_000 });
  const [point, setPoint] = useState("");
  const sel = point || data?.points[0]?.name || "";
  const { data: hist } = useQuery({ queryKey: ["sc-plant-hist", sel], enabled: !!sel, queryFn: () => get<{ reading_time: string; value: number }[]>(`${API}.plant_history`, { point: sel, hours: 120 }) });
  const [vals, setVals] = useState<Record<string, string>>({});
  if (!data) return <div className="p-6"><Skeleton className="h-96 rounded-2xl" /></div>;
  const selPt = data.points.find((p) => p.name === sel);
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header kicker="Sugar production" title="Plant levels" sub="The latest reading of every point against its normal range; click a point for its history">
        <NavBtn to="/production" icon={Factory}>Production</NavBtn>
      </Header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {data.points.map((p) => {
          const scale = p.capacity || p.max_value * 1.2 || 100;
          const pct = p.value !== undefined ? Math.min(100, (p.value / scale) * 100) : 0;
          return (
            <button key={p.name} type="button" onClick={() => setPoint(p.name)} className={cn("rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:shadow-md", sel === p.name && "ring-2 ring-primary/40", p.out_of_range && "border-red-500/50")}>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{p.section}</div>
              <div className="font-semibold">{p.name}</div>
              <div className={cn("mt-1 text-2xl font-black tabular-nums", p.out_of_range ? "text-red-600" : "")}>{p.value !== undefined ? f2(p.value, 1) : "—"} <span className="text-sm font-medium text-muted-foreground">{p.unit}</span></div>
              <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className="absolute inset-y-0 bg-emerald-500/25" style={{ left: `${(p.min_value / scale) * 100}%`, width: `${((p.max_value - p.min_value) / scale) * 100}%` }} />
                <div className={cn("absolute inset-y-0 left-0 rounded-full", p.out_of_range ? "bg-red-500" : "bg-sky-500")} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">normal {p.min_value}–{p.max_value} · {p.at ? fmt(p.at) : "no reading"}</div>
            </button>
          );
        })}
      </div>
      <ChartCard title={`${sel} — last 5 days`} sub={selPt ? `normal ${selPt.min_value}–${selPt.max_value} ${selPt.unit}` : ""}>
        <ResponsiveContainer>
          <LineChart data={(hist ?? []).map((h) => ({ ...h, label: fmt(h.reading_time) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: t.axis, fontSize: 10 }} minTickGap={40} />
            <YAxis tick={{ fill: t.axis, fontSize: 11 }} width={44} domain={["auto", "auto"]} />
            <Tooltip content={<ChartTip fmt={(v) => `${f2(v, 1)} ${selPt?.unit ?? ""}`} />} />
            <Line dataKey="value" name={sel} stroke={C.blue} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      {data.can_record && (() => {
        const entered = Object.values(vals).filter((v) => v.trim() !== "").length;
        const save = async () => {
          try { await post(`${API}.plant_reading`, { values: vals }); toast.success(`${entered} reading${entered === 1 ? "" : "s"} saved`); setVals({}); refetch(); } catch (e) { toast.error(err(e)); }
        };
        return (
          <section className={cn("rounded-2xl border bg-card p-4 shadow-sm", entered && "ring-2 ring-amber-500/40")}>
            <div className="mb-3 flex flex-wrap items-center gap-2"><h3 className="font-semibold">Record this hour's readings</h3>
              <span className="text-xs text-muted-foreground">Fill the points you read, then press Save. Nothing is kept until you do.</span></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {data.points.map((p) => {
                const raw = vals[p.name] ?? "";
                const v = Number(raw);
                const out = raw.trim() !== "" && !Number.isNaN(v) && (v < p.min_value || v > p.max_value);
                return (
                  <label key={p.name} className="text-xs text-muted-foreground">{p.name} ({p.unit})
                    <Input value={raw} inputMode="decimal" onChange={(e) => setVals({ ...vals, [p.name]: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter" && entered) void save(); }}
                      className={cn("mt-1 font-mono", out && "border-red-500 text-red-600")} />
                    <span className={cn("mt-0.5 block text-[11px]", out ? "text-red-600" : "text-muted-foreground/70")}>{out ? "outside " : "normal "}{p.min_value}–{p.max_value}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t pt-3">
              <span className={cn("text-sm", entered ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                {entered ? `${entered} of ${data.points.length} entered — not saved yet` : "No values entered"}</span>
              {entered > 0 && <Button variant="outline" onClick={() => setVals({})}>Clear</Button>}
              <Button disabled={!entered} onClick={save}><Save />Save readings</Button>
            </div>
          </section>
        );
      })()}
    </div>
  );
}
