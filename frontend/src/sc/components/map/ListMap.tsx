/**
 * Map above a list page: every record of the DocType with its boundary or pin (hierarchy levels), or its pin and
 * road route (sources, depots, loading points) together with the mill. Click a record to open its form. The panel
 * can be folded; that choice is remembered on this browser.
 */
import type { Feature, FeatureCollection } from "geojson";
import { useFrappeGetCall } from "frappe-react-sdk";
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import { ChevronDown, ChevronRight, Layers, Map as MapIcon, Maximize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { baseStyle, boundsOf, emptyFC, type BaseLayer } from "@/sc/lib/map";
import { minutes } from "@/sc/components/JourneyPanel";

const HIERARCHY = ["Sugar Division", "Sugar District", "Sugar Zone", "Cane Circle", "Cane Sector", "Cane Village", "Competitor Mill"];
const COLOUR: Record<string, string> = {
  "Sugar Division": "#7950f2", "Sugar District": "#228be6", "Sugar Zone": "#fd7e14", "Cane Circle": "#fab005",
  "Cane Sector": "#15aabf", "Cane Village": "#82c91e", "Competitor Mill": "#e03131",
  "Factory Gate": "#228be6", "Check Post": "#f76707", Depot: "#ae3ec9", "Cane Depot": "#ae3ec9", "Loading Point": "#12b886",
};
const store = {
  get: (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* private window */ } },
};

export function ListMap({ doctype, base }: { doctype: string; base: string }) {
  const isHierarchy = HIERARCHY.includes(doctype);
  const storeKey = `sc-listmap-${doctype}`;
  const [open, setOpen] = useState(() => store.get(storeKey) !== "0");
  const [kind, setKind] = useState<BaseLayer>("satellite");
  const navigate = useNavigate();
  const location = useLocation();
  const toggle = () => setOpen((o) => { store.set(storeKey, o ? "0" : "1"); return !o; });

  const levels = useMemo(() => JSON.stringify([doctype]), [doctype]);
  const { data: bData } = useFrappeGetCall<{ message: Record<string, FeatureCollection> }>(
    "sugarcane.api.v1.survey_map.boundaries", { levels }, open && isHierarchy ? `sc-listmap-b-${doctype}` : null);
  const { data: sData } = useFrappeGetCall<{ message: FeatureCollection & { mill: { latitude: number; longitude: number } | null } }>(
    "sugarcane.journey.sources_map", undefined, open && !isHierarchy ? "sc-sources-map" : null);
  const { data: mData } = useFrappeGetCall<{ message: FeatureCollection }>("sugarcane.api.v1.survey_map.mills", undefined, open ? "sc-listmap-mills" : null);

  const features = useMemo<FeatureCollection>(() => {
    if (isHierarchy) return bData?.message?.[doctype] ?? emptyFC();
    const fc = sData?.message;
    return { type: "FeatureCollection", features: (fc?.features ?? []).filter((f) => f.properties?.doctype === doctype) };
  }, [bData, sData, doctype, isHierarchy]);
  const count = features.features.filter((f) => f.properties?.line !== "route").length;

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button type="button" onClick={toggle} className="inline-flex items-center gap-2 text-sm font-semibold">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}<MapIcon className="size-4 text-primary" />Map
        </button>
        {open && <span className="text-xs text-muted-foreground">{count} on the map · click one to open it</span>}
        {open && (
          <div className="ml-auto flex gap-1.5">
            <button type="button" onClick={() => setKind((k) => (k === "satellite" ? "streets" : "satellite"))}
              className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs hover:bg-accent"><Layers className="size-3.5" />{kind === "satellite" ? "Streets" : "Satellite"}</button>
            {isHierarchy && (
              <button type="button" onClick={() => navigate(`/setup/area-map?from=${encodeURIComponent(location.pathname + location.search)}`)}
                className="inline-flex h-7 items-center gap-1 rounded-md border bg-background px-2 text-xs hover:bg-accent"><Maximize2 className="size-3.5" />Area Map</button>
            )}
          </div>
        )}
      </div>
      {open && <MapBox kind={kind} features={features} mills={mData?.message} colour={COLOUR[doctype] ?? "#fab005"}
        onOpen={(name) => navigate(`${base}/${encodeURIComponent(name)}`)} />}
    </section>
  );
}

