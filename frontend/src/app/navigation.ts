/**
 * Sidebar navigation per app (first URL segment) for the MicroMax Sugar Mills app. Same shape as the real-estate /
 * MicroMax shell it was forked from: APP_NAVIGATION[segment] → groups shown in the sidebar for that app.
 */
import {
  BarChart3, Boxes, ClipboardList, FileSpreadsheet, Gauge, LayoutDashboard, Leaf, Map as MapIcon, MapPinned, Receipt,
  Sparkles, Target, Ticket, Inbox, Layers, Truck, UserCog, Users, Warehouse, Weight, Beaker, Factory, Banknote, type LucideIcon, Wand2, ScanBarcode,
} from "lucide-react";
import { SC_DOCS, docBase, type ScApp } from "@/sc/registry";

export interface NavItem {
  label: string;
  to: string;
  icon?: LucideIcon;
  /** Roles allowed to see this entry. Empty = everyone (server still enforces). */
  roles?: string[];
}
export interface NavGroup {
  /** Group heading; omitted for standalone links. */
  title?: string;
  items: NavItem[];
}

const MANAGERS = ["Cane Manager", "Cane Admin"];
const INDENT_ROLES = [...MANAGERS, "Indent Clerk", "Circle Officer", "MIS Viewer"];
const SURVEY_ROLES = [...MANAGERS, "Circle Officer", "Surveyor", "MIS Viewer"];
const FF_ROLES = [...MANAGERS, "Circle Officer"];

/** Generated list pages for an app's DocTypes, grouped as in the registry. */
function docGroups(app: ScApp, roles?: string[]): NavGroup[] {
  const groups = new Map<string, NavItem[]>();
  for (const d of SC_DOCS.filter((x) => x.app === app)) {
    groups.set(d.group, [...(groups.get(d.group) ?? []), { label: d.label, to: docBase(d.doctype), icon: d.icon, roles }]);
  }
  return [...groups.entries()].map(([title, items]) => ({ title, items }));
}

