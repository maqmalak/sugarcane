/**
 * ELP comparison: the loading-point snapshots beside the gate snapshots (same view on the same row), registration vs
 * arrival details as on the verification report, where the load started (map), gate photo capture (camera / file),
 * and the audit team's Accept / Reject plus the verification report PDF.
 * Used on the Gate & Verification page and on the LP Vehicle Registration form.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import maplibregl from "maplibre-gl";
import { Camera, CheckCircle2, Clock, FileText, Loader2, MapPin, Upload, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/sc/components/ui/button";
import { Input, Select } from "@/sc/components/ui/input";
import { get, post, postDownload } from "@/sc/lib/api";
import { baseStyle } from "@/sc/lib/map";
import { cn } from "@/sc/lib/utils";

export interface ElpPhoto { stage: string; view: string; url?: string | null; sharpness?: number; quality_ok?: number; latitude?: number | null; longitude?: number | null; taken_at?: string | null }
export interface ElpLookup {
  found: boolean; q?: string;
  registration?: Record<string, string | number | null | boolean> & { name: string; status: string; vehicle_no: string; overdue?: boolean };
  indent?: { name: string; status: string; valid_from: string; valid_to: string; load_maund: number; village_name?: string } | null;
  photos?: ElpPhoto[]; grower_photo?: string | null; can_arrive?: boolean; can_decide?: boolean; standard_minutes?: number | null; views?: string[];
}

export const ELP_TONE: Record<string, string> = {
  "In Transit": "bg-sky-500/15 text-sky-700 dark:text-sky-300", Arrived: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  Accepted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", Rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
  Cancelled: "bg-zinc-500/15 text-zinc-500",
};
export const elpLabel = (s: string) => (s === "Arrived" ? "Pending verification" : s);
export function ElpStatus({ status, overdue }: { status: string; overdue?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", ELP_TONE[status] ?? ELP_TONE.Cancelled)}>{elpLabel(status)}</span>
      {overdue && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-600">Overdue</span>}
    </span>
  );
}

const fmt = (s?: unknown) => (s ? new Date(String(s).replace(" ", "T")).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const gps = (a?: unknown, b?: unknown) => (a && b ? `${Number(a).toFixed(6)}, ${Number(b).toFixed(6)}` : "—");
const toBase64 = (f: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(f); });

/** Downscale a camera photo before upload (phones send 4000-px images). */
async function shrink(file: File, max = 1600): Promise<Blob> {
  const img = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.85));
}

function Photo({ p, empty }: { p?: ElpPhoto; empty: string }) {
  if (!p?.url) return <div className="grid aspect-[4/3] place-items-center rounded-xl border border-dashed text-xs text-muted-foreground">{empty}</div>;
  return (
    <a href={p.url} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-xl border bg-muted">
      <img src={p.url} alt={p.view} className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-5 text-[10px] text-white">
        {fmt(p.taken_at)} · {gps(p.latitude, p.longitude)} · sharp {Math.round(Number(p.sharpness ?? 0))}
      </span>
    </a>
  );
}

