/** EagleEye Survey Map: bird's-eye view of surveyed cane over the area hierarchy, with attendance and GPS tracks. */
import type { Feature, FeatureCollection } from "geojson";
import { useFrappeGetCall } from "frappe-react-sdk";
import maplibregl, { type GeoJSONSource, type Map as MLMap, type MapLayerMouseEvent } from "maplibre-gl";
import { ExternalLink, Filter, Layers, Maximize2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, StatusBadge } from "@/sc/components/ui/badge";
import { Button } from "@/sc/components/ui/button";
import { Input, Label, Select } from "@/sc/components/ui/input";
import { Sheet } from "@/sc/components/ui/sheet";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { fmtDate, fmtInt } from "@/sc/lib/fmt";
import { baseStyle, boundsOf, colourFor, emptyFC, matchColour, type BaseLayer } from "@/sc/lib/map";
import { cn } from "@/sc/lib/utils";
import { BackLink, keepFrom } from "@/sc/components/BackLink";

interface Meta {
  season: string;
  seasons: { name: string; status: string }[];
  varieties: { name: string; map_color?: string | null }[];
  diseases: { name: string; map_color?: string | null }[];
  circles: { name: string; circle_code: string }[];
  villages: { name: string; village_name: string; circle: string }[];
  surveyors: string[];
  competitor_mills: { name: string; short_name?: string | null; map_color?: string | null }[];
  centre: { lat: number; lng: number; zoom: number };
}
type ColourBy = "variety" | "disease" | "crop_type" | "overlap_status" | "survey_for" | "competitor_mill" | "grower_category";
type LayerKey = "mills" | "sources" | "Sugar Zone" | "Cane Circle" | "Cane Sector" | "Cane Village" | "company" | "competitor" | "attendance" | "tracks";

const BOUNDARY_STYLE: Record<string, { color: string; width: number; dash?: number[] }> = {
  "Sugar Division": { color: "#be4bdb", width: 3 },
  "Sugar District": { color: "#7950f2", width: 2.5, dash: [3, 2] },
  "Sugar Zone": { color: "#fd7e14", width: 2.5 },
  "Cane Circle": { color: "#fcc419", width: 2 },
  "Cane Sector": { color: "#74c0fc", width: 1.2, dash: [2, 2] },
  "Cane Village": { color: "#ffffff", width: 0.8 },
};
const LAYERS: { key: LayerKey; label: string }[] = [
  { key: "mills", label: "Mills" }, { key: "sources", label: "Depots & check posts" }, { key: "Sugar Zone", label: "Zones" }, { key: "Cane Circle", label: "Circles" }, { key: "Cane Sector", label: "Sectors" },
  { key: "Cane Village", label: "Villages" }, { key: "company", label: "Company fields" }, { key: "competitor", label: "Competitor fields" },
  { key: "attendance", label: "Attendance" }, { key: "tracks", label: "GPS tracks" },
];
const FIXED_COLOURS: Record<string, Record<string, string>> = {
  crop_type: { Plant: "#2f9e44", Ratoon: "#e67700" },
  overlap_status: { Clear: "#2f9e44", "Under Review": "#f08c00", Accepted: "#1c7ed6", Rejected: "#e03131" },
  survey_for: { Company: "#2f9e44", Competitor: "#e03131" },
  grower_category: { "Passbook Grower": "#2f9e44", "Non-Passbook Grower": "#7048e8" },
};

