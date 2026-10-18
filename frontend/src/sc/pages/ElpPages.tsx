/**
 * ELP — Electronic Loading Point (React):
 * - ElpDashboardPage (/elp): vehicles on the way, pending registrations / arrivals / verifications, overdue and not-arrived,
 *   trend, per-point table and the map of loading points with the loads on the road.
 * - ElpBoardPage (/elp/board?status=): the working lists (pending arrival, overdue, pending verification, accepted, rejected).
 * - ElpGatePage (/elp/gate?no=): scan or type the indent / vehicle / registration number → compare and decide.
 * Data: sugarcane.api.v1.elp (insights, board, lookup).
 */
import { useQuery } from "@tanstack/react-query";
import maplibregl from "maplibre-gl";
import { AlertTriangle, CheckCircle2, ClipboardList, Hourglass, ScanBarcode, Search, ShieldCheck, Timer, Truck, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, ChartCard, ChartTip, DataTable, Highlights, KpiCard, Segmented, useChartTheme, type Highlight } from "@/sc/components/analytics/kit";
import { ElpCompare, ElpStatus } from "@/sc/components/ElpCompare";
import { Button } from "@/sc/components/ui/button";
import { Input } from "@/sc/components/ui/input";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get } from "@/sc/lib/api";
import { num } from "@/sc/lib/format";
import { baseStyle } from "@/sc/lib/map";
import { cn } from "@/sc/lib/utils";
import { useTheme } from "@/sc/providers/theme";

interface Insights {
  days: number; mill: { lat: number; lng: number }; pending_registrations: number; not_arrived: number; not_arrived_hours: number;
  on_road: { name: string; vehicle_no: string; point: string; overdue: boolean; lat: number; lng: number; expected: string }[];
  pins: { type: string; name: string; title: string; lat: number; lng: number; journey_min?: number }[];
  kpis: { registered: number; in_transit: number; arrived: number; accepted: number; rejected: number; overdue: number; avg_transit: number };
  trend: Record<string, number | string>[]; points: { name: string; registered: number; accepted: number; rejected: number; in_transit: number; overdue: number; avg_transit?: number | null }[];
  reasons: { name: string; value: number }[]; highlights: Highlight[];
}
interface BoardRow { name: string; status: string; point_name: string; vehicle_no: string; grower_name?: string; indent?: string; registered_at: string; expected_arrival?: string; arrived_at?: string; overdue?: boolean; late_minutes?: number; transit_minutes?: number; reject_reason?: string; minutes_to_expected?: number }

