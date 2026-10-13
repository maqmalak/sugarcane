/**
 * Every sugar-mill DocType that gets a generated React list + form (/setup/d/<slug>, /survey/d/<slug>,
 * /field-force/d/<slug>), built from its DocType definition (sugarcane.api.v1.spa.form_meta) — the same mechanism as
 * the real-estate app. ENHANCERS add per-DocType actions (open on the maps, re-check overlaps, approve a device).
 */
import {
  BadgeCheck, Boxes, Building2, CalendarDays, CircleDot, Clock, Factory, Grid3x3, House, Layers, Leaf, Map, MapPin,
  MapPinned, Navigation, NotebookTabs, RefreshCw, Route, Scale, Settings, ShieldBan, Smartphone, Sprout, Target, Truck,
  Upload, UserCheck, Users, Warehouse, Bug, type LucideIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import type { DocConfig, ExtraContext, FormAction } from "@/components/doc/doc-config";
import { humanizeError, postCall } from "@/services/frappe";
import { slugOf, type Enhancer } from "./meta/buildConfig";
import { lazy, Suspense, type ReactNode } from "react";

// Map panels load lazily: they import the app's routes, which import this registry (a static import would be circular).
const JourneyPanel = lazy(() => import("./components/JourneyPanel").then((m) => ({ default: m.JourneyPanel })));
const ListMap = lazy(() => import("./components/map/ListMap").then((m) => ({ default: m.ListMap })));
const AreaGeoEditor = lazy(() => import("./pages/AreaMapPage").then((m) => ({ default: m.Editor })));
const later = (node: ReactNode) => <Suspense fallback={<div className="h-24 animate-pulse rounded-2xl border bg-muted/40" />}>{node}</Suspense>;

export type ScApp = "setup" | "survey" | "field-force";

export interface ScDoc {
  doctype: string;
  label: string;
  app: ScApp;
  group: string;
  icon: LucideIcon;
}

export const SC_DOCS: ScDoc[] = [
  // ------------------------------------------------------------------ setup
  { doctype: "Sugar Settings", label: "Sugar Settings", app: "setup", group: "Mill", icon: Settings },
  { doctype: "Crushing Season", label: "Crushing Seasons", app: "setup", group: "Mill", icon: CalendarDays },
  { doctype: "Crushing Shift", label: "Crushing Shifts", app: "setup", group: "Mill", icon: Clock },
  { doctype: "Competitor Mill", label: "Competitor Mills", app: "setup", group: "Mill", icon: Factory },
  { doctype: "Sugar Division", label: "Divisions", app: "setup", group: "Area", icon: Map },
  { doctype: "Sugar District", label: "Districts", app: "setup", group: "Area", icon: Map },
  { doctype: "Sugar Zone", label: "Zones", app: "setup", group: "Area", icon: Layers },
  { doctype: "Cane Circle", label: "Circles", app: "setup", group: "Area", icon: CircleDot },
  { doctype: "Cane Sector", label: "Sectors", app: "setup", group: "Area", icon: Grid3x3 },
  { doctype: "Cane Village", label: "Villages", app: "setup", group: "Area", icon: House },
  { doctype: "Cane Source", label: "Sources (gates, check posts, depots)", app: "setup", group: "Sources", icon: Building2 },
  { doctype: "Loading Point", label: "Loading Points", app: "setup", group: "Sources", icon: MapPin },
  { doctype: "Cane Depot", label: "Depots", app: "setup", group: "Sources", icon: Warehouse },
  { doctype: "Grower", label: "Growers", app: "setup", group: "Growers", icon: Users },
  { doctype: "Grower Passbook", label: "Passbooks", app: "setup", group: "Growers", icon: NotebookTabs },
  { doctype: "Grower Import", label: "Grower Import (Excel)", app: "setup", group: "Growers", icon: Upload },
  { doctype: "Cane Variety", label: "Cane Varieties", app: "setup", group: "Crop", icon: Sprout },
  { doctype: "Crop Disease", label: "Crop Diseases", app: "setup", group: "Crop", icon: Bug },
  { doctype: "Vehicle Type", label: "Vehicle Types", app: "setup", group: "Vehicles & Weighbridge", icon: Truck },
  { doctype: "Sugar Vehicle", label: "Vehicles", app: "setup", group: "Vehicles & Weighbridge", icon: Truck },
  { doctype: "Vehicle Lane", label: "Lanes", app: "setup", group: "Vehicles & Weighbridge", icon: Route },
  { doctype: "Weighbridge Terminal", label: "Weighbridge Terminals", app: "setup", group: "Vehicles & Weighbridge", icon: Scale },
  // ------------------------------------------------------------------ survey
  { doctype: "Cane Survey", label: "Cane Surveys", app: "survey", group: "Records", icon: Leaf },
  { doctype: "Survey Overlap Review", label: "Overlap Reviews", app: "survey", group: "Records", icon: Layers },
  // ------------------------------------------------------------------ field force
  { doctype: "Surveyor Attendance", label: "Attendance", app: "field-force", group: "Records", icon: UserCheck },
  { doctype: "Surveyor Target", label: "Targets", app: "field-force", group: "Records", icon: Target },
  { doctype: "Survey Device", label: "Devices", app: "field-force", group: "Records", icon: Smartphone },
  { doctype: "Surveyor Location Log", label: "GPS Points", app: "field-force", group: "Records", icon: Navigation },
];

export const docBase = (doctype: string) => {
  const d = SC_DOCS.find((x) => x.doctype === doctype);
  return `/${d?.app ?? "setup"}/d/${slugOf(doctype)}`;
};
export const bySlug = (slug: string) => SC_DOCS.find((d) => slugOf(d.doctype) === slug);
export const docsOf = (app: ScApp) => SC_DOCS.filter((d) => d.app === app);

/** In-app navigation from a form action (BrowserRouter listens to popstate). */
const go = (path: string) => () => {
  window.history.pushState({}, "", `/sugar${path}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

const call = (method: string, args: (c: ExtraContext) => Record<string, unknown>, done: (r: unknown) => string) => async (c: ExtraContext) => {
  try {
    const r = await postCall<unknown>(method, args(c));
    toast.success(done(r));
    c.reload();
  } catch (e) {
    toast.error(humanizeError(e));
  }
};

const withActions = (actions: FormAction[]) => (config: DocConfig): DocConfig => ({ ...config, actions: [...(config.actions ?? []), ...actions] });

/** Where the user is now, so a map opened from here can bring them back (?from=). */
const here = () => encodeURIComponent(window.location.pathname.replace(/^\/sugar/, "") + window.location.search);

const onAreaMap = (doctype: string): FormAction => ({
  label: "Open on Area Map",
  icon: MapPinned,
  show: (c: ExtraContext) => !c.isNew,
  run: (c: ExtraContext) => go(`/setup/area-map?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(c.name ?? "")}&from=${here()}`)(),
});

const GEO = ["Sugar Division", "Sugar District", "Sugar Zone", "Cane Circle", "Cane Sector", "Cane Village", "Competitor Mill"];
const JOURNEY = ["Cane Source", "Cane Depot", "Loading Point"];

/** Hierarchy levels: a map above the list, and the pin + boundary editor below the form. */
const withAreaMap = (doctype: string) => (config: DocConfig): DocConfig => ({
  ...withActions([onAreaMap(doctype)])(config),
  listHeaderExtra: later(<ListMap doctype={doctype} base={config.base} />),
  extra: (c: ExtraContext) => (
    <>
      {config.extra?.(c)}
      {c.isNew
        ? <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Save first, then set the pin and draw the boundary here.</p>
        : <section className="rounded-2xl border bg-card p-4 shadow-sm">{later(<AreaGeoEditor doctype={doctype} name={c.name ?? ""} onSaved={c.reload} />)}</section>}
    </>
  ),
});

/** Sources, depots, loading points: their pins and routes above the list; location, route and journey times in the form. */
const withJourney = (doctype: string) => (config: DocConfig): DocConfig => ({
  ...config,
  listHeaderExtra: later(<ListMap doctype={doctype} base={config.base} />),
  extra: (c: ExtraContext) => <>{config.extra?.(c)}{later(<JourneyPanel ctx={c} doctype={doctype} />)}</>,
});

export const ENHANCERS: Record<string, Enhancer> = {
  ...Object.fromEntries(GEO.map((dt) => [dt, { extend: withAreaMap(dt) }])),
  ...Object.fromEntries(JOURNEY.map((dt) => [dt, { extend: withJourney(dt) }])),
  "Sugar Settings": { extend: withActions([onAreaMap("Sugar Settings")]) },
  "Cane Survey": {
    subtitle: "Field surveys — boundary, variety, disease, photos",
    extend: withActions([
      { label: "Open on Survey Map", icon: Map, show: (c) => !c.isNew, run: (c) => go(`/survey/map?focus=${encodeURIComponent(c.name ?? "")}&from=${here()}`)() },
      {
        label: "Re-check overlaps", icon: RefreshCw, show: (c) => !c.isNew && c.docstatus === 1,
        run: call("sugarcane.eagleeye_survey.overlaps.recheck_survey", (c) => ({ name: c.name }),
          (r) => { const n = (r as { new_reviews?: string[] })?.new_reviews?.length ?? 0; return n ? `${n} new overlap review(s)` : "No new overlaps"; }),
      },
    ]),
  },
  "Survey Overlap Review": {
    extend: withActions([
      { label: "Compare on Survey Map", icon: Map, show: (c) => !c.isNew, run: (c) => go(`/survey/map?focus=${encodeURIComponent(String(c.values?.survey ?? ""))}&from=${here()}`)() },
    ]),
  },
  "Survey Device": {
    extend: withActions([
      { label: "Approve device", icon: BadgeCheck, show: (c) => !c.isNew && c.values?.status !== "Approved",
        run: call("sugarcane.api.v1.field_force.set_device_status", (c) => ({ name: c.name, status: "Approved" }), () => "Device approved") },
      { label: "Block device", icon: ShieldBan, show: (c) => !c.isNew && c.values?.status !== "Blocked",
        run: call("sugarcane.api.v1.field_force.set_device_status", (c) => ({ name: c.name, status: "Blocked" }), () => "Device blocked") },
    ]),
  },
};

export const APP_ICON: Record<ScApp, LucideIcon> = { setup: Boxes, survey: Leaf, "field-force": Users };