export const APP_NAVIGATION: Record<string, NavGroup[]> = {
  home: [
    {
      title: "Sugar mill",
      items: [
        { label: "EagleEye Survey", to: "/survey", icon: Leaf, roles: SURVEY_ROLES },
        { label: "Field Force", to: "/field-force", icon: UserCog, roles: FF_ROLES },
        { label: "Indenting", to: "/indenting", icon: ClipboardList, roles: INDENT_ROLES },
        { label: "Setup", to: "/setup", icon: Boxes, roles: MANAGERS },
        { label: "Report Centre", to: "/reports", icon: FileSpreadsheet },
      ],
    },
  ],
  survey: [
    {
      title: "EagleEye Survey",
      items: [
        { label: "Insights", to: "/survey", icon: Sparkles, roles: SURVEY_ROLES },
        { label: "Approvals inbox", to: "/approvals/inbox", icon: Inbox, roles: [...MANAGERS, "Circle Officer"] },
        { label: "Survey Map", to: "/survey/map", icon: MapIcon, roles: SURVEY_ROLES },
        { label: "Season Quotas", to: "/survey/quota", icon: Target, roles: [...MANAGERS, "Circle Officer", "MIS Viewer"] },
        { label: "Area Map", to: "/survey/geo", icon: MapPinned, roles: [...MANAGERS, "Circle Officer"] },
        { label: "Growers", to: "/survey/growers", icon: Users, roles: [...MANAGERS, "Circle Officer", "Cane Accountant", "MIS Viewer"] },
      ],
    },
    ...docGroups("survey", SURVEY_ROLES),
    { title: "Reports", items: [{ label: "Survey reports", to: "/reports?g=Crop%20Survey", icon: BarChart3 }] },
  ],
  "field-force": [
    {
      title: "Field Force",
      items: [
        { label: "Insights", to: "/field-force", icon: Sparkles, roles: FF_ROLES },
        { label: "Users & devices", to: "/field-force/users", icon: UserCog, roles: FF_ROLES },
        { label: "Attendance on map", to: "/survey/map?layers=attendance", icon: MapPinned, roles: FF_ROLES },
      ],
    },
    ...docGroups("field-force", FF_ROLES),
  ],
  setup: [
    { title: "Setup", items: [{ label: "Overview", to: "/setup", icon: LayoutDashboard, roles: MANAGERS }] },
    // The Area group opens with the map of the whole hierarchy (pins + boundaries), then each level's list
    ...docGroups("setup").map((g) => g.title === "Area"
      ? { ...g, items: [{ label: "Area Map", to: "/setup/area-map", icon: MapPinned, roles: [...MANAGERS, "Circle Officer"] }, ...g.items] }
      : g),
  ],
  indenting: [
    {
      title: "Indenting",
      items: [
        { label: "Insights", to: "/indenting", icon: Sparkles, roles: INDENT_ROLES },
        { label: "Generate indents", to: "/indenting/generate", icon: Wand2, roles: [...MANAGERS, "Indent Clerk"] },
        { label: "Look up an indent", to: "/indenting/lookup", icon: ScanBarcode, roles: [...INDENT_ROLES, "Token Clerk"] },
        { label: "Approvals inbox", to: "/approvals/inbox", icon: Inbox, roles: MANAGERS },
      ],
    },
    ...docGroups("indenting", INDENT_ROLES),
    { title: "Reports", items: [{ label: "Indent reports", to: "/reports?g=Indenting", icon: BarChart3 }] },
  ],
  reports: [{ title: "Reports", items: [{ label: "Report Centre", to: "/reports", icon: FileSpreadsheet }] }],
  approvals: [{ title: "Approvals", items: [{ label: "Inbox", to: "/approvals/inbox", icon: Inbox }, { label: "Overlap reviews", to: "/survey/d/survey-overlap-review", icon: Layers }] }],
  mill: [
    {
      title: "Coming in later phases",
      items: [
        { label: "Token issue (Phase 3)", to: "/mill/tokens", icon: Ticket },
        { label: "Yard board (Phase 3)", to: "/mill/yard", icon: Warehouse },
        { label: "Weighbridge (Phase 3)", to: "/mill/weighbridge", icon: Weight },
        { label: "CPR & Bilty (Phase 3)", to: "/mill/cpr", icon: Receipt },
        { label: "Depot & vehicle tracking (Phase 4)", to: "/mill/depots", icon: Truck },
        { label: "Laboratory & production (Phase 5)", to: "/mill/lab", icon: Beaker },
        { label: "Cane accounts & loans (Phase 6)", to: "/mill/accounts", icon: Banknote },
        { label: "MIS (Phase 8)", to: "/mill/mis", icon: Gauge },
        { label: "Plant (Phase 5)", to: "/mill/plant", icon: Factory },
      ],
    },
  ],
};

/** Route segment -> human label for the sidebar's app header. */
export const APP_LABELS: Record<string, string> = {
  home: "Apps",
  survey: "EagleEye Survey",
  approvals: "Approvals",
  indenting: "Indenting",
  "field-force": "Field Force",
  setup: "Sugar Setup",
  reports: "Report Centre",
  mill: "Mill Operations",
  account: "My Account",
};

/** First path segment (`"/survey/map"` -> `"survey"`, `"/"` -> `""`). */
export function appSegmentForPath(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

/** All sidebar nav groups flattened (the home sidebar only re-lists the apps, so it isn't counted). */
export const NAVIGATION: NavGroup[] = Object.entries(APP_NAVIGATION)
  .filter(([segment]) => segment !== "home")
  .flatMap(([, groups]) => groups);

/** Human-readable breadcrumb segments for a pathname. */
export const ROUTE_TITLES: Record<string, string> = {
  "": "Desktop",
  home: "Desktop",
  d: "Records",
  survey: "EagleEye Survey",
  "field-force": "Field Force",
  setup: "Setup",
  reports: "Report Centre",
  geo: "Area Map",
  map: "Survey Map",
  quota: "Season Quotas",
  "area-map": "Area Map",
  approvals: "Approvals",
  inbox: "Inbox",
  indenting: "Indenting",
  generate: "Generate",
  lookup: "Look up",
  users: "Users & Devices",
  mill: "Mill Operations",
};

export function titleForSegment(segment: string): string {
  return (
    ROUTE_TITLES[segment] ??
    segment
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ")
  );
}