const fmt = (s?: string) => (s ? new Date(s.replace(" ", "T")).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const dayLabel = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function Header({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-600"><Truck className="size-4" />ELP · Electronic Loading Point</div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function RoadMap({ data }: { data: Insights }) {
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!box.current) return;
    const m = new maplibregl.Map({ container: box.current, style: baseStyle("satellite"), center: [data.mill.lng || 72.67, data.mill.lat || 32.08], zoom: 8, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      const mill: [number, number] = [data.mill.lng, data.mill.lat];
      m.addSource("lines", { type: "geojson", data: { type: "FeatureCollection", features: data.on_road.filter((r) => r.lat).map((r) => ({ type: "Feature", properties: { overdue: r.overdue ? 1 : 0 }, geometry: { type: "LineString", coordinates: [[r.lng, r.lat], mill] } })) } });
      m.addLayer({ id: "lines", type: "line", source: "lines", paint: { "line-color": ["case", ["==", ["get", "overdue"], 1], "#fa5252", "#fab005"], "line-width": 1.6, "line-dasharray": [2, 2], "line-opacity": 0.8 } });
      m.addSource("pins", { type: "geojson", data: { type: "FeatureCollection", features: data.pins.map((p) => ({ type: "Feature", properties: { title: p.title, kind: p.type, journey: p.journey_min ?? null }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })) } });
      m.addLayer({ id: "pins", type: "circle", source: "pins", paint: { "circle-radius": 6, "circle-color": ["match", ["get", "kind"], "Cane Depot", "#ae3ec9", "#12b886"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      m.addSource("road", { type: "geojson", data: { type: "FeatureCollection", features: data.on_road.filter((r) => r.lat).map((r) => ({ type: "Feature", properties: { name: r.name, v: r.vehicle_no, point: r.point, overdue: r.overdue ? 1 : 0 }, geometry: { type: "Point", coordinates: [r.lng, r.lat] } })) } });
      m.addLayer({ id: "road", type: "circle", source: "road", paint: { "circle-radius": 5, "circle-color": ["case", ["==", ["get", "overdue"], 1], "#fa5252", "#fab005"], "circle-stroke-color": "#111", "circle-stroke-width": 1 } });
      if (data.mill.lat) new maplibregl.Marker({ color: "#1c7ed6" }).setLngLat(mill).setPopup(new maplibregl.Popup().setText("Mill")).addTo(m);
      const pts = [...data.pins.map((p) => [p.lng, p.lat]), ...(data.mill.lat ? [mill] : [])] as [number, number][];
      if (pts.length > 1) m.fitBounds([[Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))], [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]], { padding: 40, duration: 0 });
    });
    const popup = new maplibregl.Popup({ closeButton: false });
    m.on("mousemove", "pins", (e) => { const p = e.features?.[0]?.properties; if (p) popup.setLngLat(e.lngLat).setHTML(`<b>${p.title}</b><br/>${p.kind}${p.journey ? ` · ${p.journey} min to mill` : ""}`).addTo(m); });
    m.on("mouseleave", "pins", () => popup.remove());
    m.on("click", "road", (e) => { const n = e.features?.[0]?.properties?.name; if (n) navigate(`/elp/gate?no=${encodeURIComponent(n)}`); });
    m.on("mouseenter", "road", () => { m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", "road", () => { m.getCanvas().style.cursor = ""; });
    return () => m.remove();
  }, [data, navigate]);
  return <div ref={box} className="h-[22rem] w-full" />;
}

export function ElpDashboardPage() {
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const [days, setDays] = useState<"1" | "7" | "30">("7");
  const { data } = useQuery({ queryKey: ["sc-elp-insights", days], queryFn: () => get<Insights>("sugarcane.api.v1.elp.insights", { days }), refetchInterval: 60_000 });
  if (!data) return <div className="grid gap-4 p-6 md:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>;
  const k = data.kpis;
  const trend = data.trend.map((d) => ({ ...d, label: dayLabel(String(d.date)) }));
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Header title="ELP dashboard" sub="Vehicles registered at loading points and depots, on the way, at the gate and verified by the audit team">
        <Segmented value={days} onChange={setDays} options={[["1", "Today"], ["7", "7 days"], ["30", "30 days"]]} />
        <Link to="/elp/gate" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow"><ScanBarcode className="size-4" />Gate & verification</Link>
      </Header>
      <Highlights items={data.highlights} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard icon={ClipboardList} label="Pending registration" value={num(data.pending_registrations)} color={C.slate} sub="indents valid today, no vehicle yet" />
        <KpiCard icon={Truck} label="On the way" value={num(k.in_transit)} color={C.amber} sub="pending arrival" to="/elp/board?status=Pending" />
        <KpiCard icon={Hourglass} label="Pending verification" value={num(k.arrived)} color={C.violet} sub="arrived, waiting for audit" to="/elp/board?status=Arrived" />
        <KpiCard icon={AlertTriangle} label="Overdue" value={num(k.overdue)} color={k.overdue ? C.red : C.slate} sub={`${num(data.not_arrived)} not arrived after ${data.not_arrived_hours} h`} to="/elp/board?status=Overdue" />
        <KpiCard icon={CheckCircle2} label="Accepted" value={num(k.accepted)} color={C.green} sub="LP verified" to="/elp/board?status=Accepted" />
        <KpiCard icon={XCircle} label="Rejected" value={num(k.rejected)} color={C.red} sub={`avg journey ${k.avg_transit} min`} to="/elp/board?status=Rejected" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm xl:col-span-2">
          <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
            <h3 className="font-semibold">On the road</h3>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><span className="size-2.5 rounded-full bg-[#12b886]" />loading point</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><span className="size-2.5 rounded-full bg-[#ae3ec9]" />depot</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><span className="size-2.5 rounded-full bg-[#fab005]" />vehicle (start)</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><span className="size-2.5 rounded-full bg-[#fa5252]" />overdue</span>
          </header>
          <RoadMap data={data} />
        </section>
        <ChartCard title="Loads per day" sub="By what happened to them">
          <ResponsiveContainer>
            <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: t.axis, fontSize: 11 }} />
              <YAxis tick={{ fill: t.axis, fontSize: 11 }} width={32} allowDecimals={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="Accepted" stackId="a" fill={C.green} />
              <Bar dataKey="Rejected" stackId="a" fill={C.red} />
              <Bar dataKey="Arrived" name="Pending verification" stackId="a" fill={C.violet} />
              <Bar dataKey="In Transit" name="On the way" stackId="a" fill={C.amber} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <ChartCard title="Loading points" sub="Loads and journey times per point" bodyClass="h-auto" className="w-full">
        <DataTable rows={data.points} rowKey={(r) => r.name} initialSort={{ key: "registered", dir: "desc" }} cols={[
          { key: "name", label: "Point", value: (r) => r.name, render: (r) => <span className="font-semibold">{r.name}</span> },
          { key: "registered", label: "Registered", align: "right", value: (r) => r.registered },
          { key: "in_transit", label: "On the way", align: "right", value: (r) => r.in_transit },
          { key: "accepted", label: "Accepted", align: "right", value: (r) => r.accepted },
          { key: "rejected", label: "Rejected", align: "right", value: (r) => r.rejected, render: (r) => r.rejected ? <span className="font-semibold text-red-600">{r.rejected}</span> : "—" },
          { key: "overdue", label: "Overdue", align: "right", value: (r) => r.overdue, render: (r) => r.overdue ? <span className="font-semibold text-red-600">{r.overdue}</span> : "—" },
          { key: "avg", label: "Avg journey", align: "right", value: (r) => r.avg_transit ?? 0, render: (r) => r.avg_transit ? `${r.avg_transit} min` : "—" },
        ]} />
      </ChartCard>
      {data.reasons.length > 0 && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="font-semibold">Why loads were rejected</h3>
          <ul className="mt-2 space-y-1 text-sm">{data.reasons.map((r) => <li key={r.name} className="flex justify-between gap-3"><span>{r.name}</span><b>{r.value}</b></li>)}</ul>
        </section>
      )}
    </div>
  );
}

