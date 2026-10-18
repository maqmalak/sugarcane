/**
 * Depot purchase (Phase 4):
 * - DepotDashboardPage (/depot): per depot — cane bought, held, sent, received, transit shortage, freight; trend; trucks on the road.
 * - DispatchPage (/depot/dispatch?depot=): start a truck to the mill and follow it (Loading → In Transit → At Mill → Received).
 * Buying at a depot is the gate page in depot mode (/procurement/gate?depot=); weights are taken on the weighbridge page.
 * Data: sugarcane.api.v1.depot.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Banknote, PackageCheck, Plus, Scale, Ticket, Truck, Warehouse, Weight } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, ChartCard, ChartTip, DataTable, KpiCard, useChartTheme } from "@/sc/components/analytics/kit";
import { Button } from "@/sc/components/ui/button";
import { Input } from "@/sc/components/ui/input";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get, post } from "@/sc/lib/api";
import { money, num } from "@/sc/lib/format";
import { cn } from "@/sc/lib/utils";
import { useTheme } from "@/sc/providers/theme";
import { DispatchStatus, Plate, type DispatchDoc } from "./ProcurementPages";

const API = "sugarcane.api.v1.depot";
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (s?: string | null) => (s ? new Date(s.replace(" ", "T")).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const dayLabel = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const md = (kgv?: number | null) => num(Math.round((kgv ?? 0) / 40));

interface DepotRow {
  name: string; contractor?: string; allowed_shortage_pct: number; journey_to_mill_min?: number; bought_kg: number; balance_kg: number; loads: number; maund: number;
  payable: number; trucks_sent: number; sent_kg: number; trucks_received: number; received_kg: number; shortage_kg: number; shortage_pct: number;
  excess_kg: number; freight: number; recovery: number; in_transit: number; overdue: number;
}
interface Insights {
  day: string; from: string; depots: DepotRow[]; open: DispatchDoc[]; trend: { day: string; bought_md: number; sent_md: number; received_md: number; shortage_pct: number | null }[];
  kpi: Record<string, number>;
}
interface Masters {
  depots: { name: string; contractor?: string; freight_rate: number; allowed_shortage_pct: number; balance_kg: number; journey_to_mill_min?: number }[];
  vehicle_types: { name: string }[]; contractors: string[]; can_dispatch: boolean;
}

function Header({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600"><Warehouse className="size-4" />Depot purchase</div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
const NavBtn = ({ to, icon: Icon, children }: { to: string; icon: typeof Truck; children: React.ReactNode }) => (
  <Link to={to} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:bg-accent"><Icon className="size-4" />{children}</Link>
);

const dispatchCols = (go: (n: string) => void) => [
  { key: "name", label: "Dispatch", value: (r: DispatchDoc) => r.name, render: (r: DispatchDoc) => <button type="button" onClick={() => go(r.name)} className="font-mono text-xs font-semibold text-primary hover:underline">{r.name}</button> },
  { key: "depot", label: "Depot", value: (r: DispatchDoc) => r.depot },
  { key: "vehicle", label: "Truck", value: (r: DispatchDoc) => r.vehicle_no, render: (r: DispatchDoc) => <><Plate no={r.vehicle_no} /> <span className="text-[11px] text-muted-foreground">{r.contractor}</span></> },
  { key: "loaded", label: "Loaded", value: (r: DispatchDoc) => r.depot_gross_at ?? "", render: (r: DispatchDoc) => fmt(r.depot_gross_at) },
  { key: "sent", label: "Sent kg", align: "right" as const, value: (r: DispatchDoc) => r.dispatched_kg ?? 0, render: (r: DispatchDoc) => (r.dispatched_kg ? num(r.dispatched_kg) : "—") },
  { key: "received", label: "Received kg", align: "right" as const, value: (r: DispatchDoc) => r.received_kg ?? 0, render: (r: DispatchDoc) => (r.received_kg ? num(r.received_kg) : "—") },
  { key: "short", label: "Shortage", align: "right" as const, value: (r: DispatchDoc) => r.shortage_pct ?? 0, render: (r: DispatchDoc) => r.status === "Received"
    ? <span className={cn((r.excess_shortage_kg ?? 0) > 0 && "font-bold text-red-600")}>{num(r.shortage_kg)} kg · {r.shortage_pct}%</span> : "—" },
  { key: "journey", label: "Journey", align: "right" as const, value: (r: DispatchDoc) => r.journey_minutes ?? 0, render: (r: DispatchDoc) => (r.journey_minutes ? `${r.journey_minutes} min` : r.expected_at ? `due ${fmt(r.expected_at)}` : "—") },
  { key: "status", label: "Status", value: (r: DispatchDoc) => r.status, render: (r: DispatchDoc) => <><DispatchStatus s={r.status} overdue={r.overdue} />{r.next && <span className="ml-1 text-[11px] text-muted-foreground">next: {r.next}</span>}</> },
];

export function DepotDashboardPage() {
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["sc-depot-insights"], queryFn: () => get<Insights>(`${API}.insights`), refetchInterval: 60_000 });
  if (!data) return <div className="grid gap-4 p-6 md:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>;
  const k = data.kpi;
  const shortPct = k.sent_kg && k.received_kg ? ((k.shortage_kg * 100) / (k.received_kg + k.shortage_kg)).toFixed(2) : "0";
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="Depots" sub={`Cane bought at depots and sent to the mill · ${dayLabel(data.from)} – ${dayLabel(data.day)}`}>
        <NavBtn to={`/procurement/gate?depot=${encodeURIComponent(data.depots[0]?.name ?? "")}`} icon={Ticket}>Depot purchase</NavBtn>
        <NavBtn to="/depot/dispatch" icon={Truck}>Dispatch trucks</NavBtn>
        <NavBtn to="/procurement/weighbridge" icon={Scale}>Weighbridge</NavBtn>
      </Header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard icon={Weight} label="Bought at depots" value={`${num(k.maund)} md`} color={C.violet} sub={`${num(k.loads)} growers' loads`} />
        <KpiCard icon={Warehouse} label="Held at depots" value={`${md(k.balance_kg)} md`} color={C.amber} sub={`${num(k.balance_kg)} kg not yet sent`} />
        <KpiCard icon={Truck} label="On the road" value={num(k.in_transit)} color={k.overdue ? C.red : C.blue} sub={`${num(k.overdue)} overdue`} to="/depot/dispatch?status=In%20Transit" />
        <KpiCard icon={PackageCheck} label="Received at the mill" value={`${md(k.received_kg)} md`} color={C.green} sub={`${num(k.trucks_received)} trucks`} />
        <KpiCard icon={AlertTriangle} label="Transit shortage" value={`${shortPct}%`} color={k.excess_kg ? C.red : C.slate} sub={`${num(k.shortage_kg)} kg · ${num(k.excess_kg)} kg above allowance`} />
        <KpiCard icon={Banknote} label="Freight" value={money(k.freight, { compact: true })} color={C.teal} sub={`recovered ${money(k.recovery)}`} />
      </div>
      <ChartCard title="Bought, sent and received" sub="Maund per crushing day · line: transit shortage %">
        <ResponsiveContainer>
          <ComposedChart data={data.trend.map((r) => ({ ...r, label: dayLabel(r.day) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: t.axis, fontSize: 11 }} />
            <YAxis yAxisId="md" tick={{ fill: t.axis, fontSize: 11 }} width={48} />
            <YAxis yAxisId="pct" orientation="right" tick={{ fill: t.axis, fontSize: 11 }} width={36} unit="%" />
            <Tooltip content={<ChartTip fmt={(v, key) => (key === "shortage_pct" ? `${v}%` : `${num(v)} md`)} />} />
            <Legend />
            <Bar yAxisId="md" dataKey="bought_md" name="Bought" fill={C.violet} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar yAxisId="md" dataKey="sent_md" name="Sent" fill={C.amber} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar yAxisId="md" dataKey="received_md" name="Received" fill={C.green} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line yAxisId="pct" dataKey="shortage_pct" name="Shortage %" stroke={C.red} strokeWidth={2} dot isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
      <div className="grid gap-4 lg:grid-cols-3">
        {data.depots.map((d) => (
          <section key={d.name} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{d.name}</h3>
              <Link to={`/depot/dispatch?depot=${encodeURIComponent(d.name)}`} className="text-xs font-semibold text-primary hover:underline">trucks →</Link>
            </div>
            <p className="text-xs text-muted-foreground">{d.contractor ?? "no contractor"} · {d.journey_to_mill_min ?? "?"} min to the mill · allowance {d.allowed_shortage_pct}%</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-muted/40 p-2"><div className="text-lg font-bold tabular-nums">{num(d.maund)}</div><div className="text-[11px] text-muted-foreground">md bought</div></div>
              <div className="rounded-xl bg-muted/40 p-2"><div className="text-lg font-bold tabular-nums">{md(d.balance_kg)}</div><div className="text-[11px] text-muted-foreground">md held</div></div>
              <div className="rounded-xl bg-muted/40 p-2"><div className={cn("text-lg font-bold tabular-nums", d.excess_kg > 0 && "text-red-600")}>{d.shortage_pct}%</div><div className="text-[11px] text-muted-foreground">shortage</div></div>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Trucks sent / received</dt><dd className="font-medium">{d.trucks_sent} / {d.trucks_received}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">On the road</dt><dd className={cn("font-medium", d.overdue > 0 && "text-red-600")}>{d.in_transit}{d.overdue ? ` (${d.overdue} overdue)` : ""}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Shortage above allowance</dt><dd className="font-medium">{num(d.excess_kg)} kg</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Freight · recovered</dt><dd className="font-medium">{money(d.freight)} · {money(d.recovery)}</dd></div>
            </dl>
          </section>
        ))}
      </div>
      <ChartCard title="Trucks not yet received" sub="Loading at the depot, on the road, or at the mill waiting to be emptied" bodyClass="h-auto">
        <DataTable rows={data.open} rowKey={(r) => r.name} dense cols={dispatchCols((n) => navigate(`/procurement/weighbridge?no=${n}`))} />
      </ChartCard>
    </div>
  );
}

const TABS: [string, string][] = [["", "All"], ["Loading", "Loading"], ["In Transit", "On the road"], ["At Mill", "At the mill"], ["Received", "Received"], ["Cancelled", "Cancelled"]];

export function DispatchPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const { data: m } = useQuery({ queryKey: ["sc-depot-masters"], queryFn: () => get<Masters>(`${API}.masters`) });
  const depot = params.get("depot") ?? (m?.depots.length === 1 ? m.depots[0].name : "");
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n); };
  const { data, isLoading } = useQuery({ queryKey: ["sc-depot-board", depot, status], queryFn: () => get<{ rows: DispatchDoc[]; counts: Record<string, number> }>(`${API}.board`, { depot, status, days: 14 }), refetchInterval: 30_000 });
  const [f, setF] = useState({ vehicle_no: "", vehicle_type: "Truck", driver_name: "", driver_cnic: "", contractor: "" });
  const [busy, setBusy] = useState(false);
  const dep = m?.depots.find((d) => d.name === depot);
  const create = async () => {
    setBusy(true);
    try {
      const d = await post<DispatchDoc>(`${API}.create`, { depot, ...f });
      toast.success(`${d.name} started — take the empty weight on the depot's weighbridge`);
      setF({ vehicle_no: "", vehicle_type: "Truck", driver_name: "", driver_cnic: "", contractor: "" });
      qc.invalidateQueries({ queryKey: ["sc-depot-board"] });
      navigate(`/procurement/weighbridge?no=${d.name}`);
    } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title={depot ? `Dispatch · ${depot}` : "Depot dispatches"} sub="A truck is weighed empty and loaded at the depot, and loaded and empty again at the mill; the difference is the transit shortage.">
        <select value={depot} onChange={(e) => set("depot", e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm font-semibold">
          <option value="">All depots</option>{m?.depots.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
        </select>
        <NavBtn to="/depot" icon={Warehouse}>Depots</NavBtn>
        <NavBtn to={depot ? `/procurement/gate?depot=${encodeURIComponent(depot)}` : "/procurement/gate"} icon={Ticket}>Buy cane</NavBtn>
      </Header>
      {depot && m?.can_dispatch && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Send a truck</h3>
            {dep && <span className="text-xs text-muted-foreground">{depot} holds {num(dep.balance_kg)} kg not yet sent · freight Rs {dep.freight_rate}/md · allowance {dep.allowed_shortage_pct}%</span>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <Input value={f.vehicle_no} onChange={(e) => setF({ ...f, vehicle_no: e.target.value.toUpperCase() })} placeholder="Truck no." className="font-mono" />
            <select value={f.vehicle_type} onChange={(e) => setF({ ...f, vehicle_type: e.target.value })} className="h-9 rounded-lg border bg-background px-2 text-sm">
              {m.vehicle_types.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}</select>
            <Input value={f.driver_name} onChange={(e) => setF({ ...f, driver_name: e.target.value })} placeholder="Driver" />
            <Input value={f.driver_cnic} onChange={(e) => setF({ ...f, driver_cnic: e.target.value })} placeholder="Driver CNIC" />
            <select value={f.contractor} onChange={(e) => setF({ ...f, contractor: e.target.value })} className="h-9 rounded-lg border bg-background px-2 text-sm">
              <option value="">{dep?.contractor ? `Contractor: ${dep.contractor}` : "Contractor"}</option>{m.contractors.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <Button disabled={busy || !f.vehicle_no} onClick={create}><Plus />{busy ? "Starting…" : "Start & weigh empty"}</Button>
          </div>
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        {TABS.map(([s, label]) => (
          <button key={s} type="button" onClick={() => set("status", s)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", status === s ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
            {label}{s && data?.counts[s] ? ` · ${data.counts[s]}` : ""}{s === "In Transit" && data?.counts.Overdue ? ` (${data.counts.Overdue} overdue)` : ""}
          </button>
        ))}
      </div>
      <ChartCard title="Trucks" sub="Click a dispatch to weigh it on this PC's weighbridge" bodyClass="h-auto">
        {isLoading ? <Skeleton className="h-40" /> : <DataTable rows={data?.rows ?? []} rowKey={(r) => r.name} dense cols={dispatchCols((n) => navigate(`/procurement/weighbridge?no=${n}`))} />}
      </ChartCard>
    </div>
  );
}
