/**
 * Capture a pin or a boundary — ported from the real-estate app's LocationCapture.
 * Pin: drop it on the satellite map, take it from the phone's GPS (readings averaged), or paste a Google Maps link /
 * "lat, lng" / DMS text. Boundary: tap the corners on the map or walk them with GPS; the area shows in acres / kanal.
 * The parent's boundary (dashed yellow) and neighbouring features (white) are drawn for orientation.
 */
import type { FeatureCollection, Geometry } from "geojson";
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import { Check, ClipboardPaste, Copy, Crosshair, ExternalLink, Layers, Locate, MapPin, Navigation, Pentagon, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { areaM2, baseStyle, boundsOf, emptyFC, fmtAcres, m2ToAcres, parseCoordinates, toGeometries, type BaseLayer, type LngLat } from "@/sc/lib/map";
import { cn } from "@/sc/lib/utils";

type Shape = "Point" | "Polygon";
const fmt = (v: number) => v.toFixed(6);
const centroid = (pts: LngLat[]): LngLat => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

function toGeometry(shape: Shape, pts: LngLat[]): Geometry | null {
  if (!pts.length) return null;
  if (shape === "Point") return { type: "Point", coordinates: pts[pts.length - 1] };
  return pts.length >= 3 ? { type: "Polygon", coordinates: [[...pts, pts[0]]] } : null;
}

function ringOf(raw: unknown): LngLat[] {
  const g = toGeometries(raw).find((x) => x.type === "Polygon" || x.type === "MultiPolygon");
  if (!g) return [];
  const ring = (g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : []) as LngLat[];
  const closed = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  return closed ? ring.slice(0, -1) : ring;
}

// ------------------------------------------------------------------ GPS
interface Fix { lng: number; lat: number; accuracy: number; n: number }
/** Watch the GPS for a few seconds and average the good readings (accuracy ≤ 2 × the best). */
function useGps() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const watch = useRef<number | null>(null);
  const stop = () => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setBusy(false);
  };
  useEffect(() => stop, []);
  const start = (seconds = 8) => new Promise<Fix | null>((resolve) => {
    if (!("geolocation" in navigator)) { setErr("This device has no GPS / location service."); resolve(null); return; }
    if (!window.isSecureContext) { setErr("Location needs a secure (https) connection."); resolve(null); return; }
    setErr(null); setBusy(true); setFix(null);
    const reads: GeolocationCoordinates[] = [];
    const finish = () => {
      stop();
      if (!reads.length) { resolve(null); return; }
      const best = Math.min(...reads.map((r) => r.accuracy));
      const good = reads.filter((r) => r.accuracy <= best * 2);
      const f = { lng: good.reduce((a, r) => a + r.longitude, 0) / good.length, lat: good.reduce((a, r) => a + r.latitude, 0) / good.length, accuracy: best, n: good.length };
      setFix(f); resolve(f);
    };
    watch.current = navigator.geolocation.watchPosition(
      (p) => { reads.push(p.coords); const best = Math.min(...reads.map((r) => r.accuracy)); setFix({ lng: p.coords.longitude, lat: p.coords.latitude, accuracy: best, n: reads.length }); },
      (e) => { setErr(e.code === 1 ? "Location permission was denied — allow it in the browser to use GPS." : e.message); stop(); resolve(null); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: seconds * 1000 },
    );
    setTimeout(finish, seconds * 1000);
  });
  return { fix, busy, err, start, stop };
}

export interface CaptureResult { point: LngLat | null; geometry: Geometry | null }

