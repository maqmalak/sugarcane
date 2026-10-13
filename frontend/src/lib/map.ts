/** Map helpers shared by the survey map, the area-map editor and LocationCapture (MapLibre, same imagery as the
 * real-estate app). GeoJSON is WGS84 [lng, lat]. */
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import maplibregl, { type LngLatBoundsLike, type StyleSpecification } from "maplibre-gl";

export type LngLat = [number, number];
export type BaseLayer = "satellite" | "streets";

export const ESRI_IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export function baseStyle(kind: BaseLayer): StyleSpecification {
  if (kind === "streets") {
    return {
      version: 8,
      sources: { base: { type: "raster", tiles: [OSM], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" } },
      layers: [{ id: "base", type: "raster", source: "base" }],
    };
  }
  return {
    version: 8,
    sources: {
      base: { type: "raster", tiles: [ESRI_IMAGERY], tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri" },
      labels: { type: "raster", tiles: [ESRI_LABELS], tileSize: 256, maxzoom: 19 },
    },
    layers: [
      { id: "base", type: "raster", source: "base" },
      { id: "labels", type: "raster", source: "labels", paint: { "raster-opacity": 0.8 } },
    ],
  };
}

export const emptyFC = (): FeatureCollection => ({ type: "FeatureCollection", features: [] });

/** Geometry from what a Geolocation field stores (FeatureCollection text), a Feature, or a bare geometry. */
export function toGeometries(raw: unknown): Geometry[] {
  if (!raw) return [];
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  const o = v as { type?: string; features?: Feature[]; geometry?: Geometry; geometries?: Geometry[] };
  if (o.type === "FeatureCollection") return (o.features ?? []).flatMap((f) => toGeometries(f));
  if (o.type === "Feature") return o.geometry ? [o.geometry] : [];
  if (o.type === "GeometryCollection") return o.geometries ?? [];
  return o.type ? [o as Geometry] : [];
}

function eachPosition(g: Geometry, fn: (p: Position) => void) {
  switch (g.type) {
    case "Point": fn(g.coordinates); break;
    case "MultiPoint": case "LineString": g.coordinates.forEach(fn); break;
    case "MultiLineString": case "Polygon": g.coordinates.forEach((r) => r.forEach(fn)); break;
    case "MultiPolygon": g.coordinates.forEach((p) => p.forEach((r) => r.forEach(fn))); break;
    case "GeometryCollection": g.geometries.forEach((x) => eachPosition(x, fn)); break;
  }
}

export function boundsOf(items: (Geometry | Feature | FeatureCollection | null | undefined)[]): LngLatBoundsLike | null {
  const b = new maplibregl.LngLatBounds();
  let any = false;
  for (const it of items) {
    if (!it) continue;
    const geoms = it.type === "FeatureCollection" ? it.features.map((f) => f.geometry) : it.type === "Feature" ? [it.geometry] : [it];
    for (const g of geoms) {
      if (!g) continue;
      eachPosition(g, (p) => {
        b.extend([p[0], p[1]]);
        any = true;
      });
    }
  }
  return any ? b : null;
}

/** "#2f9e44" for a name not in the palette: a stable colour from its text. */
export function colourFor(key: string | null | undefined, palette: Record<string, string | null | undefined> = {}): string {
  if (key && palette[key]) return palette[key] as string;
  const fallback = ["#2f9e44", "#1971c2", "#e8590c", "#9c36b5", "#c2255c", "#0c8599", "#e67700", "#5c940d", "#495057", "#862e9c"];
  let h = 0;
  for (const ch of key ?? "—") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return fallback[h % fallback.length];
}

/** MapLibre "match" expression colouring features by a property. */
export function matchColour(prop: string, colours: Record<string, string>, otherwise = "#868e96") {
  const pairs = Object.entries(colours).flat();
  return pairs.length ? (["match", ["coalesce", ["get", prop], ""], ...pairs, otherwise] as unknown as maplibregl.ExpressionSpecification) : otherwise;
}

// ------------------------------------------------------------------ areas (display only; the server measures geodesically)
const ACRE_M2 = 4046.8564224;
export function areaM2(pts: LngLat[]) {
  if (pts.length < 3) return 0;
  const lat0 = (pts.reduce((a, p) => a + p[1], 0) / pts.length) * (Math.PI / 180);
  const m = pts.map(([x, y]) => [x * 111_320 * Math.cos(lat0), y * 110_574] as [number, number]);
  let a = 0;
  for (let i = 0; i < m.length; i++) {
    const [x1, y1] = m[i];
    const [x2, y2] = m[(i + 1) % m.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}
export const m2ToAcres = (m2: number) => m2 / ACRE_M2;
export const fmtAcres = (acres: number) => `${acres.toFixed(2)} acres · ${(acres * 8).toFixed(1)} kanal`;

// ------------------------------------------------------------------ pasted coordinates (from the real-estate app)
/** Coordinates from a Google Maps URL (…/@lat,lng,17z, ?q=lat,lng, !3dlat!4dlng, ll=), "lat, lng", or DMS text. */
export function parseCoordinates(text: string): LngLat | null {
  let t = text.trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    /* half-typed or not URL-encoded — parse as is */
  }
  const ok = (lat: number, lng: number): LngLat | null =>
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? [lng, lat] : null;
  const num = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const pin = new RegExp(String.raw`!3d${num}!4d${num}`).exec(t);
  if (pin) return ok(+pin[1], +pin[2]);
  for (const re of [
    new RegExp(String.raw`[?&](?:q|query|ll|destination|center)=${num},\s*${num}`),
    new RegExp(String.raw`@${num},${num}`),
    new RegExp(String.raw`^${num}\s*[, ]\s*${num}$`),
  ]) {
    const m = re.exec(t);
    if (m) return ok(+m[1], +m[2]);
  }
  const dms = /(\d{1,3})°\s*(\d{1,2})['′]\s*([\d.]+)["″]?\s*([NS])[\s,]+(\d{1,3})°\s*(\d{1,2})['′]\s*([\d.]+)["″]?\s*([EW])/i.exec(t);
  if (dms) {
    const f = (d: string, m: string, s: string, h: string) => (+d + +m / 60 + +s / 3600) * (/[SW]/i.test(h) ? -1 : 1);
    return ok(f(dms[1], dms[2], dms[3], dms[4]), f(dms[5], dms[6], dms[7], dms[8]));
  }
  return null;
}
