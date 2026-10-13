/**
 * Journey to mill — on the Cane Source / Cane Depot / Loading Point forms: the location pin, the road route to the mill
 * and the standard journey times (to the mill loaded, back empty, round trip). Figures update live as the pin or route
 * changes; the server recalculates them the same way on Save (sugarcane.journey).
 */
import type { FeatureCollection } from "geojson";
import { useFrappeGetCall } from "frappe-react-sdk";
import { ArrowLeftRight, Clock, Factory, MapPin, Route, Ruler, Truck } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import type { ExtraContext } from "@/components/doc/doc-config";
import { LocationCapture } from "@/sc/components/map/LocationCapture";
import { RouteCapture, linePoints, pathKm } from "@/sc/components/map/RouteCapture";
import { cn } from "@/sc/lib/utils";
import type { LngLat } from "@/sc/lib/map";

interface Standards { road_factor: number; loaded_speed_kmph: number; empty_speed_kmph: number; journey_allowance_min: number }
interface SourcesMap extends FeatureCollection { mill: { latitude: number; longitude: number } | null; standards: Standards }

export const minutes = (m: number | null | undefined) => {
  const v = Math.round(Number(m) || 0);
  if (!v) return "—";
  return v >= 60 ? `${Math.floor(v / 60)} h ${String(v % 60).padStart(2, "0")} min` : `${v} min`;
};

export function JourneyPanel({ ctx, doctype }: { ctx: ExtraContext; doctype: string }) {
  const { data } = useFrappeGetCall<{ message: SourcesMap }>("sugarcane.journey.sources_map", undefined, "sc-sources-map");
  const sm = data?.message;
  const v = ctx.values as Record<string, unknown>;
  const lat = Number(v.latitude) || 0;
  const lng = Number(v.longitude) || 0;
  const pin: LngLat | null = lat && lng ? [lng, lat] : null;
  const mill: LngLat | null = sm?.mill ? [sm.mill.longitude, sm.mill.latitude] : null;
  const std = sm?.standards;
  const route = (v.route as string) || "";
  const readOnly = ctx.readOnly;

  const calc = useMemo(() => {
    const straight = pin && mill ? pathKm([pin, mill]) : 0;
    const drawn = pathKm(linePoints(route));
    let road = 0;
    let basis = "";
    if (drawn) { road = drawn; basis = "Drawn route"; }
    else if (v.road_distance_manual && Number(v.distance_km)) { road = Number(v.distance_km); basis = "Entered"; }
    else if (straight && std) { road = straight * std.road_factor; basis = `Estimated (straight × ${std.road_factor})`; }
    const manual = !!v.journey_time_manual;
    const to = manual ? Number(v.journey_to_mill_min) || 0 : road && std ? Math.round((60 * road) / std.loaded_speed_kmph + std.journey_allowance_min) : 0;
    const back = manual ? Number(v.journey_back_min) || 0 : road && std ? Math.round((60 * road) / std.empty_speed_kmph) : 0;
    return { straight, road, basis, to, back, manual };
  }, [pin?.[0], pin?.[1], mill?.[0], mill?.[1], route, v.road_distance_manual, v.distance_km, v.journey_time_manual, v.journey_to_mill_min, v.journey_back_min, std]); // eslint-disable-line react-hooks/exhaustive-deps

  // other sources (and their routes) for orientation, without this record
  const context = useMemo<FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: (sm?.features ?? []).filter((f) => !(f.properties?.doctype === doctype && f.properties?.name === ctx.name)),
  }), [sm, doctype, ctx.name]);

  const setPin = (p: LngLat | null) => {
    if (!p) return;
    ctx.patch({ latitude: Number(p[1].toFixed(6)), longitude: Number(p[0].toFixed(6)) });
    toast.success("Location set — press Save to keep it");
  };
  const setRoute = (r: string) => {
    ctx.patch({ route: r });
    toast.success(r ? "Route drawn — press Save to keep it" : "Route cleared — press Save to keep it");
  };

  const cards = [
    { icon: Ruler, label: "Straight line", value: calc.straight ? `${calc.straight.toFixed(1)} km` : "—", sub: mill ? "mill pin → this pin" : "Set the mill pin in Sugar Settings" },
    { icon: Route, label: "Road distance", value: calc.road ? `${calc.road.toFixed(1)} km` : "—", sub: calc.basis || "Set a pin or enter the distance", tone: "amber" },
    { icon: Truck, label: "To mill (loaded)", value: minutes(calc.to), sub: calc.manual ? "entered by hand" : std ? `${std.loaded_speed_kmph} km/h + ${std.journey_allowance_min} min allowance` : "", tone: "teal" },
    { icon: ArrowLeftRight, label: "Back (empty)", value: minutes(calc.back), sub: calc.manual ? "entered by hand" : std ? `${std.empty_speed_kmph} km/h` : "", tone: "sky" },
    { icon: Clock, label: "Round trip", value: minutes(calc.to + calc.back), sub: "standard turnaround of a vehicle", tone: "violet" },
  ];
  const tones: Record<string, string> = { amber: "text-amber-500", teal: "text-teal-500", sky: "text-sky-500", violet: "text-violet-500" };

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Factory className="size-5 text-primary" />
        <h3 className="text-base font-semibold">Journey to mill</h3>
        <span className="text-xs text-muted-foreground">Distance and standard time are recalculated on Save. Standards are in Sugar Settings → Cane Journey Standards.</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-background/40 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><c.icon className={cn("size-4", c.tone ? tones[c.tone] : "text-primary")} />{c.label}</div>
            <div className="mt-1 text-xl font-bold tabular-nums">{c.value}</div>
            <div className="truncate text-[11px] text-muted-foreground" title={c.sub}>{c.sub}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 2xl:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><MapPin className="size-4 text-orange-500" />Location</div>
          <LocationCapture key={`${lat},${lng}`} mode="point" title="Location pin" initialPoint={pin} context={context}
            readOnly={readOnly} onApply={(r) => setPin(r.point)} />
        </div>
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Route className="size-4 text-amber-500" />Road route</div>
          <RouteCapture pin={pin} mill={mill} initial={route || null} context={context} readOnly={readOnly} onChange={setRoute} />
        </div>
      </div>
    </section>
  );
}