export function LocationCapture({ mode, initialPoint, initialGeometry, parent, context, readOnly, title, busy, onApply }: {
  mode: "point" | "shape";
  initialPoint?: LngLat | null;
  initialGeometry?: unknown;
  parent?: FeatureCollection | null;
  context?: FeatureCollection | null;
  readOnly?: boolean;
  title?: string;
  busy?: boolean;
  onApply: (r: CaptureResult) => void;
}) {
  const shape: Shape = mode === "point" ? "Point" : "Polygon";
  const start = useMemo<LngLat[]>(() => (mode === "shape" ? ringOf(initialGeometry) : initialPoint ? [initialPoint] : []),
    [mode, initialGeometry, initialPoint]);
  const [pts, setPts] = useState<LngLat[]>(start);
  useEffect(() => setPts(start), [start]);
  const [tab, setTab] = useState<"map" | "gps" | "paste">("map");
  const [pasted, setPasted] = useState("");
  const gps = useGps();
  const parsed = pasted ? parseCoordinates(pasted) : null;
  const point = shape === "Point";
  const current: LngLat | null = point ? pts[pts.length - 1] ?? null : pts.length ? centroid(pts) : null;
  const acres = !point ? m2ToAcres(areaM2(pts)) : 0;

  const add = (p: LngLat) => setPts((prev) => (point ? [p] : [...prev, p]));
  const apply = () => {
    const g = toGeometry(shape, pts);
    if (!g) { toast.error(point ? "Set the pin first" : "A boundary needs at least 3 corners"); return; }
    onApply({ point: point ? (pts[pts.length - 1] ?? null) : null, geometry: point ? null : g });
  };

  return (
    <section className="form-card">
      <header className="form-card-head justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30">
            {point ? <MapPin className="size-4" /> : <Pentagon className="size-4" />}
          </span>
          <div>
            <h3 className="text-sm font-semibold">{title ?? (point ? "Pin" : "Boundary")}</h3>
            <p className="text-[11px] font-normal text-muted-foreground">
              {current ? <>Lat <b className="tabular-nums text-foreground">{fmt(current[1])}</b> · Lng <b className="tabular-nums text-foreground">{fmt(current[0])}</b></> : "Not set yet"}
              {!point && pts.length > 0 && <> · {pts.length} corners</>}
              {acres > 0 && <> · <b className="text-foreground">{fmtAcres(acres)}</b></>}
            </p>
          </div>
        </div>
        {current && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => void navigator.clipboard?.writeText(`${fmt(current[1])}, ${fmt(current[0])}`).then(() => toast.success("Copied"))}
              className="inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium hover:bg-muted"><Copy className="size-3" />Copy</button>
            <a href={`https://www.google.com/maps?q=${fmt(current[1])},${fmt(current[0])}`} target="_blank" rel="noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium hover:bg-muted"><ExternalLink className="size-3" />Google Maps</a>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${fmt(current[1])},${fmt(current[0])}`} target="_blank" rel="noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium hover:bg-muted"><Navigation className="size-3" />Directions</a>
          </div>
        )}
      </header>

      <div className="form-card-body space-y-3">
        {!readOnly && (
          <div className="flex flex-wrap gap-1 rounded-xl border bg-muted/40 p-1">
            {([["map", MapPin, point ? "Pin on map" : "Tap corners on map"], ["gps", Locate, point ? "GPS on site" : "Walk corners (GPS)"], ["paste", ClipboardPaste, "Google pin / paste"]] as const).map(([k, Icon, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition", tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="size-3.5" />{label}
              </button>
            ))}
          </div>
        )}

        {!readOnly && tab === "gps" && (
          <div className="space-y-2 rounded-xl border bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">{point ? "Stand at the spot and capture — the phone takes readings for a few seconds and averages them." : "Stand on each corner in turn and press Capture corner. Go round the boundary in order."}</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={gps.busy} onClick={async () => { const f = await gps.start(8); if (f) { add([f.lng, f.lat]); toast.success(`${point ? "Pin" : `Corner ${pts.length + 1}`} captured · ±${Math.round(f.accuracy)} m`); } }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow disabled:opacity-60">
                <Locate className={cn("size-4", gps.busy && "animate-spin")} />{gps.busy ? "Reading GPS…" : point ? "Capture my location" : `Capture corner ${pts.length + 1}`}
              </button>
              {gps.busy && <button type="button" onClick={gps.stop} className="text-xs text-muted-foreground hover:underline">Stop</button>}
              {gps.fix && (
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  gps.fix.accuracy <= 5 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : gps.fix.accuracy <= 15 ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300")}>
                  ±{Math.round(gps.fix.accuracy)} m · {gps.fix.n} readings
                </span>
              )}
            </div>
            {gps.err && <p className="text-xs text-rose-600">{gps.err}</p>}
          </div>
        )}

        {!readOnly && tab === "paste" && (
          <div className="space-y-2 rounded-xl border bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">In Google Maps, drop a pin → Share → Copy link (or copy the coordinates), then paste here.</p>
            <div className="flex flex-wrap gap-2">
              <input value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://www.google.com/maps/…@32.0836,72.6711  or  32.0836, 72.6711"
                className="field h-9 min-w-0 flex-1 text-xs" aria-label="Google Maps link or coordinates" />
              <button type="button" disabled={!parsed} onClick={() => { if (parsed) { add(parsed); setPasted(""); toast.success(point ? "Pin set" : `Corner ${pts.length + 1} added`); } }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Check className="size-3.5" />{point ? "Use" : "Add corner"}</button>
            </div>
            {pasted && <p className={cn("text-[11px]", parsed ? "text-emerald-600" : "text-rose-600")}>{parsed ? `Found ${fmt(parsed[1])}, ${fmt(parsed[0])}` : "No coordinates found — open short links (maps.app.goo.gl) first, then copy the full link or the coordinates."}</p>}
          </div>
        )}

        <PickerMap pts={pts} shape={shape} gpsFix={gps.fix} readOnly={readOnly || tab !== "map"} onAdd={add} parent={parent} context={context}
          onMove={(i, p) => setPts((prev) => prev.map((q, k) => (k === i ? p : q)))} />

        {!readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {!point && <button type="button" disabled={!pts.length} onClick={() => setPts((p) => p.slice(0, -1))} className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs disabled:opacity-40"><Undo2 className="size-3.5" />Undo</button>}
              <button type="button" disabled={!pts.length} onClick={() => setPts([])} className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs disabled:opacity-40"><Trash2 className="size-3.5" />Clear</button>
            </div>
            <button type="button" onClick={apply} disabled={!pts.length || busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50">
              <Check className="size-4" />{busy ? "Saving…" : point ? "Save pin" : "Save boundary"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ map
function PickerMap({ pts, shape, gpsFix, readOnly, onAdd, onMove, parent, context }: {
  pts: LngLat[]; shape: Shape; gpsFix: Fix | null; readOnly?: boolean; onAdd: (p: LngLat) => void; onMove: (i: number, p: LngLat) => void;
  parent?: FeatureCollection | null; context?: FeatureCollection | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const addRef = useRef(onAdd); addRef.current = onAdd;
  const moveRef = useRef(onMove); moveRef.current = onMove;
  const roRef = useRef(readOnly); roRef.current = readOnly;
  const [ready, setReady] = useState(false);
  const [base, setBase] = useState<BaseLayer>("satellite");

  const addOverlays = (m: MLMap) => {
    m.addSource("context", { type: "geojson", data: context ?? emptyFC() });
    m.addLayer({ id: "context-line", type: "line", source: "context", paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0.7 } });
    m.addLayer({ id: "context-pin", type: "circle", source: "context", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 4, "circle-color": "#ffffff" } });
    m.addSource("parent", { type: "geojson", data: parent ?? emptyFC() });
    m.addLayer({ id: "parent-line", type: "line", source: "parent", paint: { "line-color": "#fcc419", "line-width": 2.5, "line-dasharray": [2, 1.5] } });
    m.addSource("draft", { type: "geojson", data: emptyFC() });
    m.addLayer({ id: "draft-fill", type: "fill", source: "draft", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#10b981", "fill-opacity": 0.3 } });
    m.addLayer({ id: "draft-line", type: "line", source: "draft", paint: { "line-color": "#10b981", "line-width": 3 } });
    m.addSource("gps", { type: "geojson", data: emptyFC() });
    m.addLayer({ id: "gps", type: "circle", source: "gps", paint: { "circle-radius": 7, "circle-color": "#3b82f6", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
  };

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({ container: el.current, style: baseStyle(base), center: pts.length ? centroid(pts) : [72.67, 32.08], zoom: pts.length ? 15 : 9, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => { addOverlays(m); setReady(true); });
    m.on("click", (e) => { if (!roRef.current) addRef.current([Number(e.lngLat.lng.toFixed(7)), Number(e.lngLat.lat.toFixed(7))]); });
    map.current = m;
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // switching imagery replaces the style, so the overlays are added again
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    setReady(false);
    m.setStyle(baseStyle(base));
    m.once("style.load", () => { addOverlays(m); setReady(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  // parent / context data, and frame the view on them
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("context") as GeoJSONSource).setData(context ?? emptyFC());
    (m.getSource("parent") as GeoJSONSource).setData(parent ?? emptyFC());
  }, [parent, context, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const own = toGeometry(shape, pts);
    const b = boundsOf([own && own.type !== "Point" ? own : null, parent, context]);
    if (b) m.fitBounds(b, { padding: 30, maxZoom: shape === "Point" && pts.length ? 16 : 17, duration: 0 });
    else if (pts.length) m.jumpTo({ center: pts[pts.length - 1], zoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent, context, ready && map.current !== null]);

  // draft shape + draggable vertex markers
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const g = toGeometry(shape, pts) ?? (pts.length >= 2 ? ({ type: "LineString", coordinates: pts } as Geometry) : null);
    (m.getSource("draft") as GeoJSONSource).setData({ type: "FeatureCollection", features: g && g.type !== "Point" ? [{ type: "Feature", geometry: g, properties: {} }] : [] });
    markers.current.forEach((x) => x.remove());
    markers.current = pts.map((p, i) => {
      const dot = document.createElement("div");
      dot.className = shape === "Point"
        ? "size-5 rounded-full border-[3px] border-white bg-rose-600 shadow-lg ring-4 ring-rose-500/30"
        : "grid size-6 place-items-center rounded-full border-2 border-white bg-emerald-600 text-[10px] font-bold text-white shadow-lg";
      dot.textContent = shape === "Point" ? "" : String(i + 1);
      const mk = new maplibregl.Marker({ element: dot, draggable: !roRef.current }).setLngLat(p).addTo(m);
      mk.on("dragend", () => { const ll = mk.getLngLat(); moveRef.current(i, [Number(ll.lng.toFixed(7)), Number(ll.lat.toFixed(7))]); });
      return mk;
    });
  }, [pts, shape, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("gps") as GeoJSONSource).setData({ type: "FeatureCollection", features: gpsFix ? [{ type: "Feature", geometry: { type: "Point", coordinates: [gpsFix.lng, gpsFix.lat] }, properties: {} }] : [] });
    if (gpsFix) m.easeTo({ center: [gpsFix.lng, gpsFix.lat], zoom: Math.max(m.getZoom(), 17) });
  }, [gpsFix, ready]);

  return (
    <div className="relative overflow-hidden rounded-xl border">
      <div ref={el} className="h-[26rem] w-full" />
      <button type="button" onClick={() => setBase((b) => (b === "satellite" ? "streets" : "satellite"))}
        className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-[11px] font-medium shadow backdrop-blur">
        <Layers className="size-3.5" />{base === "satellite" ? "Streets" : "Satellite"}
      </button>
      {!readOnly && <p className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-background/85 px-2 py-1 text-[11px] shadow backdrop-blur">
        {shape === "Point" ? "Tap the map to drop the pin · drag to adjust" : "Tap each corner in order · drag a numbered corner to adjust"}</p>}
      <span className="pointer-events-none absolute right-2 bottom-2 hidden items-center gap-1 rounded-md bg-background/85 px-2 py-1 text-[10px] shadow sm:inline-flex">
        <Crosshair className="size-3" />yellow dashed = parent boundary
      </span>
    </div>
  );
}