export function SurveyMapPage() {
  const [params, setParams] = useSearchParams();
  const { data: metaData } = useFrappeGetCall<{ message: Meta }>("sugarcane.api.v1.survey_map.meta", undefined, "survey-meta");
  const meta = metaData?.message;
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [colourBy, setColourBy] = useState<ColourBy>("variety");
  // ?layers=attendance,tracks adds layers to the defaults (used by the Field Force links)
  const [layers, setLayers] = useState<Set<LayerKey>>(() => new Set([
    "mills", "sources", "Sugar Zone", "Cane Circle", "Cane Village", "company", "competitor",
    ...((params.get("layers") || "").split(",").filter(Boolean) as LayerKey[]),
  ]));
  const [trackDate, setTrackDate] = useState(() => new Date(Date.now() - 864e5).toISOString().slice(0, 10));
  const [base, setBase] = useState<BaseLayer>("satellite");
  const [panel, setPanel] = useState(true);
  const selected = params.get("focus");

  const { data: bData } = useFrappeGetCall<{ message: Record<string, FeatureCollection> }>("sugarcane.api.v1.survey_map.boundaries", undefined, "survey-boundaries");
  const { data: mData } = useFrappeGetCall<{ message: FeatureCollection }>("sugarcane.api.v1.survey_map.mills", undefined, "survey-mills");
  const { data: srcData } = useFrappeGetCall<{ message: FeatureCollection }>("sugarcane.journey.sources_map", undefined, "sc-sources-map");
  const surveyArgs = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), [filters]);
  const { data: sData, isLoading: sLoading } = useFrappeGetCall<{ message: FeatureCollection & { totals: Record<string, number>; count: number } }>(
    "sugarcane.api.v1.survey_map.surveys", surveyArgs);
  const wantTracks = layers.has("attendance") || layers.has("tracks");
  const { data: tData } = useFrappeGetCall<{ message: { attendance: FeatureCollection; tracks: FeatureCollection } }>(
    "sugarcane.api.v1.survey_map.tracks", wantTracks ? { date: trackDate, surveyor: filters.surveyor || undefined } : undefined,
    wantTracks ? undefined : null);

  const palette = useMemo<Record<string, string>>(() => {
    if (FIXED_COLOURS[colourBy]) return FIXED_COLOURS[colourBy];
    if (colourBy === "competitor_mill") {
      return Object.fromEntries((meta?.competitor_mills ?? []).map((m) => [m.name, m.map_color ?? colourFor(m.name)]));
    }
    const rows = colourBy === "variety" ? meta?.varieties ?? [] : meta?.diseases ?? [];
    return Object.fromEntries(rows.map((r) => [r.name, colourFor(r.name, { [r.name]: r.map_color })]));
  }, [colourBy, meta]);

  const surveys = sData?.message;
  const totals = surveys?.totals ?? {};
  const legend = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of surveys?.features ?? []) {
      const v = String((f.properties ?? {})[colourBy] ?? "") || (colourBy === "disease" ? "Healthy" : colourBy === "competitor_mill" ? "Company fields" : "—");
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [surveys, colourBy]);

  const set = (k: string, v: string) => setFilters((f) => ({ ...f, [k]: v, ...(k === "circle" ? { village: "" } : {}) }));
  const toggleLayer = (k: LayerKey) => setLayers((prev) => { const s = new Set(prev); if (s.has(k)) s.delete(k); else s.add(k); return s; });
  const villages = (meta?.villages ?? []).filter((v) => !filters.circle || v.circle === filters.circle);

  return (
    <div className="relative -m-4 h-[calc(100vh-3.5rem)] md:-m-6">
      <SurveyMap base={base} boundaries={bData?.message} mills={mData?.message} sources={srcData?.message} surveys={surveys} tracks={tData?.message} layers={layers} colourBy={colourBy}
        palette={palette} centre={meta?.centre} focus={selected} onSelect={(name) => setParams(keepFrom(params, name ? { focus: name } : {}))} />

      <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-2">
        <BackLink className="pointer-events-auto h-[3.25rem] rounded-xl shadow-lg" />
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
          <Stat label="Company fields" value={fmtInt(totals.company_surveys)} />
          <Stat label="Cane area" value={`${fmtInt(totals.company_acres)} acres`} />
          <Stat label="Expected" value={`${fmtInt(totals.expected_maund)} md`} />
          <Stat label="Competitor" value={`${fmtInt(totals.competitor_acres)} acres`} tone="text-rose-600" />
          {sLoading && <span className="text-xs text-muted-foreground">Loading…</span>}
        </div>
        <div className="pointer-events-auto ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBase((b) => (b === "satellite" ? "streets" : "satellite"))}>
            <Layers />{base === "satellite" ? "Streets" : "Satellite"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPanel((p) => !p)}><Filter />{panel ? "Hide" : "Filters"}</Button>
        </div>
      </div>

      {panel && (
        <aside className="scrollbar-thin absolute bottom-3 left-3 top-20 w-[19rem] overflow-y-auto rounded-xl border bg-card/95 shadow-xl backdrop-blur">
          <div className="form-card-head justify-between">
            <span>Filters &amp; layers</span>
            <button type="button" className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground" onClick={() => setFilters({})}>
              <RotateCcw className="size-3" />Reset
            </button>
          </div>
          <div className="space-y-3 p-3">
            <Field label="Season">
              <Select value={filters.season ?? ""} onChange={(e) => set("season", e.target.value)}>
                <option value="">{meta?.season ? `${meta.season} (active)` : "Active season"}</option>
                {(meta?.seasons ?? []).map((s) => <option key={s.name} value={s.name}>{s.name} · {s.status}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Circle">
                <Select value={filters.circle ?? ""} onChange={(e) => set("circle", e.target.value)}>
                  <option value="">All</option>
                  {(meta?.circles ?? []).map((c) => <option key={c.name} value={c.name}>{c.circle_code} {c.name}</option>)}
                </Select>
              </Field>
              <Field label="Village">
                <Select value={filters.village ?? ""} onChange={(e) => set("village", e.target.value)}>
                  <option value="">All</option>
                  {villages.map((v) => <option key={v.name} value={v.name}>{v.village_name}</option>)}
                </Select>
              </Field>
              <Field label="Variety">
                <Select value={filters.variety ?? ""} onChange={(e) => set("variety", e.target.value)}>
                  <option value="">All</option>
                  {(meta?.varieties ?? []).map((v) => <option key={v.name}>{v.name}</option>)}
                </Select>
              </Field>
              <Field label="Disease">
                <Select value={filters.disease ?? ""} onChange={(e) => set("disease", e.target.value)}>
                  <option value="">All</option>
                  <option value="__any__">Any disease</option>
                  <option value="__none__">Healthy</option>
                  {(meta?.diseases ?? []).map((v) => <option key={v.name}>{v.name}</option>)}
                </Select>
              </Field>
              <Field label="Plant / Ratoon">
                <Select value={filters.crop_type ?? ""} onChange={(e) => set("crop_type", e.target.value)}>
                  <option value="">All</option><option>Plant</option><option>Ratoon</option>
                </Select>
              </Field>
              <Field label="Overlap">
                <Select value={filters.overlap_status ?? ""} onChange={(e) => set("overlap_status", e.target.value)}>
                  <option value="">All</option><option>Clear</option><option>Under Review</option><option>Accepted</option><option>Rejected</option>
                </Select>
              </Field>
              <Field label="Grower type">
                <Select value={filters.grower_category ?? ""} onChange={(e) => set("grower_category", e.target.value)}>
                  <option value="">All</option><option>Passbook Grower</option><option>Non-Passbook Grower</option>
                </Select>
              </Field>
              <Field label="Competitor mill">
                <Select value={filters.competitor_mill ?? ""} onChange={(e) => set("competitor_mill", e.target.value)}>
                  <option value="">All</option>
                  {(meta?.competitor_mills ?? []).map((m) => <option key={m.name} value={m.name}>{m.short_name ?? m.name}</option>)}
                </Select>
              </Field>
              <Field label="From">
                <Input type="date" value={filters.from_date ?? ""} onChange={(e) => set("from_date", e.target.value)} />
              </Field>
              <Field label="To">
                <Input type="date" value={filters.to_date ?? ""} onChange={(e) => set("to_date", e.target.value)} />
              </Field>
            </div>
            <Field label="Surveyor">
              <Select value={filters.surveyor ?? ""} onChange={(e) => set("surveyor", e.target.value)}>
                <option value="">All</option>
                {(meta?.surveyors ?? []).map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>

            <div>
              <Label className="text-xs">Layers</Label>
              <div className="grid grid-cols-2 gap-1">
                {LAYERS.map((l) => (
                  <label key={l.key} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-muted">
                    <input type="checkbox" checked={layers.has(l.key)} onChange={() => toggleLayer(l.key)} />
                    <span className="size-2.5 rounded-sm" style={{ background: BOUNDARY_STYLE[l.key]?.color ?? (l.key === "competitor" ? "#e03131" : l.key === "company" ? "#2f9e44" : l.key === "tracks" ? "#4dabf7" : l.key === "mills" ? "#1c7ed6" : "#be4bdb") }} />
                    {l.label}
                  </label>
                ))}
              </div>
              {wantTracks && (
                <div className="mt-2">
                  <Field label="Attendance / track day">
                    <Input type="date" value={trackDate} onChange={(e) => setTrackDate(e.target.value)} />
                  </Field>
                </div>
              )}
            </div>

            <div>
              <Field label="Colour fields by">
                <Select value={colourBy} onChange={(e) => setColourBy(e.target.value as ColourBy)}>
                  <option value="variety">Variety</option><option value="disease">Disease</option><option value="crop_type">Plant / Ratoon</option>
                  <option value="overlap_status">Overlap status</option><option value="survey_for">Company / Competitor</option>
                  <option value="competitor_mill">Competitor mill</option><option value="grower_category">Passbook / Non-passbook</option>
                </Select>
              </Field>
              <ul className="mt-2 space-y-1">
                {legend.map(([k, n]) => (
                  <li key={k} className="flex items-center gap-2 text-xs">
                    <span className="size-3 rounded-sm border border-black/10" style={{ background: palette[k] ?? (k === "Healthy" ? "#adb5bd" : "#868e96") }} />
                    <span className="flex-1 truncate">{k}</span>
                    <span className="tabular-nums text-muted-foreground">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      )}

      <SurveyDrawer name={selected} onClose={() => setParams(keepFrom(params, {}))} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="mb-1 text-xs">{label}</Label>{children}</div>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold tabular-nums", tone)}>{value}</div>
    </div>
  );
}

// ------------------------------------------------------------------ map
function SurveyMap({ base, boundaries, mills, sources, surveys, tracks, layers, colourBy, palette, centre, focus, onSelect }: {
  base: BaseLayer; boundaries?: Record<string, FeatureCollection>; mills?: FeatureCollection; sources?: FeatureCollection; surveys?: FeatureCollection; layers: Set<LayerKey>;
  tracks?: { attendance: FeatureCollection; tracks: FeatureCollection }; colourBy: ColourBy; palette: Record<string, string>;
  centre?: { lat: number; lng: number; zoom: number }; focus: string | null; onSelect: (name: string | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(0);
  const fitted = useRef(false);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const popup = useRef<maplibregl.Popup | null>(null);

  const install = (m: MLMap) => {
    for (const dt of Object.keys(BOUNDARY_STYLE)) {
      const s = BOUNDARY_STYLE[dt];
      m.addSource(dt, { type: "geojson", data: emptyFC() });
      m.addLayer({ id: `${dt}-fill`, type: "fill", source: dt, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": s.color, "fill-opacity": 0.02 } });
      m.addLayer({ id: `${dt}-line`, type: "line", source: dt, paint: { "line-color": s.color, "line-width": s.width, ...(s.dash ? { "line-dasharray": s.dash } : {}) } });
      m.addLayer({ id: `${dt}-pin`, type: "circle", source: dt, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 4, "circle-color": s.color, "circle-stroke-color": "#000", "circle-stroke-width": 0.5 } });
    }
    m.addSource("surveys", { type: "geojson", data: emptyFC(), promoteId: "name" });
    m.addLayer({ id: "surveys-fill", type: "fill", source: "surveys", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#2f9e44", "fill-opacity": 0.55 } });
    m.addLayer({ id: "surveys-line", type: "line", source: "surveys", paint: { "line-color": "#ffffff", "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.5, 0.8] } });
    m.addLayer({ id: "surveys-pin", type: "circle", source: "surveys", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#2f9e44", "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
    m.addSource("tracks", { type: "geojson", data: emptyFC() });
    m.addLayer({ id: "tracks-line", type: "line", source: "tracks", paint: { "line-color": "#4dabf7", "line-width": 2.2, "line-opacity": 0.9 } });
    m.addSource("mills", { type: "geojson", data: emptyFC() });
    m.addLayer({ id: "mills-fill", type: "fill", source: "mills", filter: ["==", ["geometry-type"], "Polygon"], paint: {
      "fill-color": ["case", ["==", ["get", "kind"], "company"], "#1c7ed6", ["coalesce", ["get", "color"], "#e03131"]], "fill-opacity": 0.35 } });
    m.addLayer({ id: "mills-pin", type: "circle", source: "mills", filter: ["==", ["geometry-type"], "Point"], paint: {
      "circle-radius": ["case", ["==", ["get", "kind"], "company"], 11, 8],
      "circle-color": ["case", ["==", ["get", "kind"], "company"], "#1c7ed6", ["coalesce", ["get", "color"], "#e03131"]],
      "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
    m.addSource("sources", { type: "geojson", data: emptyFC() });
    m.addLayer({ id: "sources-route", type: "line", source: "sources", filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": "#fab005", "line-width": 2.5, "line-opacity": 0.8 }, layout: { "line-cap": "round", "line-join": "round" } });
    m.addLayer({ id: "sources-pin", type: "circle", source: "sources", filter: ["==", ["geometry-type"], "Point"], paint: {
      "circle-radius": 7, "circle-color": ["match", ["get", "kind"], "Depot", "#ae3ec9", "Cane Depot", "#ae3ec9", "Check Post", "#f76707", "Factory Gate", "#228be6", "Loading Point", "#12b886", "#868e96"],
      "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
    m.addSource("attendance", { type: "geojson", data: emptyFC() });
    m.addLayer({ id: "attendance-pin", type: "circle", source: "attendance", paint: {
      "circle-radius": 7, "circle-color": ["match", ["get", "kind"], "in", "#be4bdb", "#495057"],
      "circle-stroke-color": ["case", ["==", ["get", "inside"], 1], "#ffffff", "#e03131"], "circle-stroke-width": 2.5 } });
  };

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({ container: el.current, style: baseStyle(base), center: [72.67, 32.08], zoom: 8, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl(), "bottom-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    m.on("load", () => { install(m); setReady((n) => n + 1); });
    const clickSurvey = (e: MapLayerMouseEvent) => { const f = e.features?.[0]; if (f) selectRef.current(String(f.properties?.name)); };
    m.on("click", "surveys-fill", clickSurvey);
    m.on("click", "surveys-pin", clickSurvey);
    const hover = (layer: string) => {
      m.on("mouseenter", layer, () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", layer, () => { m.getCanvas().style.cursor = ""; });
    };
    ["surveys-fill", "surveys-pin", "attendance-pin", "mills-pin", "sources-pin", "sources-route", "Cane Village-fill", "Cane Sector-fill", "Cane Circle-fill", "Sugar Zone-fill"].forEach(hover);
    m.on("click", (e) => {
      const src = m.queryRenderedFeatures(e.point, { layers: ["sources-pin", "sources-route"].filter((l) => m.getLayer(l)) })[0];
      if (src) {
        const p = src.properties ?? {};
        const mins = (v: unknown) => { const n = Math.round(Number(v) || 0); return n >= 60 ? `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, "0")} min` : `${n} min`; };
        popup.current?.remove();
        popup.current = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" }).setLngLat(e.lngLat)
          .setHTML(`<b>${esc(p.title)}</b><br/>${esc(p.kind)}${p.circle ? ` · ${esc(p.circle)}` : ""}${p.distance_km ? `<br/>${Number(p.distance_km).toFixed(1)} km by road${p.basis ? ` (${esc(String(p.basis).toLowerCase())})` : ""}` : ""}${p.to_mill ? `<br/>To mill ${mins(p.to_mill)} · back ${mins(p.back)}<br/>Round trip ${mins(p.round_trip)}` : ""}`)
          .addTo(m);
        return;
      }
      const hit = m.queryRenderedFeatures(e.point, { layers: ["surveys-fill", "surveys-pin", "attendance-pin", "mills-pin", "mills-fill"] });
      if (hit.length) {
        const a = hit.find((h) => h.layer.id === "attendance-pin");
        const mill = hit.find((h) => h.layer.id.startsWith("mills"));
        popup.current?.remove();
        if (a) {
          const p = a.properties ?? {};
          const img = p.selfie ? `<a href="${p.selfie}" target="_blank"><img src="${p.selfie}" style="width:150px;border-radius:6px;margin:6px 0"/></a><br/>` : "";
          popup.current = new maplibregl.Popup({ closeButton: true, maxWidth: "240px" }).setLngLat(e.lngLat)
            .setHTML(`<b>${p.surveyor_name ?? p.surveyor}</b><br/>${img}Check ${p.kind} · ${String(p.time ?? "").slice(11, 16)}<br/>${Number(p.lat).toFixed(6)}, ${Number(p.lng).toFixed(6)}<br/>${p.status}${p.inside ? " · inside geofence" : " · <span style='color:#e03131'>outside geofence</span>"}<br/>${p.hours ?? 0} h · ${p.km ?? 0} km`)
            .addTo(m);
        } else if (mill && !hit.some((h) => h.layer.id.startsWith("surveys"))) {
          const p = mill.properties ?? {};
          popup.current = new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat)
            .setHTML(`<b>${esc(p.name)}</b><br/>${p.kind === "company" ? "Our mill" : `Competitor${p.tcd ? ` · ${Number(p.tcd).toLocaleString()} TCD` : ""}`}`)
            .addTo(m);
        }
        return;
      }
      const area = m.queryRenderedFeatures(e.point, { layers: ["Cane Village-fill", "Cane Sector-fill", "Cane Circle-fill", "Sugar Zone-fill"].filter((l) => m.getLayer(l)) })[0];
      popup.current?.remove();
      if (area) {
        const p = area.properties ?? {};
        popup.current = new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat)
          .setHTML(`<b>${esc(p.title ?? p.name)}</b><br/>${String(p.doctype ?? "").replace("Cane ", "").replace("Sugar ", "")}${p.code ? ` · ${p.code}` : ""}${p.area_acres ? `<br/>${Math.round(p.area_acres).toLocaleString()} acres` : ""}`)
          .addTo(m);
      }
    });
    map.current = m;
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    m.setStyle(baseStyle(base));
    m.once("style.load", () => { install(m); setReady((n) => n + 1); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !boundaries) return;
    for (const dt of Object.keys(BOUNDARY_STYLE)) (m.getSource(dt) as GeoJSONSource | undefined)?.setData(boundaries[dt] ?? emptyFC());
    if (!fitted.current && !focus) {
      const b = boundsOf([boundaries["Cane Circle"], boundaries["Sugar Zone"]]);
      if (b) { m.fitBounds(b, { padding: 40, duration: 0 }); fitted.current = true; }
      else if (centre) m.jumpTo({ center: [centre.lng, centre.lat], zoom: centre.zoom });
    }
  }, [boundaries, ready, centre, focus]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("surveys") as GeoJSONSource).setData(surveys ?? emptyFC());
  }, [surveys, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("mills") as GeoJSONSource).setData(mills ?? emptyFC());
  }, [mills, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("sources") as GeoJSONSource).setData(sources ?? emptyFC());
  }, [sources, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("tracks") as GeoJSONSource).setData(tracks?.tracks ?? emptyFC());
    (m.getSource("attendance") as GeoJSONSource).setData(tracks?.attendance ?? emptyFC());
  }, [tracks, ready]);

  // colours and layer visibility
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const fallback = colourBy === "disease" ? "#adb5bd" : "#868e96";
    const colour = matchColour(colourBy, palette, fallback);
    m.setPaintProperty("surveys-fill", "fill-color", colour);
    m.setPaintProperty("surveys-pin", "circle-color", colour);
    const kinds = [layers.has("company") ? "Company" : null, layers.has("competitor") ? "Competitor" : null].filter(Boolean) as string[];
    const filt = ["in", ["get", "survey_for"], ["literal", kinds]] as unknown as maplibregl.FilterSpecification;
    m.setFilter("surveys-fill", ["all", ["==", ["geometry-type"], "Polygon"], filt] as unknown as maplibregl.FilterSpecification);
    m.setFilter("surveys-pin", ["all", ["==", ["geometry-type"], "Point"], filt] as unknown as maplibregl.FilterSpecification);
    m.setFilter("surveys-line", filt);
    for (const dt of Object.keys(BOUNDARY_STYLE)) {
      const vis = layers.has(dt as LayerKey) ? "visible" : "none";
      for (const suffix of ["fill", "line", "pin"]) if (m.getLayer(`${dt}-${suffix}`)) m.setLayoutProperty(`${dt}-${suffix}`, "visibility", vis);
    }
    m.setLayoutProperty("tracks-line", "visibility", layers.has("tracks") ? "visible" : "none");
    for (const id of ["mills-fill", "mills-pin"]) m.setLayoutProperty(id, "visibility", layers.has("mills") ? "visible" : "none");
    m.setLayoutProperty("attendance-pin", "visibility", layers.has("attendance") ? "visible" : "none");
    for (const id of ["sources-pin", "sources-route"]) m.setLayoutProperty(id, "visibility", layers.has("sources") ? "visible" : "none");
  }, [colourBy, palette, layers, ready]);

  // focus a survey (from the drawer, the desk or a link)
  const lastFocus = useRef<string | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !surveys) return;
    if (lastFocus.current) m.setFeatureState({ source: "surveys", id: lastFocus.current }, { selected: false });
    lastFocus.current = focus;
    if (!focus) return;
    m.setFeatureState({ source: "surveys", id: focus }, { selected: true });
    const f = surveys.features.find((x: Feature) => x.properties?.name === focus);
    const b = f ? boundsOf([f]) : null;
    if (b) m.fitBounds(b, { padding: 160, maxZoom: 17, duration: 600 });
  }, [focus, surveys, ready]);

  return <div ref={el} className="h-full w-full" />;
}

// ------------------------------------------------------------------ detail drawer
interface Photo { url: string; caption?: string | null; latitude?: number | null; longitude?: number | null; taken_at?: string | null }
interface Detail {
  survey: Record<string, string | number | null>;
  photos: Photo[];
  grower_photo?: string | null;
  reviews: { name: string; survey: string; other_survey: string; overlap_acres: number; overlap_pct: number; status: string }[];
  variety_color?: string | null;
}

function SurveyDrawer({ name, onClose }: { name: string | null; onClose: () => void }) {
  const { data, isLoading } = useFrappeGetCall<{ message: Detail }>("sugarcane.api.v1.survey_map.survey_detail", name ? { name } : undefined,
    name ? undefined : null);
  const d = data?.message;
  const s = d?.survey ?? {};
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value ?? "—"}</span>
    </div>
  );
  return (
    <Sheet open={!!name} onOpenChange={(o) => !o && onClose()} title={String(s.grower_name ?? s.competitor_mill ?? name ?? "")}
      description={name ? `${name} · ${s.village_name ?? ""} · ${s.circle ?? ""}` : undefined}>
      {isLoading || !d ? <Skeleton className="h-64" /> : (
        <div className="space-y-4">
          {d.grower_photo && (
            <div className="flex items-center gap-4 rounded-2xl border bg-card p-3">
              <a href={d.grower_photo} target="_blank" rel="noreferrer" className="shrink-0">
                <img src={d.grower_photo} alt={String(s.grower_name ?? "Grower")} className="size-24 rounded-xl border object-cover" />
              </a>
              <div className="min-w-0 text-sm">
                <div className="font-semibold">{String(s.grower_name ?? "")}</div>
                <div className="text-xs text-muted-foreground">{String(s.grower ?? "")} · {String(s.cnic ?? "")}</div>
                {s.grower_photo_latitude ? (
                  <a className="text-xs text-primary hover:underline" target="_blank" rel="noreferrer"
                    href={`https://www.google.com/maps?q=${s.grower_photo_latitude},${s.grower_photo_longitude}`}>
                    Photo at {Number(s.grower_photo_latitude).toFixed(6)}, {Number(s.grower_photo_longitude).toFixed(6)}
                  </a>
                ) : <div className="text-xs text-muted-foreground">Profile photo</div>}
                {s.grower_photo_taken_at && <div className="text-xs text-muted-foreground">{String(s.grower_photo_taken_at).slice(0, 16)}</div>}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Badge tone={s.survey_for === "Competitor" ? "red" : "green"}>{String(s.survey_for)}</Badge>
            {s.overlap_status && <StatusBadge status={String(s.overlap_status) === "Clear" ? "Completed" : String(s.overlap_status) === "Under Review" ? "Pending Review" : String(s.overlap_status) === "Rejected" ? "Overdue" : "Open"} />}
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
              <span className="size-2.5 rounded-full" style={{ background: d.variety_color ?? "#2f9e44" }} />{String(s.variety)}
            </span>
            <a className="ml-auto inline-flex items-center gap-1 text-sm text-primary hover:underline" href={`/app/cane-survey/${encodeURIComponent(String(name))}`}>
              <ExternalLink className="size-4" />Open in Desk
            </a>
          </div>
          <section className="form-card">
            <div className="form-card-head">Field</div>
            <div className="form-card-body">
              {row("Measured area", `${Number(s.calc_area_acres ?? 0).toFixed(2)} acres (${Number(s.calc_area_kanal ?? 0).toFixed(1)} kanal)`)}
              {row("Declared cane area", `${Number(s.crop_land_acres ?? 0).toFixed(2)} acres`)}
              {row("Declared vs measured", `${Number(s.area_variance_pct ?? 0).toFixed(1)} %`)}
              {row("Plant / Ratoon", `${s.crop_type}${s.crop_type === "Ratoon" && s.ratoon_no ? ` ${s.ratoon_no}` : ""}`)}
              {row("Condition", s.crop_condition)}
              {row("Disease", s.disease ? `${s.disease} · ${s.disease_pct}%` : "Healthy")}
              {row("Expected production", `${fmtInt(Number(s.expected_production_maund ?? 0))} maund`)}
              {row("Murabba / Killa", `${s.murabba_no ?? "—"} / ${s.killa_no ?? "—"}`)}
              {row("Inside village boundary", s.inside_village ? "Yes" : "No")}
            </div>
          </section>
          <section className="form-card">
            <div className="form-card-head">Grower &amp; survey</div>
            <div className="form-card-body">
              {row("Grower", s.grower ? `${s.grower} · ${s.grower_name}` : s.competitor_mill)}
              {s.survey_for === "Company" && row("Grower type", s.grower_category)}
              {row("Field centre", s.latitude ? <a className="text-primary hover:underline" target="_blank" rel="noreferrer"
                href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}>{Number(s.latitude).toFixed(6)}, {Number(s.longitude).toFixed(6)}</a> : "—")}
              {row("CNIC", s.cnic)}
              {row("Passbook", s.passbook_no)}
              {row("Surveyed on", fmtDate(String(s.survey_date ?? "")))}
              {row("Surveyor", s.surveyor)}
              {row("GPS accuracy", s.gps_accuracy_m ? `±${s.gps_accuracy_m} m` : "—")}
              {row("Device", s.device)}
            </div>
          </section>
          {!!d.reviews.length && (
            <section className="form-card">
              <div className="form-card-head">Overlaps</div>
              <div className="form-card-body space-y-2">
                {d.reviews.map((r) => (
                  <a key={r.name} href={`/app/survey-overlap-review/${r.name}`} className="flex items-center justify-between rounded-lg border p-2 text-sm hover:bg-muted">
                    <span>{r.survey === name ? r.other_survey : r.survey} · {r.overlap_acres.toFixed(2)} acres ({r.overlap_pct.toFixed(0)}%)</span>
                    <StatusBadge status={r.status === "Open" ? "Pending Review" : r.status === "Accepted" ? "Completed" : "Cancelled"} />
                  </a>
                ))}
              </div>
            </section>
          )}
          {!!d.photos.length && (
            <section className="form-card">
              <div className="form-card-head">Photos</div>
              <div className="form-card-body grid grid-cols-2 gap-3">
                {d.photos.map((p) => (
                  <figure key={p.url} className="overflow-hidden rounded-lg border">
                    <a href={p.url} target="_blank" rel="noreferrer" className="group relative block aspect-[4/3]">
                      <img src={p.url} alt={p.caption ?? ""} className="size-full object-cover" />
                      <Maximize2 className="absolute right-1 top-1 size-4 text-white opacity-0 drop-shadow group-hover:opacity-100" />
                    </a>
                    <figcaption className="space-y-0.5 p-2 text-[11px]">
                      <div className="font-medium">{p.caption ?? "Photo"}</div>
                      {p.latitude && p.longitude && (
                        <a className="text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}>
                          {p.latitude.toFixed(6)}, {p.longitude.toFixed(6)}
                        </a>
                      )}
                      {p.taken_at && <div className="text-muted-foreground">{p.taken_at.slice(0, 16)}</div>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
