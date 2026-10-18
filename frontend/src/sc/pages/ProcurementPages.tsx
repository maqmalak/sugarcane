/**
 * Cane procurement (Phase 3): gate token → gross → yard → tare → CPR → TPT bilty → day close.
 * - ProcurementDashboardPage (/procurement): the crushing day's intake, by hour / circle / source, trend, latest CPRs.
 * - GatePage (/procurement/gate): scan the indent or ELP slip, check, issue the token and print it.
 * - WeighbridgePage (/procurement/weighbridge): this PC's terminal, the live weight, scan a token, take gross or tare.
 * - YardPage (/procurement/yard): vehicles waiting for gross and for tare, with their time inside.
 * - CounterPage (/procurement/counter): TPT bilty cash counter.
 * - DayClosePage (/procurement/day-close): crushing days, the daily cane purchase invoice and the control-account checks.
 * Data: sugarcane.api.v1.procurement.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Banknote, CheckCircle2, ClipboardCheck, Clock, Factory, Hourglass, Printer, Receipt, RotateCcw, Scale, ScanBarcode,
  Search, ShieldCheck, Ticket, Timer, Truck, Wallet, Warehouse, Weight, XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Link, useSearchParams } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, ChartCard, ChartTip, DataTable, Donut, KpiCard, useChartTheme } from "@/sc/components/analytics/kit";
import { Badge, type Tone } from "@/sc/components/ui/badge";
import { Button } from "@/sc/components/ui/button";
import { Input } from "@/sc/components/ui/input";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get, post, postDownload } from "@/sc/lib/api";
import { money, num } from "@/sc/lib/format";
import { useRealtime } from "@/sc/lib/realtime";
import { cn } from "@/sc/lib/utils";
import { useTheme } from "@/sc/providers/theme";

const API = "sugarcane.api.v1.procurement";
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (s?: string | null) => (s ? new Date(s.replace(" ", "T")).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const dayLabel = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const kg = (v?: number | null) => (v ? `${num(v)} kg` : "—");
const md = (v?: number | null) => (v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

export const printSlip = (kind: "token" | "cpr" | "bilty", name: string) =>
  postDownload(`${API}.slip`, { kind, name }, `${kind}-${name}.pdf`).catch((e) => toast.error(err(e)));

const TOKEN_TONE: Record<string, Tone> = { Issued: "blue", Gross: "amber", Completed: "green", Cancelled: "gray" };

export function Plate({ no, className }: { no?: string | null; className?: string }) {
  return <span className={cn("inline-block rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-xs font-bold tracking-wide text-yellow-300", className)}>{no || "—"}</span>;
}

function Header({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600"><Factory className="size-4" />Cane procurement</div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

const NavBtn = ({ to, icon: Icon, children }: { to: string; icon: typeof Ticket; children: ReactNode }) => (
  <Link to={to} className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:bg-accent"><Icon className="size-4" />{children}</Link>
);

function Scan({ onFind, placeholder, autoFocus = true }: { onFind: (q: string) => void; placeholder: string; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) box.current?.focus(); }, [autoFocus]);
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onFind(text.trim().toUpperCase()); setText(""); } }}>
      <div className="relative flex-1"><ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input ref={box} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="h-12 pl-10 font-mono text-lg" /></div>
      <Button type="submit" className="h-12 px-5"><Search />Find</Button>
    </form>
  );
}

function Notice({ tone, children }: { tone: "bad" | "warn" | "good" | "info"; children: ReactNode }) {
  const c = { bad: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300", warn: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
    good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", info: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300" }[tone];
  return <div className={cn("rounded-xl border p-3 text-sm", c)}>{children}</div>;
}

const KV = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="flex justify-between gap-3 border-b border-dashed py-1.5 text-sm last:border-0"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{v ?? "—"}</span></div>
);

// =============================================================== dashboard
interface Group { name: string; loads: number; maund: number; value: number; tpt: number }
interface Insights {
  day: string; current_day: string; window: [string, string]; closed?: { name: string; purchase_invoice: string; reconciled: number } | null;
  kpi: { tokens: number; waiting_gross: number; waiting_tare: number; cprs: number; maund: number; net_kg: number; binding_kg: number; govt_value: number;
    subsidy: number; cess: number; tpt: number; payable: number; elp_loads: number; avg_load_maund: number };
  season: { name?: string; crushing_target_maund?: number; daily_intake_maund?: number; maund: number };
  hours: { hour: string; maund: number }[]; by_circle: Group[]; by_source: Group[]; by_vehicle: Group[]; by_entry: Group[];
  trend: { day: string; loads: number; maund: number; payable: number; tpt: number }[]; unpaid_bilties: { n: number; amt: number };
  latest: { name: string; posted_at: string; grower_name: string; circle: string; point_name?: string; source: string; entry_type: string; payable_maund: number; payable_cpr: number }[];
}

export function ProcurementDashboardPage() {
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const [day, setDay] = useState("");
  const { data } = useQuery({ queryKey: ["sc-proc-insights", day], queryFn: () => get<Insights>(`${API}.insights`, day ? { day } : {}), refetchInterval: 60_000 });
  if (!data) return <div className="grid gap-4 p-6 md:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>;
  const k = data.kpi;
  const target = data.season.daily_intake_maund || 0;
  const groupCols = [
    { key: "name", label: "Name", value: (r: Group) => r.name, render: (r: Group) => <span className="font-semibold">{r.name}</span> },
    { key: "loads", label: "Loads", align: "right" as const, value: (r: Group) => r.loads },
    { key: "maund", label: "Maund", align: "right" as const, value: (r: Group) => r.maund, render: (r: Group) => md(r.maund), bar: { color: C.teal } },
    { key: "value", label: "Payable", align: "right" as const, value: (r: Group) => r.value, render: (r: Group) => money(r.value, { compact: true }) },
    { key: "tpt", label: "TPT", align: "right" as const, value: (r: Group) => r.tpt, render: (r: Group) => money(r.tpt, { compact: true }) },
  ];
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="Cane intake" sub={`Crushing day ${dayLabel(data.day)} · ${fmt(data.window[0])} → ${fmt(data.window[1])}`}>
        <input type="date" value={day || data.day} onChange={(e) => setDay(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm" />
        <NavBtn to="/procurement/gate" icon={Ticket}>Gate</NavBtn>
        <NavBtn to="/procurement/weighbridge" icon={Scale}>Weighbridge</NavBtn>
        <NavBtn to="/procurement/yard" icon={Warehouse}>Yard</NavBtn>
        <NavBtn to="/procurement/counter" icon={Wallet}>Cash counter</NavBtn>
        <NavBtn to="/procurement/day-close" icon={ClipboardCheck}>Day close</NavBtn>
      </Header>
      {data.closed ? <Notice tone="good">Day closed: {data.closed.name} → invoice {data.closed.purchase_invoice} {data.closed.reconciled ? "· reconciled" : "· not reconciled"}</Notice>
        : data.day < data.current_day && k.cprs > 0 && <Notice tone="warn">This day ended but isn't closed yet. <Link to="/procurement/day-close" className="font-semibold underline">Close it</Link> to raise the daily purchase invoice.</Notice>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard icon={Weight} label="Cane bought" value={`${num(k.maund)} md`} color={C.teal} sub={`${num(k.cprs)} CPRs · avg ${md(k.avg_load_maund)} md`}
          progress={target ? (k.maund * 100) / target : undefined} footer={target ? <>target <b>{num(target)} md</b>/day</> : undefined} />
        <KpiCard icon={Ticket} label="Tokens" value={num(k.tokens)} color={C.blue} sub={`${num(k.elp_loads)} ELP-verified loads`} to="/procurement/gate" />
        <KpiCard icon={Hourglass} label="In the yard" value={num(k.waiting_gross + k.waiting_tare)} color={C.amber} sub={`${k.waiting_gross} before gross · ${k.waiting_tare} before tare`} to="/procurement/yard" />
        <KpiCard icon={Receipt} label="Payable to growers" value={money(k.payable, { compact: true })} color={C.violet} sub={`govt value ${money(k.govt_value, { compact: true })}`} />
        <KpiCard icon={Truck} label="TPT (bilties)" value={money(k.tpt, { compact: true })} color={C.orange} sub={`${num(data.unpaid_bilties.n)} unpaid · ${money(data.unpaid_bilties.amt, { compact: true })}`} to="/procurement/counter" />
        <KpiCard icon={Factory} label="Season so far" value={`${num(data.season.maund)} md`} color={C.emerald}
          progress={data.season.crushing_target_maund ? (data.season.maund * 100) / data.season.crushing_target_maund : undefined}
          sub={data.season.crushing_target_maund ? `of ${num(data.season.crushing_target_maund)} md target` : data.season.name} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Intake by hour" sub="Payable maund posted each hour of the crushing day" className="xl:col-span-2">
          <ResponsiveContainer>
            <BarChart data={data.hours} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: t.axis, fontSize: 10 }} interval={1} />
              <YAxis tick={{ fill: t.axis, fontSize: 11 }} width={40} />
              <Tooltip content={<ChartTip fmt={(v) => `${md(v)} md`} />} />
              <Bar dataKey="maund" name="Maund" fill={C.teal} radius={[5, 5, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="ELP-verified vs gate" sub="Loads paid at the loading point's TPT vs the mill-gate rates">
          <Donut data={data.by_entry.map((g, i) => ({ name: g.name, value: g.loads, color: i === 0 ? C.green : C.slate }))} centerLabel="loads" centerValue={num(k.cprs)} />
        </ChartCard>
      </div>
      <ChartCard title="Daily trend" sub="Payable maund per crushing day">
        <ResponsiveContainer>
          <AreaChart data={data.trend.map((r) => ({ ...r, label: dayLabel(r.day) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: t.axis, fontSize: 11 }} />
            <YAxis tick={{ fill: t.axis, fontSize: 11 }} width={48} />
            <Tooltip content={<ChartTip fmt={(v) => `${md(v)} md`} />} />
            <Area dataKey="maund" name="Maund" stroke={C.teal} fill={C.teal} fillOpacity={0.25} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="By circle" bodyClass="h-auto"><DataTable rows={data.by_circle} rowKey={(r) => r.name} cols={groupCols} initialSort={{ key: "maund", dir: "desc" }} dense /></ChartCard>
        <ChartCard title="By loading point / source" bodyClass="h-auto"><DataTable rows={data.by_source} rowKey={(r) => r.name} cols={groupCols} initialSort={{ key: "maund", dir: "desc" }} dense /></ChartCard>
      </div>
      <ChartCard title="Latest CPRs" bodyClass="h-auto">
        <DataTable rows={data.latest} rowKey={(r) => r.name} dense cols={[
          { key: "name", label: "CPR", value: (r) => r.name, render: (r) => <Link className="font-semibold text-primary hover:underline" to={`/procurement/d/cane-purchase-receipt/${r.name}`}>{r.name}</Link> },
          { key: "posted_at", label: "Posted", value: (r) => r.posted_at, render: (r) => fmt(r.posted_at) },
          { key: "grower", label: "Grower", value: (r) => r.grower_name },
          { key: "from", label: "From", value: (r) => r.point_name || r.source, render: (r) => <>{r.point_name || r.source} {r.entry_type === "ELP Verified" && <Badge tone="green">ELP</Badge>}</> },
          { key: "maund", label: "Maund", align: "right", value: (r) => r.payable_maund, render: (r) => md(r.payable_maund) },
          { key: "pay", label: "Payable", align: "right", value: (r) => r.payable_cpr, render: (r) => money(r.payable_cpr) },
          { key: "print", label: "", value: () => "", render: (r) => <button type="button" title="Print CPR" onClick={() => printSlip("cpr", r.name)} className="text-muted-foreground hover:text-foreground"><Printer className="size-4" /></button> },
        ]} />
      </ChartCard>
    </div>
  );
}

// =============================================================== gate
interface Offer {
  indent?: string; elp_registration?: string; elp_status?: string; entry_type?: string; needs_reason?: boolean; blocks: string[]; notes: string[];
  token?: string; token_status?: string; season?: string; circle?: string; source?: string; claimed_source?: string; point_name?: string;
  load_maund?: number; valid_to?: string; grower?: string; grower_info?: { grower_name?: string; father_name?: string; cnic?: string; village_name?: string };
  vehicle?: { vehicle_no?: string; vehicle_type?: string; driver_name?: string; driver_cnic?: string; driver_mobile?: string };
  rates?: Record<string, number | string>;
}
interface VType { name: string; default_lane?: string; min_gross_kg: number; max_gross_kg: number; min_tare_kg: number; max_tare_kg: number }
interface TokenRow { name: string; status: string; entry_type: string; issued_at: string; vehicle_no: string; vehicle_type: string; grower_name: string; point_name?: string; source: string; lane?: string; cpr?: string; print_count?: number }

function OfferCard({ o, types, onIssued }: { o: Offer; types: VType[]; onIssued: (name: string) => void }) {
  const [v, setV] = useState({ vehicle_no: o.vehicle?.vehicle_no ?? "", vehicle_type: o.vehicle?.vehicle_type ?? "", driver_name: o.vehicle?.driver_name ?? "",
    driver_cnic: o.vehicle?.driver_cnic ?? "", driver_mobile: o.vehicle?.driver_mobile ?? "", gate_reason: "" });
  const [busy, setBusy] = useState(false);
  const fromElp = !!o.vehicle?.vehicle_no;
  const { data: preview } = useQuery({ queryKey: ["sc-proc-offer", o.indent, o.elp_registration, v.vehicle_type], enabled: !o.blocks.length && !!v.vehicle_type,
    queryFn: () => get<Offer>(`${API}.offer`, { indent: o.indent, elp_registration: o.elp_registration, vehicle_type: v.vehicle_type }) });
  const rates = preview?.rates;
  const issue = async () => {
    setBusy(true);
    try {
      const t = await post<{ name: string }>(`${API}.issue`, { indent: o.indent, elp_registration: o.elp_registration, ...v });
      toast.success(`Token ${t.name} issued`);
      printSlip("token", t.name);
      onIssued(t.name);
    } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
  };
  const g = o.grower_info ?? {};
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h3 className="font-semibold">{g.grower_name ?? o.grower ?? "—"}</h3>
        {g.father_name && <span className="text-sm text-muted-foreground">s/o {g.father_name}</span>}
        <span className="ml-auto flex flex-wrap gap-1.5">
          {o.indent && <Badge tone="blue">Indent {o.indent}</Badge>}
          {o.elp_registration && <Badge tone={o.elp_status === "Accepted" ? "green" : o.elp_status === "Rejected" ? "red" : "amber"}>ELP {o.elp_registration} · {o.elp_status}</Badge>}
          {o.entry_type && <Badge tone={o.entry_type === "ELP Verified" ? "green" : "gray"}>{o.entry_type}</Badge>}
        </span>
      </header>
      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <div>
          <KV k="Grower ID" v={o.grower} /><KV k="CNIC" v={g.cnic} /><KV k="Village · circle" v={`${g.village_name ?? ""} · ${o.circle ?? ""}`} />
          <KV k="From" v={o.point_name || o.claimed_source || "—"} /><KV k="Rates of" v={o.source} />
          {o.load_maund ? <KV k="Indent load" v={`${num(o.load_maund)} md · valid to ${o.valid_to ? dayLabel(o.valid_to) : "—"}`} /> : null}
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">Vehicle no.
            <Input value={v.vehicle_no} disabled={fromElp} onChange={(e) => setV({ ...v, vehicle_no: e.target.value.toUpperCase() })} className="mt-1 font-mono" placeholder="LEA-1234" /></label>
          <label className="block text-xs font-medium text-muted-foreground">Vehicle type
            <select value={v.vehicle_type} onChange={(e) => setV({ ...v, vehicle_type: e.target.value })} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground">
              <option value="">—</option>{types.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-muted-foreground">Driver<Input value={v.driver_name} onChange={(e) => setV({ ...v, driver_name: e.target.value })} className="mt-1" /></label>
            <label className="block text-xs font-medium text-muted-foreground">Driver CNIC<Input value={v.driver_cnic} onChange={(e) => setV({ ...v, driver_cnic: e.target.value })} className="mt-1" placeholder="#####-#######-#" /></label>
          </div>
          <label className="block text-xs font-medium text-muted-foreground">Driver mobile<Input value={v.driver_mobile} onChange={(e) => setV({ ...v, driver_mobile: e.target.value })} className="mt-1" /></label>
        </div>
        <div className="space-y-2">
          {o.blocks.map((b) => <Notice key={b} tone="bad">{b}</Notice>)}
          {o.notes.map((b) => <Notice key={b} tone="warn">{b}</Notice>)}
          {rates && (
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rates copied to the token</p>
              <KV k="Govt rate" v={`Rs ${rates.govt_rate}/md`} /><KV k="TPT" v={`Rs ${rates.tpt_rate}/md`} />
              <KV k="Subsidy + additional" v={`Rs ${rates.subsidy_rate} + ${rates.additional_subsidy_rate}/md`} />
              <KV k="Road cess · binding" v={`${rates.road_cess_pct}% · ${rates.binding_kg_per_quintal} kg/qtl`} />
            </div>
          )}
          {o.needs_reason && !o.blocks.length && (
            <label className="block text-xs font-medium text-muted-foreground">Why take it at the gate rates?
              <Input value={v.gate_reason} onChange={(e) => setV({ ...v, gate_reason: e.target.value })} className="mt-1" placeholder="e.g. audit team not on duty, grower agrees" /></label>
          )}
          <Button className="h-11 w-full" disabled={busy || !!o.blocks.length || !v.vehicle_no || !v.vehicle_type || (o.needs_reason && !v.gate_reason.trim())} onClick={issue}>
            <Ticket />{busy ? "Issuing…" : "Issue token & print"}</Button>
        </div>
      </div>
    </section>
  );
}

export function GatePage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const { data: m } = useQuery({ queryKey: ["sc-proc-masters"], queryFn: () => get<{ vehicle_types: VType[]; day: string }>(`${API}.masters`) });
  const { data: found, isFetching } = useQuery({ queryKey: ["sc-proc-find", q], enabled: !!q, queryFn: () => get<Offer[]>(`${API}.find`, { q }) });
  const { data: tokens } = useQuery({ queryKey: ["sc-proc-tokens"], queryFn: () => get<TokenRow[]>(`${API}.tokens`, { limit: 30 }), refetchInterval: 30_000 });
  const issued = () => { setParams({}); qc.invalidateQueries({ queryKey: ["sc-proc-tokens"] }); };
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <Header title="Gate · token issue" sub="Scan the grower's indent or the ELP slip (or type the vehicle no.). The token carries the rates; ELP-verified loads get their loading point's TPT.">
        <NavBtn to="/elp/gate" icon={ShieldCheck}>ELP arrival & audit</NavBtn>
        <NavBtn to="/procurement/yard" icon={Warehouse}>Yard</NavBtn>
      </Header>
      <Scan onFind={(x) => setParams({ q: x })} placeholder="Indent no. (scan), ELP-… registration or vehicle no." />
      {isFetching && <div className="h-56 animate-pulse rounded-2xl border bg-muted/40" />}
      {!isFetching && q && found && !found.length && <Notice tone="bad">Nothing found for <b className="font-mono">{q}</b>: no indent, ELP registration or open load with that number.</Notice>}
      {!isFetching && found?.map((o) => o.token
        ? <Notice key={o.token} tone="info">{o.blocks[0]} — <Link className="font-semibold underline" to={`/procurement/d/cane-token/${o.token}`}>open</Link></Notice>
        : <OfferCard key={`${o.indent}-${o.elp_registration}`} o={o} types={m?.vehicle_types ?? []} onIssued={issued} />)}
      <ChartCard title="Tokens today" sub={m ? `Crushing day ${dayLabel(m.day)}` : ""} bodyClass="h-auto">
        <DataTable rows={tokens ?? []} rowKey={(r) => r.name} dense cols={[
          { key: "name", label: "Token", value: (r) => r.name, render: (r) => <Link className="font-semibold text-primary hover:underline" to={`/procurement/d/cane-token/${r.name}`}>{r.name}</Link> },
          { key: "issued_at", label: "Issued", value: (r) => r.issued_at, render: (r) => fmt(r.issued_at) },
          { key: "vehicle", label: "Vehicle", value: (r) => r.vehicle_no, render: (r) => <><Plate no={r.vehicle_no} /> <span className="text-xs text-muted-foreground">{r.vehicle_type}</span></> },
          { key: "grower", label: "Grower", value: (r) => r.grower_name },
          { key: "from", label: "From", value: (r) => r.point_name || r.source },
          { key: "entry", label: "Entry", value: (r) => r.entry_type, render: (r) => <Badge tone={r.entry_type === "ELP Verified" ? "green" : "gray"}>{r.entry_type}</Badge> },
          { key: "status", label: "Status", value: (r) => r.status, render: (r) => <Badge tone={TOKEN_TONE[r.status]}>{r.status}</Badge> },
          { key: "print", label: "", value: () => "", render: (r) => <button type="button" title="Print token" onClick={() => printSlip("token", r.name)} className="text-muted-foreground hover:text-foreground"><Printer className="size-4" /></button> },
        ]} />
      </ChartCard>
    </div>
  );
}

// =============================================================== weighbridge
interface Reading { weight_kg: number; stable: number; source: string; at: string; age_s: number; raw?: string }
interface TerminalInfo {
  terminal: { name: string; terminal_name: string; allowed_operations: string; indicator_protocol: string; lane?: string } | null; error?: string; ip?: string;
  reading?: Reading | null; fresh_s: number; min_kg: number; can_manual: boolean;
  recent: { name: string; token: string; status: string; vehicle_no: string; vehicle_type: string; grower_name: string; gross_kg: number; tare_kg?: number; net_kg?: number; gross_at: string; tare_at?: string; cpr?: string; manual_entry: number }[];
}
interface TokenDoc extends TokenRow {
  docstatus: number; grower: string; circle?: string; village_name?: string; weighment?: string; govt_rate: number; tpt_rate: number;
  weighment_doc?: { gross_kg: number; gross_at: string; gross_terminal: string; tare_kg?: number; net_kg?: number; manual_entry: number } | null;
  cpr_doc?: { name: string; payable_kg: number; payable_maund: number; govt_value: number; tpt_amount: number; payable_cpr: number; bilty?: string } | null;
  vehicle_limits?: { min_gross_kg: number; max_gross_kg: number; min_tare_kg: number; max_tare_kg: number };
}

function LiveWeight({ r, fresh }: { r?: Reading | null; fresh: number }) {
  const old = !r || r.age_s > fresh || r.age_s < -5;
  return (
    <div className={cn("rounded-2xl border-2 bg-zinc-950 p-5 text-center shadow-inner", old ? "border-zinc-700" : r?.stable ? "border-emerald-500" : "border-amber-500")}>
      <div className={cn("font-mono text-6xl font-black tabular-nums tracking-tight", old ? "text-zinc-600" : r?.stable ? "text-emerald-400" : "text-amber-300")}>
        {r ? r.weight_kg.toLocaleString() : "------"}<span className="ml-2 text-2xl">kg</span></div>
      <div className="mt-2 flex justify-center gap-3 text-xs font-semibold uppercase tracking-wider">
        <span className={old ? "text-zinc-500" : r?.stable ? "text-emerald-400" : "text-amber-300"}>{old ? "no signal" : r?.stable ? "stable" : "moving"}</span>
        {r && <span className="text-zinc-500">{r.source} · {r.age_s.toFixed(0)} s ago</span>}
      </div>
    </div>
  );
}

export function WeighbridgePage() {
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const [manual, setManual] = useState({ open: false, kg: "", note: "" });
  const [busy, setBusy] = useState(false);
  const { data: info, refetch } = useQuery({ queryKey: ["sc-proc-terminal"], queryFn: () => get<TerminalInfo>(`${API}.terminal`), refetchInterval: 2_000 });
  const [live, setLive] = useState<Reading | null>(null);
  useRealtime<Reading & { terminal: string }>("sugarcane_weight", (d) => { if (d.terminal === info?.terminal?.name) setLive({ ...d, age_s: 0 }); });
  const reading = live && info?.reading && live.at > info.reading.at ? live : info?.reading ?? live;
  const { data: tok, refetch: reTok } = useQuery({ queryKey: ["sc-proc-token", token], enabled: !!token, queryFn: () => get<TokenDoc>(`${API}.token`, { name: token }) });
  const op = tok?.status === "Issued" ? "Gross" : tok?.status === "Gross" ? "Tare" : null;
  const allowed = (o: string) => !!info?.terminal && ["All", o, ...(o !== "Misc" ? ["Gross and Tare"] : [])].includes(info.terminal.allowed_operations);
  const sim = info?.terminal?.indicator_protocol === "Simulator";
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } catch (e) { toast.error(err(e)); } finally { setBusy(false); } };
  const capture = () => run(async () => {
    const r = await post<{ weight_kg: number; cpr?: string; net_kg?: number }>(`${API}.capture`, { token, operation: op, ...(manual.open ? { manual_kg: manual.kg, note: manual.note } : {}) });
    toast.success(op === "Gross" ? `Gross ${num(r.weight_kg)} kg recorded` : `Tare ${num(r.weight_kg)} kg · net ${num(r.net_kg)} kg · CPR ${r.cpr}`);
    if (r.cpr) printSlip("cpr", r.cpr);
    setManual({ open: false, kg: "", note: "" });
    reTok(); refetch(); qc.invalidateQueries({ queryKey: ["sc-proc-yard"] });
  });
  const limits = tok?.vehicle_limits;
  if (info && !info.terminal) return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Header title="Weighbridge" sub="Gross and tare from the terminal's indicator" />
      <Notice tone="bad"><b>This PC is not a weighbridge terminal.</b> {info.error} Register its IP ({info.ip ?? "?"}) under Setup → Weighbridge Terminals.</Notice>
    </div>
  );
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <Header title={`Weighbridge · ${info?.terminal?.terminal_name ?? "…"}`} sub={`${info?.terminal?.allowed_operations ?? ""} · ${info?.terminal?.lane ?? ""} · indicator ${info?.terminal?.indicator_protocol ?? ""} · this PC ${info?.ip ?? ""}`}>
        <NavBtn to="/procurement/yard" icon={Warehouse}>Yard</NavBtn>
      </Header>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <LiveWeight r={reading} fresh={info?.fresh_s ?? 10} />
          {sim && (
            <div className="rounded-xl border border-dashed p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Simulator (no indicator on this terminal)</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={!token || !op} onClick={() => run(async () => { await post(`${API}.simulate`, { token, operation: op }); refetch(); })}>Put the vehicle on</Button>
                <Button variant="outline" size="sm" onClick={() => run(async () => { await post(`${API}.simulate`, { weight_kg: 0, stable: 1 }); refetch(); })}>Empty bridge</Button>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-3 lg:col-span-3">
          <Scan onFind={setToken} placeholder="Scan the token (TKN-…)" />
          {tok && (
            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Plate no={tok.vehicle_no} className="text-base" /><span className="text-sm text-muted-foreground">{tok.vehicle_type}</span>
                <Badge tone={TOKEN_TONE[tok.status]}>{tok.status}</Badge><Badge tone={tok.entry_type === "ELP Verified" ? "green" : "gray"}>{tok.entry_type}</Badge>
                <span className="ml-auto font-mono text-sm">{tok.name}</span>
              </div>
              <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
                <div><KV k="Grower" v={tok.grower_name} /><KV k="From" v={tok.point_name || tok.source} /><KV k="Rates" v={`govt ${tok.govt_rate} · TPT ${tok.tpt_rate} /md`} /></div>
                <div>
                  <KV k="Gross" v={tok.weighment_doc ? `${kg(tok.weighment_doc.gross_kg)} · ${fmt(tok.weighment_doc.gross_at)}` : "—"} />
                  <KV k="Tare" v={kg(tok.weighment_doc?.tare_kg)} /><KV k="Net" v={kg(tok.weighment_doc?.net_kg)} />
                </div>
              </div>
              {limits && op && <p className="mt-2 text-xs text-muted-foreground">{tok.vehicle_type} {op.toLowerCase()} limits: {num(op === "Gross" ? limits.min_gross_kg : limits.min_tare_kg)}–{num(op === "Gross" ? limits.max_gross_kg : limits.max_tare_kg)} kg</p>}
              {tok.cpr_doc && (
                <Notice tone="good">
                  <div className="flex flex-wrap items-center gap-3">CPR <b>{tok.cpr_doc.name}</b>: {md(tok.cpr_doc.payable_maund)} md · payable {money(tok.cpr_doc.payable_cpr)} {tok.cpr_doc.bilty && <>· bilty {tok.cpr_doc.bilty} ({money(tok.cpr_doc.tpt_amount)})</>}
                    <Button size="sm" variant="outline" onClick={() => printSlip("cpr", tok.cpr_doc!.name)}><Printer />CPR</Button>
                    {tok.cpr_doc.bilty && <Button size="sm" variant="outline" onClick={() => printSlip("bilty", tok.cpr_doc!.bilty!)}><Printer />Bilty</Button>}</div>
                </Notice>
              )}
              {op && (
                <div className="mt-3 space-y-2">
                  {!allowed(op) && <Notice tone="warn">This terminal takes {info?.terminal?.allowed_operations} weights only — send the vehicle to the {op.toLowerCase()} bridge.</Notice>}
                  {manual.open && (
                    <div className="grid gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 sm:grid-cols-3">
                      <Input value={manual.kg} onChange={(e) => setManual({ ...manual, kg: e.target.value.replace(/\D/g, "") })} placeholder="Weight kg" className="font-mono" />
                      <Input value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} placeholder="Why typed in (indicator offline…)" className="sm:col-span-2" />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button className="h-12 flex-1 text-base" disabled={busy || !allowed(op) || (!manual.open && !(reading?.stable && reading.age_s <= (info?.fresh_s ?? 10) && reading.age_s > -5))} onClick={capture}>
                      <Weight />{busy ? "Saving…" : `Take ${op} weight${manual.open ? ` (${manual.kg || 0} kg typed)` : reading ? ` · ${num(reading.weight_kg)} kg` : ""}`}</Button>
                    {info?.can_manual && <Button variant="outline" className="h-12" onClick={() => setManual({ ...manual, open: !manual.open })}>{manual.open ? "Use the indicator" : "Type the weight"}</Button>}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
      <ChartCard title="Recent weighments on this terminal" bodyClass="h-auto">
        <DataTable rows={info?.recent ?? []} rowKey={(r) => r.name} dense cols={[
          { key: "token", label: "Token", value: (r) => r.token, render: (r) => <button type="button" onClick={() => setToken(r.token)} className="font-mono text-xs text-primary hover:underline">{r.token}</button> },
          { key: "vehicle", label: "Vehicle", value: (r) => r.vehicle_no, render: (r) => <Plate no={r.vehicle_no} /> },
          { key: "grower", label: "Grower", value: (r) => r.grower_name },
          { key: "gross", label: "Gross", align: "right", value: (r) => r.gross_kg, render: (r) => num(r.gross_kg) },
          { key: "tare", label: "Tare", align: "right", value: (r) => r.tare_kg ?? 0, render: (r) => (r.tare_kg ? num(r.tare_kg) : "—") },
          { key: "net", label: "Net", align: "right", value: (r) => r.net_kg ?? 0, render: (r) => (r.net_kg ? <b>{num(r.net_kg)}</b> : "—") },
          { key: "status", label: "Status", value: (r) => r.status, render: (r) => <>{r.status === "Completed" ? <Badge tone="green">CPR {r.cpr}</Badge> : <Badge tone="amber">{r.status}</Badge>} {r.manual_entry ? <Badge tone="red">typed</Badge> : null}</> },
        ]} />
      </ChartCard>
    </div>
  );
}

// =============================================================== yard
interface YardRow { name: string; status: string; entry_type: string; issued_at: string; gross_at?: string; vehicle_no: string; vehicle_type: string; lane?: string; grower_name: string; circle?: string; point_name?: string; source: string; minutes: number; total_minutes: number; late: boolean; gross_kg?: number }
interface Yard { waiting_gross: YardRow[]; waiting_tare: YardRow[]; lanes: { lane: string; count: number }[]; cane_in_yard_kg: number; done_today: number; avg_yard_min: number; max_yard_hours: number; late: number }

function YardList({ title, sub, rows, tone }: { title: string; sub: string; rows: YardRow[]; tone: Tone }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b px-4 py-3"><h3 className="font-semibold">{title}</h3><Badge tone={tone}>{rows.length}</Badge><span className="text-xs text-muted-foreground">{sub}</span></header>
      <ul className="max-h-[32rem] divide-y overflow-y-auto">
        {rows.map((r) => (
          <li key={r.name} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm", r.late && "bg-red-500/[0.05]")}>
            <Plate no={r.vehicle_no} /><span className="text-xs text-muted-foreground">{r.vehicle_type}{r.lane ? ` · ${r.lane}` : ""}</span>
            <span className="min-w-0 flex-1 truncate">{r.grower_name} <span className="text-muted-foreground">· {r.point_name || r.source}</span></span>
            {r.gross_kg ? <span className="tabular-nums text-xs">{num(r.gross_kg)} kg</span> : null}
            <span title={`since ${fmt(r.gross_at || r.issued_at)}`} className={cn("tabular-nums text-xs font-semibold", r.late ? "text-red-600" : r.minutes > 120 ? "text-amber-600" : "text-muted-foreground")}><Clock className="mr-1 inline size-3" />{mins(r.minutes)}</span>
            <Link to={`/procurement/d/cane-token/${r.name}`} className="font-mono text-xs text-primary hover:underline">{r.name}</Link>
          </li>
        ))}
        {!rows.length && <li className="p-6 text-center text-sm text-muted-foreground">None.</li>}
      </ul>
    </section>
  );
}

export function YardPage() {
  const { data } = useQuery({ queryKey: ["sc-proc-yard"], queryFn: () => get<Yard>(`${API}.yard`), refetchInterval: 15_000 });
  if (!data) return <div className="grid gap-4 p-6 md:grid-cols-2"><Skeleton className="h-96 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div>;
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="Yard board" sub="Vehicles inside the mill: waiting for the gross weight, and unloading / waiting for the tare. Refreshes every 15 s.">
        <NavBtn to="/procurement/gate" icon={Ticket}>Gate</NavBtn><NavBtn to="/procurement/weighbridge" icon={Scale}>Weighbridge</NavBtn>
      </Header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard icon={Ticket} label="Waiting for gross" value={num(data.waiting_gross.length)} color={C.blue} sub="token issued" />
        <KpiCard icon={Warehouse} label="Waiting for tare" value={num(data.waiting_tare.length)} color={C.amber} sub={`${num(data.cane_in_yard_kg / 40)} md of cane (gross)`} />
        <KpiCard icon={CheckCircle2} label="Done today" value={num(data.done_today)} color={C.green} sub={`avg ${mins(data.avg_yard_min)} gross → tare`} />
        <KpiCard icon={AlertTriangle} label={`Inside > ${data.max_yard_hours} h`} value={num(data.late)} color={data.late ? C.red : C.slate} sub="since the token" />
        <KpiCard icon={Truck} label="By lane" value={data.lanes.map((l) => l.count).join(" · ") || "0"} color={C.violet} sub={data.lanes.map((l) => l.lane).join(" · ")} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <YardList title="Waiting for gross" sub="time since the token" rows={data.waiting_gross} tone="blue" />
        <YardList title="Waiting for tare" sub="time since the gross weight" rows={data.waiting_tare} tone="amber" />
      </div>
    </div>
  );
}

// =============================================================== cash counter
interface Bilty { name: string; status: string; cpr: string; token: string; crushing_day: string; grower_name: string; point_name?: string; source: string; vehicle_no: string; vehicle_type: string; driver_name?: string; driver_cnic?: string; payable_maund: number; tpt_rate: number; amount: number; paid_at?: string; received_by?: string }
interface Counter { rows: Bilty[]; paid_today: { n: number; amt: number }; paid_by_me: { n: number; amt: number }; unpaid: { n: number; amt: number }; can_pay: boolean; can_reverse: boolean }

function PayDialog({ b, onDone, onClose }: { b: Bilty; onDone: () => void; onClose: () => void }) {
  const [who, setWho] = useState({ received_by: b.driver_name ?? "", received_by_cnic: b.driver_cnic ?? "" });
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-2xl border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Pay bilty {b.name}</h3>
        <div className="rounded-xl bg-muted/40 p-3 text-center"><div className="text-3xl font-black tabular-nums">{money(b.amount)}</div>
          <div className="text-xs text-muted-foreground">{md(b.payable_maund)} md × Rs {b.tpt_rate} · <Plate no={b.vehicle_no} /></div></div>
        <label className="block text-xs font-medium text-muted-foreground">Paid to<Input value={who.received_by} onChange={(e) => setWho({ ...who, received_by: e.target.value })} className="mt-1" /></label>
        <label className="block text-xs font-medium text-muted-foreground">CNIC (check the card)<Input value={who.received_by_cnic} onChange={(e) => setWho({ ...who, received_by_cnic: e.target.value })} className="mt-1" /></label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={busy || !who.received_by.trim()} onClick={async () => {
            setBusy(true);
            try { await post(`${API}.pay`, { name: b.name, ...who }); toast.success(`Paid ${money(b.amount)}`); printSlip("bilty", b.name); onDone(); } catch (e) { toast.error(err(e)); } finally { setBusy(false); }
          }}><Banknote />{busy ? "Paying…" : "Pay cash & print"}</Button>
        </div>
      </div>
    </div>
  );
}

export function CounterPage() {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState("Unpaid");
  const [paying, setPaying] = useState<Bilty | null>(null);
  const { data, refetch } = useQuery({ queryKey: ["sc-proc-bilties", q, status], queryFn: () => get<Counter>(`${API}.bilties`, { q, status }), refetchInterval: 30_000 });
  const reverse = async (b: Bilty) => {
    const reason = window.prompt(`Reverse the payment of ${b.name}? Give the reason:`);
    if (!reason) return;
    try { await post(`${API}.reverse`, { name: b.name, reason }); toast.success("Payment reversed"); refetch(); } catch (e) { toast.error(err(e)); }
  };
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="TPT cash counter" sub="Drivers are paid their carriage (TPT) against the bilty printed with the CPR. Each payment posts Dr TPT-Bilty Payable / Cr Cash Counter - Cane." />
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard icon={Hourglass} label="Unpaid bilties" value={money(data?.unpaid.amt ?? 0)} color={C.amber} sub={`${num(data?.unpaid.n)} bilties`} />
        <KpiCard icon={Wallet} label="Paid today (counter)" value={money(data?.paid_today.amt ?? 0)} color={C.green} sub={`${num(data?.paid_today.n)} bilties`} />
        <KpiCard icon={Banknote} label="Paid today by me" value={money(data?.paid_by_me.amt ?? 0)} color={C.teal} sub={`${num(data?.paid_by_me.n)} bilties — count your cash`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {[["Unpaid", "Unpaid"], ["Paid", "Paid"], ["", "All"]].map(([s, l]) => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", status === s ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground")}>{l}</button>
        ))}
        <div className="relative ml-auto"><ScanBarcode className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Scan bilty / CPR, vehicle no., driver CNIC…" className="h-10 w-80 pl-8 font-mono" /></div>
      </div>
      <ChartCard title="Bilties" bodyClass="h-auto">
        <DataTable rows={data?.rows ?? []} rowKey={(r) => r.name} dense cols={[
          { key: "name", label: "Bilty", value: (r) => r.name, render: (r) => <span className="font-mono text-xs font-semibold">{r.name}</span> },
          { key: "day", label: "Day", value: (r) => r.crushing_day, render: (r) => dayLabel(r.crushing_day) },
          { key: "vehicle", label: "Vehicle", value: (r) => r.vehicle_no, render: (r) => <Plate no={r.vehicle_no} /> },
          { key: "driver", label: "Driver", value: (r) => r.driver_name ?? "", render: (r) => <>{r.driver_name ?? "—"}<div className="text-[11px] text-muted-foreground">{r.driver_cnic}</div></> },
          { key: "from", label: "From", value: (r) => r.point_name || r.source },
          { key: "cpr", label: "CPR", value: (r) => r.cpr, render: (r) => <span className="font-mono text-xs">{r.cpr}</span> },
          { key: "amount", label: "Amount", align: "right", value: (r) => r.amount, render: (r) => <b>{money(r.amount)}</b> },
          { key: "status", label: "", value: (r) => r.status, render: (r) => (
            <div className="flex items-center justify-end gap-2">
              {r.status === "Unpaid" && data?.can_pay && <Button size="sm" onClick={() => setPaying(r)}><Banknote />Pay</Button>}
              {r.status === "Paid" && <Badge tone="green" title={`${r.received_by ?? ""} ${fmt(r.paid_at)}`}>Paid {fmt(r.paid_at)}</Badge>}
              {r.status === "Paid" && data?.can_reverse && <button type="button" title="Reverse payment" onClick={() => reverse(r)} className="text-muted-foreground hover:text-red-600"><RotateCcw className="size-4" /></button>}
              <button type="button" title="Print bilty" onClick={() => printSlip("bilty", r.name)} className="text-muted-foreground hover:text-foreground"><Printer className="size-4" /></button>
            </div>) },
        ]} />
      </ChartCard>
      {paying && <PayDialog b={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); refetch(); }} />}
    </div>
  );
}

// =============================================================== day close
interface DayRow { day: string; cprs: number; kg: number; maund: number; govt_value: number; tpt: number; payable: number; open_cprs: number; current: boolean; open_tokens: number;
  dcp?: { name: string; docstatus: number; status: string; purchase_invoice?: string; reconciled: number; note?: string } | null }
interface Check { key: string; label: string; ledger: number; expected: number; difference: number; ok: boolean; hint: string }

export function DayClosePage() {
  const { data, refetch } = useQuery({ queryKey: ["sc-proc-days"], queryFn: () => get<{ rows: DayRow[]; current_day: string; can_close: boolean }>(`${API}.days`) });
  const { data: checks, refetch: reChecks } = useQuery({ queryKey: ["sc-proc-checks"], queryFn: () => get<{ checks: Check[] }>(`${API}.day_checks`) });
  const [busy, setBusy] = useState("");
  const close = async (r: DayRow) => {
    const force = r.current;
    if (force && !window.confirm(`Crushing day ${dayLabel(r.day)} is still running. Close it now anyway (Cane Admin only)?`)) return;
    setBusy(r.day);
    try {
      const d = await post<{ name: string; purchase_invoice: string; reconciled: number }>(`${API}.close_day`, { day: r.day, force: force ? 1 : 0 });
      toast.success(`${d.name}: invoice ${d.purchase_invoice}${d.reconciled ? ", reconciled" : ""}`);
      refetch(); reChecks();
    } catch (e) { toast.error(err(e)); } finally { setBusy(""); }
  };
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="Day close" sub="One Purchase Invoice per crushing day (07:00 → 07:00) brings the day's cane into the Cane Yard; the day's CPR journals are reconciled against it so Cane Purchase Clearing returns to 0." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {checks?.checks.map((c) => (
          <div key={c.key} className={cn("rounded-2xl border bg-card p-4 shadow-sm", !c.ok && "border-red-500/40")}>
            <div className="flex items-center gap-2 text-sm font-semibold">{c.ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-red-600" />}{c.label}</div>
            <div className="mt-2 text-xl font-bold tabular-nums">{money(c.ledger)}</div>
            <div className="text-xs text-muted-foreground">{c.hint}{c.key !== "clearing" && <> · {money(c.expected)}</>}</div>
            {!c.ok && <div className="mt-1 text-xs font-semibold text-red-600">difference {money(c.difference)}</div>}
          </div>
        ))}
      </div>
      <ChartCard title="Crushing days" bodyClass="h-auto">
        <DataTable rows={data?.rows ?? []} rowKey={(r) => r.day} dense cols={[
          { key: "day", label: "Day", value: (r) => r.day, render: (r) => <b>{dayLabel(r.day)}{r.current && !r.dcp && <Badge tone="blue" className="ml-2">running</Badge>}</b> },
          { key: "cprs", label: "CPRs", align: "right", value: (r) => r.cprs },
          { key: "maund", label: "Maund", align: "right", value: (r) => r.maund, render: (r) => md(r.maund) },
          { key: "govt", label: "Govt value (invoice)", align: "right", value: (r) => r.govt_value, render: (r) => money(r.govt_value) },
          { key: "tpt", label: "TPT", align: "right", value: (r) => r.tpt, render: (r) => money(r.tpt) },
          { key: "payable", label: "Payable", align: "right", value: (r) => r.payable, render: (r) => money(r.payable) },
          { key: "open", label: "In yard", align: "right", value: (r) => r.open_tokens, render: (r) => (r.open_tokens ? <span className="text-amber-600">{r.open_tokens}</span> : "—") },
          { key: "dcp", label: "Status", value: (r) => r.dcp?.status ?? "Open", render: (r) => r.dcp?.docstatus === 1
            ? <span className="flex flex-wrap items-center gap-1"><Badge tone="green">Invoiced</Badge><Link className="font-mono text-xs text-primary hover:underline" to={`/procurement/d/daily-cane-purchase/${r.dcp.name}`}>{r.dcp.purchase_invoice}</Link>{r.dcp.reconciled ? <Badge tone="green">reconciled</Badge> : <Badge tone="red">not reconciled</Badge>}</span>
            : data?.can_close ? <Button size="sm" variant={r.current ? "outline" : "default"} disabled={!!busy} onClick={() => close(r)}><ClipboardCheck />{busy === r.day ? "Closing…" : r.current ? "Close early" : "Close day"}</Button>
              : <Badge tone="amber">Open</Badge> },
        ]} />
      </ChartCard>
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Timer className="size-3.5" />With Sugar Settings → "Close the crushing day automatically", the scheduler closes yesterday at 07:15.</p>
    </div>
  );
}