function MapBox({ kind, features, mills, colour, onOpen }: {
  kind: BaseLayer; features: FeatureCollection; mills?: FeatureCollection; colour: string; onOpen: (name: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(0);
  const fitted = useRef(false);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  useEffect(() => {
    if (!box.current) return;
    const m = new maplibregl.Map({ container: box.current, style: baseStyle(kind), center: [72.67, 32.08], zoom: 7, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    m.on("load", () => {
      m.addSource("mills", { type: "geojson", data: emptyFC() });
      m.addLayer({ id: "mills-pin", type: "circle", source: "mills", filter: ["==", ["geometry-type"], "Point"], paint: {
        "circle-radius": ["match", ["get", "kind"], "company", 9, 6], "circle-color": ["match", ["get", "kind"], "company", "#228be6", ["coalesce", ["get", "color"], "#e03131"]],
        "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      m.addSource("recs", { type: "geojson", data: emptyFC() });
      m.addLayer({ id: "recs-fill", type: "fill", source: "recs", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": colour, "fill-opacity": 0.18 } });
      m.addLayer({ id: "recs-outline", type: "line", source: "recs", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": colour, "line-width": 2 } });
      m.addLayer({ id: "recs-route", type: "line", source: "recs", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#fab005", "line-width": 3, "line-opacity": 0.85 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({ id: "recs-pin", type: "circle", source: "recs", filter: ["==", ["geometry-type"], "Point"], paint: {
        "circle-radius": 7, "circle-color": ["coalesce", ["get", "colour"], colour], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      setReady((r) => r + 1);
    });
    for (const layer of ["recs-fill", "recs-pin", "recs-route"]) {
      m.on("click", layer, (e) => { const n = e.features?.[0]?.properties?.name; if (n) openRef.current(String(n)); });
      m.on("mouseenter", layer, (e) => {
        m.getCanvas().style.cursor = "pointer";
        const p = e.features?.[0]?.properties ?? {};
        const lines = [`<b>${esc(p.title ?? p.name)}</b>`];
        if (p.area_acres) lines.push(`${Number(p.area_acres).toLocaleString()} acres`);
        if (p.distance_km) lines.push(`${Number(p.distance_km).toFixed(1)} km road · ${minutes(p.to_mill)} to mill · ${minutes(p.back)} back`);
        popup.setLngLat(e.lngLat).setHTML(`<div style="font-size:12px;color:#111">${lines.join("<br>")}</div>`).addTo(m);
      });
      m.on("mouseleave", layer, () => { m.getCanvas().style.cursor = ""; popup.remove(); });
    }
    map.current = m;
    fitted.current = false;
    return () => { popup.remove(); m.remove(); map.current = null; };
  }, [kind, colour]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const recs: Feature[] = features.features.map((f) => ({ ...f, properties: { ...f.properties, colour: COLOUR[String(f.properties?.kind ?? "")] ?? null } }));
    (m.getSource("recs") as GeoJSONSource).setData({ type: "FeatureCollection", features: recs });
    (m.getSource("mills") as GeoJSONSource).setData(mills ?? emptyFC());
    if (!fitted.current && (features.features.length || mills?.features.length)) {
      const b = boundsOf([features, ...(mills ? [mills] : [])]);
      if (b) { m.fitBounds(b, { padding: 40, maxZoom: 13, duration: 0 }); fitted.current = true; }
    }
  }, [features, mills, ready]);

  return <div ref={box} className="h-80 w-full border-t" />;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