function StartMap({ reg, mill }: { reg: NonNullable<ElpLookup["registration"]>; mill?: { lat?: number; lng?: number } }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current || !reg.latitude) return;
    const start: [number, number] = [Number(reg.longitude), Number(reg.latitude)];
    const pts: { c: [number, number]; kind: string; label: string }[] = [{ c: start, kind: "start", label: `Registered here · ${reg.point_name}` }];
    if (reg.point_latitude) pts.push({ c: [Number(reg.point_longitude), Number(reg.point_latitude)], kind: "point", label: `${reg.point_name} (as per parameters)` });
    if (reg.arrival_latitude) pts.push({ c: [Number(reg.arrival_longitude), Number(reg.arrival_latitude)], kind: "arrival", label: "Arrival photos" });
    if (mill?.lat && mill.lng) pts.push({ c: [mill.lng, mill.lat], kind: "mill", label: "Mill" });
    const m = new maplibregl.Map({ container: box.current, style: baseStyle("satellite"), center: start, zoom: 13, attributionControl: { compact: true } });
    m.on("load", () => {
      m.addSource("p", { type: "geojson", data: { type: "FeatureCollection", features: pts.map((p) => ({ type: "Feature", properties: { kind: p.kind, label: p.label }, geometry: { type: "Point", coordinates: p.c } })) } });
      if (mill?.lat && mill.lng) {
        m.addSource("l", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [start, [mill.lng, mill.lat]] } } });
        m.addLayer({ id: "l", type: "line", source: "l", paint: { "line-color": "#fab005", "line-width": 2, "line-dasharray": [2, 2] } });
      }
      m.addLayer({ id: "p", type: "circle", source: "p", paint: {
        "circle-radius": ["match", ["get", "kind"], "mill", 9, "start", 8, 6],
        "circle-color": ["match", ["get", "kind"], "start", "#e8590c", "point", "#12b886", "arrival", "#7048e8", "#1c7ed6"],
        "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      const popup = new maplibregl.Popup({ closeButton: false });
      m.on("mousemove", "p", (e) => { const p = e.features?.[0]?.properties; if (p) popup.setLngLat(e.lngLat).setText(String(p.label)).addTo(m); });
      m.on("mouseleave", "p", () => popup.remove());
      if (pts.length > 1) {
        const xs = pts.map((p) => p.c[0]), ys = pts.map((p) => p.c[1]);
        m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 36, duration: 0, maxZoom: 15 });
      }
    });
    return () => m.remove();
  }, [reg, mill]);
  return reg.latitude ? (
    <div className="space-y-1">
      <div ref={box} className="h-56 w-full overflow-hidden rounded-xl border" />
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {[["#e8590c", "registered here"], ["#12b886", "point as configured"], ["#7048e8", "arrival photos"], ["#1c7ed6", "mill"]].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: c }} />{l}</span>))}
      </div>
    </div>
  ) : null;
}

