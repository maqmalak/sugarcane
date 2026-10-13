/**
 * Draw the road route from a source to the mill on the satellite map: it starts at the source pin, you tap the
 * turns along the road, and "Finish at mill" closes it on the mill pin. The length (geodesic) updates as you draw.
 * Other sources and their routes are drawn faintly for orientation.
 */
import type { Feature, FeatureCollection, LineString } from "geojson";
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import { Check, Factory, Layers, Route, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { baseStyle, boundsOf, emptyFC, toGeometries, type BaseLayer, type LngLat } from "@/sc/lib/map";
import { cn } from "@/sc/lib/utils";

const R = 6371008.8;
/** Great-circle length of a path in km. */
export function pathKm(pts: LngLat[]): number {
  let m = 0;
  for (let i = 1; i < pts.length; i++) {
    const [l1, p1] = pts[i - 1].map((v) => (v * Math.PI) / 180);
    const [l2, p2] = pts[i].map((v) => (v * Math.PI) / 180);
    const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2;
    m += 2 * R * Math.asin(Math.sqrt(a));
  }
  return m / 1000;
}

export function linePoints(raw: unknown): LngLat[] {
  const g = toGeometries(raw).find((x) => x.type === "LineString" || x.type === "MultiLineString");
  if (!g) return [];
  return (g.type === "LineString" ? g.coordinates : g.type === "MultiLineString" ? g.coordinates[0] ?? [] : []) as LngLat[];
}

export function RouteCapture({ pin, mill, initial, context, readOnly, onChange }: {
  pin: LngLat | null;
  mill: LngLat | null;
  initial?: unknown;
  context?: FeatureCollection | null;
  readOnly?: boolean;
  /** Called with the route as a GeoJSON LineString string, or "" when cleared. */
  onChange: (route: string) => void;
}) {
  const start = useMemo(() => linePoints(initial), [initial]);
  const [pts, setPts] = useState<LngLat[]>(start);
  const [drawing, setDrawing] = useState(false);
  const [base, setBase] = useState<BaseLayer>("satellite");
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(0);
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;

  useEffect(() => setPts(start), [start]);

  useEffect(() => {
    if (!box.current) return;
    const m = new maplibregl.Map({ container: box.current, style: baseStyle(base), center: mill ?? pin ?? [72.67, 32.08], zoom: 9, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("ctx", { type: "geojson", data: context ?? emptyFC() });
      m.addLayer({ id: "ctx-line", type: "line", source: "ctx", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.35, "line-dasharray": [2, 2] } });
      m.addLayer({ id: "ctx-pin", type: "circle", source: "ctx", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 4, "circle-color": "#ffffff", "circle-opacity": 0.6 } });
      m.addSource("route", { type: "geojson", data: emptyFC() });
      m.addLayer({ id: "route-casing", type: "line", source: "route", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#0b1220", "line-width": 7, "line-opacity": 0.6 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({ id: "route-line", type: "line", source: "route", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#fab005", "line-width": 4 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({ id: "route-vertex", type: "circle", source: "route", filter: ["==", ["get", "k"], "v"], paint: { "circle-radius": 3.5, "circle-color": "#fab005", "circle-stroke-color": "#0b1220", "circle-stroke-width": 1.5 } });
      m.addSource("ends", { type: "geojson", data: emptyFC() });
      m.addLayer({ id: "ends-pin", type: "circle", source: "ends", paint: { "circle-radius": 8, "circle-color": ["match", ["get", "k"], "mill", "#228be6", "#e8590c"], "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
      setReady((r) => r + 1);
    });
    m.on("click", (e) => {
      if (!drawingRef.current) return;
      setPts((p) => [...p, [Number(e.lngLat.lng.toFixed(6)), Number(e.lngLat.lat.toFixed(6))]]);
    });
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const ends: Feature[] = [];
    if (mill) ends.push({ type: "Feature", geometry: { type: "Point", coordinates: mill }, properties: { k: "mill", label: "Mill" } });
    if (pin) ends.push({ type: "Feature", geometry: { type: "Point", coordinates: pin }, properties: { k: "pin", label: "This location" } });
    (m.getSource("ends") as GeoJSONSource).setData({ type: "FeatureCollection", features: ends });
    const feats: Feature[] = pts.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: { k: "v" } }));
    if (pts.length >= 2) feats.push({ type: "Feature", geometry: { type: "LineString", coordinates: pts }, properties: {} });
    else if (pin && mill && !drawing) feats.push({ type: "Feature", geometry: { type: "LineString", coordinates: [pin, mill] }, properties: {} });
    (m.getSource("route") as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
    (m.getSource("ctx") as GeoJSONSource).setData(context ?? emptyFC());
    m.setPaintProperty("route-line", "line-dasharray", pts.length >= 2 ? [1, 0] : [2, 2]);
    m.getCanvas().style.cursor = drawing ? "crosshair" : "";
  }, [pts, pin, mill, context, drawing, ready]);

  // fit the source, the mill and the route once loaded
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const pointsFC: FeatureCollection = { type: "FeatureCollection", features: [...(pin ? [pin] : []), ...(mill ? [mill] : []), ...start].map((c) => ({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: {} })) };
    const b = boundsOf([pointsFC]);
    if (b) m.fitBounds(b, { padding: 60, maxZoom: 14, duration: 0 });
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (p: LngLat[]) => {
    const line: LineString = { type: "LineString", coordinates: p };
    onChange(p.length >= 2 ? JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: line, properties: {} }] }) : "");
  };
  const begin = () => { setPts(pin ? [pin] : []); setDrawing(true); };
  const finish = () => {
    const p = mill && (pts.length === 0 || pts[pts.length - 1] !== mill) ? [...pts, mill] : pts;
    setPts(p); setDrawing(false); emit(p);
  };
  const clear = () => { setPts([]); setDrawing(false); emit([]); };
  const km = pathKm(pts);

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2 text-sm">
        <Route className="size-4 text-amber-500" />
        <span className="font-semibold">Route to mill</span>
        <span className="text-muted-foreground">
          {pts.length >= 2 ? `${km.toFixed(1)} km drawn · ${pts.length} points` : pin && mill ? "Not drawn — dashed line is the straight line" : "Set this location's pin first"}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {!readOnly && !drawing && <Btn onClick={begin} disabled={!pin || !mill}><Route className="size-3.5" />{pts.length >= 2 ? "Redraw" : "Draw route"}</Btn>}
          {!readOnly && drawing && <>
            <Btn onClick={() => setPts((p) => p.slice(0, Math.max(pin ? 1 : 0, p.length - 1)))} disabled={pts.length <= (pin ? 1 : 0)}><Undo2 className="size-3.5" />Undo</Btn>
            <Btn onClick={finish} primary disabled={pts.length < 1}><Factory className="size-3.5" />Finish at mill</Btn>
          </>}
          {!readOnly && pts.length > 0 && <Btn onClick={clear}><Trash2 className="size-3.5" />Clear</Btn>}
          <Btn onClick={() => setBase((b) => (b === "satellite" ? "streets" : "satellite"))}><Layers className="size-3.5" />{base === "satellite" ? "Streets" : "Satellite"}</Btn>
        </div>
      </div>
      <div className="relative">
        <div ref={box} className="h-[26rem] w-full" />
        <div className="pointer-events-none absolute bottom-3 left-3 flex gap-3 rounded-lg bg-background/90 px-2.5 py-1.5 text-[11px] shadow">
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-[#228be6] ring-2 ring-white" />Mill</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-[#e8590c] ring-2 ring-white" />This location</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-[#fab005]" />Route</span>
        </div>
        {drawing && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-background/90 px-3 py-2 text-xs shadow">
            <Check className="mr-1 inline size-3.5 text-emerald-500" />Tap each turn along the road, then <b>Finish at mill</b>.
          </div>
        )}
      </div>
    </div>
  );
}

function Btn({ children, onClick, disabled, primary }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn("inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium disabled:opacity-40",
        primary ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}>
      {children}
    </button>
  );
}