const TABS: [string, string][] = [["Pending", "Pending arrival"], ["Overdue", "Overdue"], ["Arrived", "Pending verification"], ["Accepted", "Accepted"], ["Rejected", "Rejected"], ["Cancelled", "Cancelled"], ["", "All"]];

export function ElpBoardPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "Pending";
  const [q, setQ] = useState("");
  const [days, setDays] = useState("7");
  const { data, isLoading } = useQuery({ queryKey: ["sc-elp-board", status, days, q], queryFn: () => get<{ rows: BoardRow[]; counts: Record<string, number> }>("sugarcane.api.v1.elp.board", { status, days, q }), refetchInterval: 60_000 });
  const count = (s: string) => (s === "Pending" ? data?.counts["In Transit"] : s === "" ? Object.entries(data?.counts ?? {}).filter(([k]) => k !== "Overdue").reduce((a, [, v]) => a + v, 0) : data?.counts[s]) ?? 0;
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Header title="Loads" sub="Pending arrival, overdue, pending verification and decided loads" />
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(([s, label]) => (
          <button key={s} type="button" onClick={() => setParams(s ? { status: s } : { status: "" })}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium", status === s ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
            {label} · {count(s)}
          </button>
        ))}
        <div className="relative ml-auto"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vehicle, indent, grower…" className="h-9 w-56 pl-8" /></div>
        <select value={days} onChange={(e) => setDays(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm">
          {[["2", "2 days"], ["7", "7 days"], ["30", "30 days"], ["120", "Season"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">Vehicle</th><th className="px-3 py-2 text-left">Point</th><th className="px-3 py-2 text-left">Grower / indent</th>
              <th className="px-3 py-2 text-left">Registered</th><th className="px-3 py-2 text-left">Expected / arrived</th><th className="px-3 py-2 text-right">Journey</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
            <tbody className="divide-y">
              {isLoading && <tr><td colSpan={7} className="p-4"><Skeleton className="h-6" /></td></tr>}
              {data?.rows.map((r) => (
                <tr key={r.name} className={cn("cursor-pointer hover:bg-muted/30", r.overdue && "bg-red-500/[0.04]")} onClick={() => navigate(`/elp/gate?no=${encodeURIComponent(r.name)}`)}>
                  <td className="px-3 py-2"><span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-xs font-bold text-yellow-300">{r.vehicle_no}</span><div className="mt-0.5 text-[11px] text-muted-foreground">{r.name}</div></td>
                  <td className="px-3 py-2">{r.point_name}</td>
                  <td className="px-3 py-2">{r.grower_name ?? "—"}<div className="text-[11px] text-muted-foreground">{r.indent ?? ""}</div></td>
                  <td className="px-3 py-2 text-xs">{fmt(r.registered_at)}</td>
                  <td className="px-3 py-2 text-xs">{r.arrived_at ? fmt(r.arrived_at) : <>{fmt(r.expected_arrival)}{r.minutes_to_expected !== undefined && r.minutes_to_expected !== null && <span className={cn("ml-1", r.minutes_to_expected < 0 ? "text-red-600" : "text-muted-foreground")}>({r.minutes_to_expected < 0 ? `${-r.minutes_to_expected} min late` : `in ${r.minutes_to_expected} min`})</span>}</>}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{r.transit_minutes ? `${r.transit_minutes} min` : "—"}{r.late_minutes ? <div className="text-red-600">+{r.late_minutes}</div> : null}</td>
                  <td className="px-3 py-2"><ElpStatus status={r.status} overdue={r.overdue} />{r.reject_reason && <div className="mt-0.5 max-w-[16rem] truncate text-[11px] text-red-600" title={r.reject_reason}>{r.reject_reason}</div>}</td>
                </tr>
              ))}
              {!isLoading && !data?.rows.length && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nothing here.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function ElpGatePage() {
  const [params, setParams] = useSearchParams();
  const no = params.get("no") ?? "";
  const [text, setText] = useState("");
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => box.current?.focus(), [no]);
  const { data, isFetching } = useQuery({ queryKey: ["sc-elp-gate", no], queryFn: () => get<{ found: boolean; registration?: { name: string } }>("sugarcane.api.v1.elp.lookup", { q: no }), enabled: !!no });
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <Header title="Gate & verification" sub="Scan the indent or type the vehicle / registration number; take the gate photos; the audit team compares and decides">
        <Link to="/elp/board?status=Arrived" className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:bg-accent"><ShieldCheck className="size-4" />Pending verification</Link>
        <Link to="/elp/board?status=Pending" className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:bg-accent"><Timer className="size-4" />On the way</Link>
      </Header>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { setParams({ no: text.trim().toUpperCase() }); setText(""); } }}>
        <div className="relative flex-1"><ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input ref={box} value={text} onChange={(e) => setText(e.target.value)} placeholder="Indent no. (scan), vehicle no. or ELP-… registration" className="h-12 pl-10 font-mono text-lg" /></div>
        <Button type="submit" className="h-12 px-5"><Search />Find</Button>
      </form>
      {isFetching && <div className="h-64 animate-pulse rounded-2xl border bg-muted/40" />}
      {!isFetching && data && !data.found && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">No load registered at a loading point matches <b className="font-mono">{no}</b>. The vehicle may not have been registered — check with the loading point.</p>}
      {!isFetching && data?.found && data.registration && <ElpCompare name={data.registration.name} />}
    </div>
  );
}