export function ElpCompare({ name, onChange }: { name: string; onChange?: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["sc-elp-lookup", name], queryFn: () => get<ElpLookup>("sugarcane.api.v1.elp.lookup", { q: name }) });
  const { data: mill } = useQuery({ queryKey: ["sc-elp-mill"], queryFn: async () => (await get<{ mill: { lat: number; lng: number } }>("sugarcane.api.v1.elp.insights", { days: 1 })).mill, staleTime: 3600_000 });
  const [view, setView] = useState("Number Plate");
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const file = useRef<HTMLInputElement>(null);
  if (isLoading) return <div className="h-64 animate-pulse rounded-2xl border bg-muted/40" />;
  if (!data?.found || !data.registration) return <p className="rounded-xl border p-4 text-sm text-muted-foreground">No load {name}.</p>;
  const r = data.registration;
  const photos = data.photos ?? [];
  const lp = photos.filter((p) => p.stage === "Loading Point");
  const gate = photos.filter((p) => p.stage === "Gate");
  const views = [...new Set([...lp.map((p) => p.view), ...gate.map((p) => p.view)])];
  const refresh = async () => { await refetch(); void qc.invalidateQueries({ queryKey: ["sc-elp-board"] }); onChange?.(); };

  const upload = async (f: File) => {
    setBusy("photo");
    try {
      const out = await post<{ ok: boolean; problems?: string[]; sharpness: number }>("sugarcane.api.v1.elp.add_gate_photo", { name: r.name, view, data: await toBase64(await shrink(f)) });
      if (out.ok) toast.success(`${view} photo added (sharpness ${Math.round(out.sharpness)})`);
      else toast.error(`Photo refused: ${(out.problems ?? []).join(", ")} — retake it`);
      await refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); if (file.current) file.current.value = ""; }
  };
  const decide = async (accept: boolean) => {
    setBusy(accept ? "accept" : "reject");
    try {
      await post("sugarcane.api.v1.elp.decide", { name: r.name, accept: accept ? 1 : 0, reason });
      toast.success(accept ? "Load accepted — LP verified" : "Load rejected");
      setReason("");
      await refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const report = async () => {
    setBusy("report");
    try { await postDownload("sugarcane.api.v1.elp.verification_report", { name: r.name }, `Verification ${r.name}.pdf`); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const late = Number(r.late_minutes ?? 0);
  const rows: [string, string, string][] = [
    ["Registration / Serial", `${r.name} · ${r.serial_no ?? "—"}`, `${r.arrival_serial_no ?? "—"}`],
    ["Point", `${r.point_name}`, "Mill gate"],
    ["Date & time", fmt(r.registered_at), fmt(r.arrived_at)],
    ["GPS actual", gps(r.latitude, r.longitude), gps(r.arrival_latitude, r.arrival_longitude)],
    ["GPS as per parameters", gps(r.point_latitude, r.point_longitude), gps(mill?.lat, mill?.lng)],
    ["Distance / geofence", `${Math.round(Number(r.distance_from_point_m ?? 0))} m · ${r.inside_geofence ? "inside" : "outside"}`, "—"],
    ["Tower id", `${r.cell_id ?? "—"}`, `${r.arrival_cell_id ?? "—"}`],
    ["Journey", `standard ${data.standard_minutes || "—"} min · average ${r.average_minutes || "—"} min`, r.transit_minutes ? `${r.transit_minutes} min${late ? ` (${late} late)` : ""}` : "—"],
  ];

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-lg bg-zinc-900 px-3 py-1.5 font-mono text-lg font-bold tracking-wider text-yellow-300">{r.vehicle_no}</span>
        <div className="min-w-0">
          <div className="font-semibold">{r.grower_name ?? "—"} <span className="text-xs text-muted-foreground">{r.indent ? `· indent ${r.indent}` : ""}</span></div>
          <div className="text-xs text-muted-foreground">{r.point_name} · {r.vehicle_type ?? "—"} · driver {r.driver_name ?? "—"}</div>
        </div>
        <ElpStatus status={r.status} overdue={Boolean(r.overdue)} />
        {Boolean(r.lp_verified) && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">LP verified</span>}
        <Button variant="outline" className="ml-auto" onClick={() => void report()} disabled={busy === "report"}>
          {busy === "report" ? <Loader2 className="animate-spin" /> : <FileText />}Verification report</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="w-28 pb-2">View</th><th className="pb-2">At the loading point</th><th className="pb-2">At the mill gate</th></tr></thead>
          <tbody>
            {views.map((v) => (
              <tr key={v} className="align-top">
                <td className="py-1.5 pr-2 text-xs font-semibold">{v}</td>
                <td className="py-1.5 pr-2"><Photo p={lp.find((p) => p.view === v)} empty="not taken" /></td>
                <td className="py-1.5"><Photo p={gate.find((p) => p.view === v)} empty={r.status === "In Transit" ? "waiting for the gate" : "not taken"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <table className="w-full text-sm">
          <thead><tr className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-1.5"></th><th className="px-2 py-1.5">Registration</th><th className="px-2 py-1.5">Arrival</th></tr></thead>
          <tbody className="divide-y">{rows.map(([k, a, b]) => <tr key={k}><td className="px-2 py-1.5 text-xs text-muted-foreground">{k}</td><td className="px-2 py-1.5 text-xs">{a}</td><td className="px-2 py-1.5 text-xs">{b}</td></tr>)}</tbody>
        </table>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><MapPin className="size-3.5" />Where the load started, the point as configured, and the mill</div>
          <StartMap reg={r} mill={mill} />
        </div>
      </div>

      {(data.can_arrive || data.can_decide) && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/30 p-3">
          {data.can_arrive && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs"><span className="mb-1 block text-muted-foreground">Gate photo view</span>
                <Select value={view} onChange={(e) => setView(e.target.value)} className="h-9 w-40">
                  {[...new Set([...(data.views ?? []), "Number Plate", "Driver", "Body Left", "Body Right", "Front", "Load"])].map((v) => <option key={v}>{v}</option>)}
                </Select></label>
              <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
              <Button variant="outline" onClick={() => file.current?.click()} disabled={busy === "photo"}>
                {busy === "photo" ? <Loader2 className="animate-spin" /> : <Camera />}Take / upload gate photo</Button>
              {r.status === "In Transit" && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" />The first gate photo records the arrival</span>}
            </div>
          )}
          {data.can_decide && (
            <div className="ml-auto flex flex-wrap items-end gap-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required to reject)" className="h-9 w-64" />
              <Button variant="outline" className="border-red-500/40 text-red-600" onClick={() => void decide(false)} disabled={!!busy || !reason.trim()}>
                {busy === "reject" ? <Loader2 className="animate-spin" /> : <XCircle />}Reject</Button>
              <Button onClick={() => void decide(true)} disabled={!!busy}>{busy === "accept" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Accept — photos match</Button>
            </div>
          )}
        </div>
      )}
      {r.status === "Rejected" && r.reject_reason && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">Rejected: {String(r.reject_reason)}</p>}
      {!data.can_arrive && !data.can_decide && r.status === "In Transit" && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Upload className="size-3.5" />Gate staff record the arrival with gate photos; the audit team then accepts or rejects.</p>}
    </section>
  );
}
