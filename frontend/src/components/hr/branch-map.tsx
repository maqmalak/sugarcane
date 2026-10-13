import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/utils/cn";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  /** Bigger pins for bigger branches (e.g. headcount). */
  weight?: number;
  /** Branch Type (Restaurant, Factory…) — coloured pin with its emoji. */
  kind?: string;
}

/** Pin colour + emoji per Branch Type (kept here so the map has no page dependency). */
const KIND_PIN: Record<string, { color: string; emoji: string }> = {
  "Head Office": { color: "#6366f1", emoji: "🏢" }, Factory: { color: "#d97706", emoji: "🏭" }, Warehouse: { color: "#0284c7", emoji: "📦" },
  Restaurant: { color: "#ea580c", emoji: "🍽️" }, "Shop / Outlet": { color: "#db2777", emoji: "🏬" }, Office: { color: "#7c3aed", emoji: "💼" },
};

/** Default view when nothing is pinned yet: Pakistan. */
const DEFAULT_CENTER: L.LatLngTuple = [30.3753, 69.3451];
const DEFAULT_ZOOM = 5;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A CSS pin (no image assets, so it survives bundling): the branch type's colour + emoji, else teal with the headcount; amber when selected. */
function pin(selected: boolean, label?: string, kind?: string) {
  const k = kind ? KIND_PIN[kind] : undefined;
  const color = selected ? "#f59e0b" : k?.color ?? "#14b8a6";
  if (k) label = `<span style="font-size:13px;line-height:17px">${k.emoji}</span>`;
  return L.divIcon({
    className: "",
    iconSize: [30, 40],
    iconAnchor: [15, 38],
    popupAnchor: [0, -34],
    html: `<div style="position:relative;width:30px;height:40px;filter:drop-shadow(0 3px 4px rgb(0 0 0 / .3))">
      <svg viewBox="0 0 30 40" width="30" height="40"><path d="M15 0C6.7 0 0 6.6 0 14.8 0 26 15 40 15 40s15-14 15-25.2C30 6.6 23.3 0 15 0z" fill="${color}"/><circle cx="15" cy="14.5" r="9" fill="white"/></svg>
      <span style="position:absolute;top:6px;left:0;width:30px;text-align:center;font:600 10px/17px system-ui,sans-serif;color:${color}">${label ?? ""}</span>
    </div>`,
  });
}

/**
 * OpenStreetMap view of branch locations. Clicking a pin calls `onSelect`; with `onPick` set, clicking the
 * map itself reports the coordinates (used to place a branch while editing it).
 */
export function BranchMap({
  points,
  selectedId,
  onSelect,
  onPick,
  className,
}: {
  points: MapPoint[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onPick?: (lat: number, lng: number) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef<Map<string, L.Marker>>(new Map());
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  // Create the map once.
  useEffect(() => {
    if (!host.current || map.current) return;
    const m = L.map(host.current, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, scrollWheelZoom: true, attributionControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => pickRef.current?.(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // The container can be sized after mount (dialogs, grids) — re-measure once layout settles.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // Redraw pins when the data changes, and frame them.
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    markers.current.clear();
    const maxW = Math.max(1, ...points.map((p) => p.weight ?? 0));
    points.forEach((p) => {
      const marker = L.marker([p.lat, p.lng], { icon: pin(p.id === selectedId, p.weight ? String(p.weight) : undefined, p.kind), riseOnHover: true })
        .bindPopup(
          `<div style="min-width:140px"><strong>${escapeHtml(p.title)}</strong>${p.subtitle ? `<br/><span style="color:#64748b">${escapeHtml(p.subtitle)}</span>` : ""}</div>`,
        )
        .on("click", () => selectRef.current?.(p.id));
      if (p.weight) marker.setZIndexOffset(Math.round((p.weight / maxW) * 100));
      marker.addTo(g);
      markers.current.set(p.id, marker);
    });
    if (points.length === 1) m.setView([points[0].lat, points[0].lng], Math.max(m.getZoom(), 12));
    else if (points.length > 1) m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple)), { padding: [40, 40], maxZoom: 13 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points)]);

  // Highlight + fly to the selected pin.
  useEffect(() => {
    markers.current.forEach((marker, id) => {
      const p = points.find((x) => x.id === id);
      marker.setIcon(pin(id === selectedId, p?.weight ? String(p.weight) : undefined, p?.kind));
    });
    const sel = selectedId ? markers.current.get(selectedId) : undefined;
    if (sel && map.current) {
      map.current.flyTo(sel.getLatLng(), Math.max(map.current.getZoom(), 12), { duration: 0.6 });
      sel.openPopup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={host} className={cn("z-0 h-80 w-full overflow-hidden rounded-lg", onPick && "cursor-crosshair", className)} />;
}
