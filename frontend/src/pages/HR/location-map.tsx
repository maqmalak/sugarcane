import { useFrappeGetDocList } from "frappe-react-sdk";
import { ExternalLink, MapPin, MapPinOff, ShieldAlert, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils/cn";

interface ShiftLoc { name: string; latitude: number; longitude: number; checkin_radius: number }

/** Great-circle distance in metres. */
function metres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** OpenStreetMap view of a point (embed, no API key), zoom ≈ a few hundred metres around it. */
export function OsmMap({ lat, lng, height = 300, span = 0.004 }: { lat: number; lng: number; height?: number; span?: number }) {
  const bbox = [lng - span, lat - span / 1.6, lng + span, lat + span / 1.6].map((v) => v.toFixed(6)).join(",");
  return (
    <iframe title="Location map" loading="lazy" className="w-full rounded-lg border border-border" style={{ height }}
      src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)},${lng.toFixed(6)}`} />
  );
}

/** Check-in location: map, coordinates, and whether the punch was inside the nearest shift location's geofence. */
export function CheckinMap({ values }: { values: Record<string, any> }) {
  const lat = Number(values.latitude), lng = Number(values.longitude);
  const has = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
  const { data: locs } = useFrappeGetDocList<ShiftLoc>("Shift Location", {
    fields: ["name", "latitude", "longitude", "checkin_radius"] as never, limit: 200,
  }, has ? undefined : null);

  if (!has) {
    return (
      <Card className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
        <MapPinOff className="h-5 w-5 shrink-0" />
        No location recorded for this check-in. On a new or draft check-in use <span className="font-medium text-foreground">Actions → Fetch location</span> to take it from this device.
      </Card>
    );
  }
  const nearest = (locs ?? []).filter((l) => l.latitude || l.longitude)
    .map((l) => ({ ...l, d: metres(lat, lng, Number(l.latitude), Number(l.longitude)) }))
    .sort((a, b) => a.d - b.d)[0];
  const inside = nearest ? nearest.d <= (Number(nearest.checkin_radius) || 0) : null;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><MapPin className="h-4 w-4 text-rose-500" /> Check-in location</h3>
        <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline">Open in Google Maps <ExternalLink className="h-3 w-3" /></a>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-md bg-muted px-2 py-1 font-mono">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
        {nearest ? (
          <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium",
            inside ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
            {inside ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            {inside ? "Inside" : "Outside"} {nearest.name} — {nearest.d >= 1000 ? `${(nearest.d / 1000).toFixed(1)} km` : `${nearest.d} m`} away
            {nearest.checkin_radius ? ` (radius ${nearest.checkin_radius} m)` : ""}
          </span>
        ) : <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">No shift locations set up to compare with</span>}
      </div>
      <OsmMap lat={lat} lng={lng} />
    </Card>
  );
}

/** Shift Location map with its radius noted. */
export function ShiftLocationMap({ values }: { values: Record<string, any> }) {
  const lat = Number(values.latitude), lng = Number(values.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return <Card className="p-4 text-sm text-muted-foreground">Enter the coordinates (or use Actions → Use this device's location) to see the map.</Card>;
  }
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center justify-between text-sm"><span className="font-semibold">Map</span>
        <span className="text-xs text-muted-foreground">Check-ins allowed within {values.checkin_radius || 0} m</span></div>
      <OsmMap lat={lat} lng={lng} span={Math.max(0.002, (Number(values.checkin_radius) || 150) / 40000)} />
    </Card>
  );
}
