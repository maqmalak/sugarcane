/**
 * Sidebar navigation per app (first URL segment) for the MicroMax Sugar Mills app. Same shape as the real-estate /
 * MicroMax shell it was forked from: APP_NAVIGATION[segment] → groups shown in the sidebar for that app.
 */
import {
  BarChart3, Boxes, ClipboardList, FileSpreadsheet, Gauge, LayoutDashboard, Leaf, Map as MapIcon, MapPinned,
  Sparkles, Target, Ticket, Inbox, Layers, Truck, UserCog, Users, Warehouse, Weight, Beaker, Factory, Banknote, MessageSquare, BookOpen, type LucideIcon, Wand2, ScanBarcode, ShieldCheck, AlertTriangle, MapPin,
Scale, MonitorSmartphone, ClipboardCheck, PlayCircle, } from "lucide-react";
import { SC_DOCS, docBase, type ScApp } from "@/sc/registry";
import { ANALYTICS_NAV, FINANCE_NAV, HR_NAV, PAYROLL_NAV, SALES_NAV, STORE_NAV } from "@/app/erp-navigation";

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
const ELP_ROLES = [...MANAGERS, "ELP Auditor", "Token Clerk", "Yard Supervisor", "LP Operator", "Depot User", "MIS Viewer"];
const PROC_ROLES = [...MANAGERS, "Token Clerk", "Gross Weighman", "Tare Weighman", "Yard Supervisor", "Cane Cashier", "Cane Accountant", "MIS Viewer"];
const DEPOT_ROLES = [...MANAGERS, "Depot User", "Gross Weighman", "Tare Weighman", "Yard Supervisor", "Cane Accountant", "MIS Viewer"];
const LAB_ROLES = [...MANAGERS, "Lab Chemist", "Production Manager", "MIS Viewer"];
const ACC_ROLES = [...MANAGERS, "Cane Accountant", "Cane Cashier", "MIS Viewer"];
const STORE_ROLES = [...MANAGERS, "Stock Manager", "Stock User", "Purchase Manager", "Purchase User", "MIS Viewer", "Accounts User"];
const SALES_ROLES = [...MANAGERS, "Sales Manager", "Sales User", "Stock Manager", "MIS Viewer", "Accounts User", "Gross Weighman", "Tare Weighman"];
const MIS_ROLES = [...MANAGERS, "MIS Viewer", "Cane Accountant", "Production Manager", "Lab Chemist", "Yard Supervisor"];
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
        { label: "ELP (loading points)", to: "/elp", icon: Truck, roles: ELP_ROLES },
        { label: "Setup", to: "/setup", icon: Boxes, roles: MANAGERS },
        { label: "Report Centre", to: "/reports", icon: FileSpreadsheet },
        { label: "Help — user manuals", to: "/help", icon: BookOpen },
      ],
    },
  ],
  help: [{ title: "Help", items: [{ label: "User manuals", to: "/help", icon: BookOpen }, { label: "Guides & videos", to: "/help/guides", icon: PlayCircle }] }],
  survey: [
    {
      title: "EagleEye Survey",
      items: [
        { label: "Insights", to: "/survey", icon: Sparkles, roles: SURVEY_ROLES },
        { label: "Approvals inbox", to: "/approvals/inbox", icon: Inbox, roles: [...MANAGERS, "Circle Officer"] },
        { label: "Survey Map", to: "/survey/map", icon: MapIcon, roles: SURVEY_ROLES },
        { label: "Loan field surveys", to: "/survey/loan-surveys", icon: ClipboardCheck, roles: [...MANAGERS, "Surveyor", "Circle Officer"] },
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
  elp: [
    {
      title: "ELP",
      items: [
        { label: "Dashboard", to: "/elp", icon: Sparkles, roles: ELP_ROLES },
        { label: "Gate & verification", to: "/elp/gate", icon: ScanBarcode, roles: ELP_ROLES },
        { label: "On the way", to: "/elp/board?status=Pending", icon: Truck, roles: ELP_ROLES },
        { label: "Pending verification", to: "/elp/board?status=Arrived", icon: ShieldCheck, roles: ELP_ROLES },
        { label: "Overdue", to: "/elp/board?status=Overdue", icon: AlertTriangle, roles: ELP_ROLES },
      ],
    },
    ...docGroups("elp", ELP_ROLES),
    { title: "Points", items: [
      { label: "Loading points", to: "/setup/d/loading-point", icon: MapPin, roles: MANAGERS },
      { label: "Depots", to: "/setup/d/cane-depot", icon: Warehouse, roles: MANAGERS },
    ] },
    { title: "Reports", items: [{ label: "ELP MIS reports", to: "/reports?g=ELP", icon: BarChart3 }] },
  ],
  procurement: [
    {
      title: "Cane procurement",
      items: [
        { label: "Intake dashboard", to: "/procurement", icon: Sparkles, roles: PROC_ROLES },
        { label: "Gate · token issue", to: "/procurement/gate", icon: Ticket, roles: [...MANAGERS, "Token Clerk"] },
        { label: "Gross · 1st weight", to: "/procurement/gross", icon: Weight, roles: [...MANAGERS, "Gross Weighman"] },
        { label: "Tare · 2nd weight", to: "/procurement/tare", icon: Scale, roles: [...MANAGERS, "Tare Weighman"] },
        { label: "Weighbridge (both)", to: "/procurement/weighbridge", icon: Weight, roles: [...MANAGERS, "Gross Weighman", "Tare Weighman"] },
        { label: "Yard board", to: "/procurement/yard", icon: Warehouse, roles: PROC_ROLES },
        { label: "TPT cash counter", to: "/procurement/counter", icon: Banknote, roles: [...MANAGERS, "Cane Cashier", "Cane Accountant"] },
        { label: "Daily cashier summary", to: "/procurement/cashier-summary", icon: ClipboardList, roles: [...MANAGERS, "Cane Cashier", "Cane Accountant"] },
        { label: "Payee displays", to: "/procurement/displays", icon: MonitorSmartphone, roles: [...MANAGERS, "Cane Cashier", "Gross Weighman", "Tare Weighman"] },
        { label: "Day close", to: "/procurement/day-close", icon: ClipboardList, roles: [...MANAGERS, "Cane Accountant"] },
      ],
    },
    ...docGroups("procurement", PROC_ROLES),
    { title: "Reports", items: [{ label: "Procurement reports", to: "/reports?g=Procurement", icon: BarChart3 }] },
  ],
  depot: [
    {
      title: "Depots",
      items: [
        { label: "Depot dashboard", to: "/depot", icon: Sparkles, roles: DEPOT_ROLES },
        { label: "Buy cane at a depot", to: "/procurement/gate?depot=", icon: Ticket, roles: [...MANAGERS, "Depot User"] },
        { label: "Dispatch trucks", to: "/depot/dispatch", icon: Truck, roles: DEPOT_ROLES },
        { label: "Weighbridge", to: "/procurement/weighbridge", icon: Weight, roles: [...MANAGERS, "Depot User", "Gross Weighman", "Tare Weighman"] },
      ],
    },
    ...docGroups("depot", DEPOT_ROLES),
    { title: "Setup", items: [{ label: "Depots", to: "/setup/d/cane-depot", icon: Warehouse, roles: MANAGERS },
      { label: "Weighbridge terminals", to: "/setup/d/weighbridge-terminal", icon: Weight, roles: MANAGERS }] },
    { title: "Reports", items: [{ label: "Depot reports", to: "/reports?g=Depot", icon: BarChart3 }] },
  ],
  lab: [
    {
      title: "Laboratory",
      items: [
        { label: "Lab dashboard", to: "/lab", icon: Sparkles, roles: LAB_ROLES },
        { label: "Hourly samples", to: "/lab/entry", icon: Beaker, roles: LAB_ROLES },
        { label: "Vehicle samples", to: "/lab/vehicle", icon: Truck, roles: LAB_ROLES },
        { label: "Mill stoppages", to: "/lab/stoppages", icon: Gauge, roles: LAB_ROLES },
        { label: "Daily manufacturing report", to: "/lab/dmr", icon: ClipboardList, roles: LAB_ROLES },
      ],
    },
    ...docGroups("lab", LAB_ROLES),
    { title: "Reports", items: [{ label: "Laboratory reports", to: "/reports?g=Laboratory", icon: BarChart3 }] },
  ],
  production: [
    {
      title: "Sugar production",
      items: [
        { label: "Production", to: "/production", icon: Factory, roles: LAB_ROLES },
        { label: "Plant levels", to: "/production/plant", icon: Gauge, roles: LAB_ROLES },
        { label: "Daily manufacturing report", to: "/lab/dmr", icon: ClipboardList, roles: LAB_ROLES },
      ],
    },
    ...docGroups("production", LAB_ROLES),
    { title: "Reports", items: [{ label: "Production reports", to: "/reports?g=Production", icon: BarChart3 },
      { label: "Cost of production", to: `/reports?r=${encodeURIComponent("Cost of Production Statement")}`, icon: BarChart3 },
      { label: "Costing reports", to: "/reports?g=Costing", icon: BarChart3 }] },
  ],
  accounts: [
    {
      title: "Cane accounts",
      items: [
        { label: "Dashboard", to: "/accounts", icon: Sparkles, roles: ACC_ROLES },
        { label: "Payment scroll", to: "/accounts/scroll", icon: ScanBarcode, roles: ACC_ROLES },
        { label: "Road cess", to: "/accounts/cess", icon: Banknote, roles: ACC_ROLES },
        { label: "Grower loans", to: "/accounts/loans", icon: Users, roles: [...ACC_ROLES, "Circle Officer"] },
        { label: "Loan field surveys", to: "/accounts/loan-surveys", icon: ClipboardCheck, roles: [...ACC_ROLES, "Circle Officer"] },
        { label: "Grower statement", to: "/accounts/grower", icon: FileSpreadsheet, roles: [...ACC_ROLES, "Circle Officer"] },
        { label: "Contractor bills", to: "/accounts/contractors", icon: Truck, roles: ACC_ROLES },
        { label: "Document vault", to: "/accounts/documents", icon: Layers, roles: [...ACC_ROLES, "Circle Officer"] },
      ],
    },
    ...docGroups("accounts", ACC_ROLES),
    { title: "Reports", items: [{ label: "Cane accounts reports", to: "/reports?g=Cane%20Accounts", icon: BarChart3 }, { label: "Costing", to: "/reports?g=Costing", icon: BarChart3 }] },
  ],
  reports: [{ title: "Reports", items: [{ label: "Report Centre", to: "/reports", icon: FileSpreadsheet }] }],
  approvals: [{ title: "Approvals", items: [{ label: "Inbox", to: "/approvals/inbox", icon: Inbox }, { label: "Overlap reviews", to: "/survey/d/survey-overlap-review", icon: Layers }] }],
  purchase: [...STORE_NAV, ...docGroups("purchase", STORE_ROLES)],
  sales: [...SALES_NAV, ...docGroups("sales", SALES_ROLES)],
  finance: [...FINANCE_NAV],
  hr: [...HR_NAV],
  import: [...STORE_NAV, ...docGroups("purchase", STORE_ROLES)],
  inventory: [...STORE_NAV, ...docGroups("purchase", STORE_ROLES)],
  masters: [...STORE_NAV, ...docGroups("purchase", STORE_ROLES)],
  selling: [...SALES_NAV, ...docGroups("sales", SALES_ROLES)],
  accounting: FINANCE_NAV,
  payroll: PAYROLL_NAV,
  analytics: ANALYTICS_NAV,
  mis: [
    {
      title: "MIS",
      items: [
        { label: "Mill right now", to: "/mis", icon: Gauge, roles: MIS_ROLES },
        { label: "Grower messages", to: "/mis/messages", icon: MessageSquare, roles: MIS_ROLES },
      ],
    },
    ...docGroups("mis", MIS_ROLES),
    { title: "Reports", items: [{ label: "MIS reports", to: "/reports?g=MIS", icon: BarChart3 }] },
  ],
};

/** Route segment -> human label for the sidebar's app header. */
export const APP_LABELS: Record<string, string> = {
  home: "Apps",
  survey: "EagleEye Survey",
  approvals: "Approvals",
  indenting: "Indenting",
  elp: "ELP",
  procurement: "Cane Procurement",
  depot: "Depots",
  lab: "Laboratory",
  production: "Sugar Production",
  accounts: "Cane Accounts",
  "field-force": "Field Force",
  setup: "Sugar Setup",
  reports: "Report Centre",
  mis: "MIS",
  help: "Help",
  purchase: "Purchase & Stores",
  sales: "Sugar Sales",
  finance: "Finance",
  hr: "HR & Payroll",
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
  procurement: "Cane Procurement",
  weighbridge: "Weighbridge",
  gross: "Gross · 1st weight",
  tare: "Tare · 2nd weight",
  displays: "Payee displays",
  "cashier-summary": "Daily cashier summary",
  "loan-surveys": "Loan field surveys",
  yard: "Yard",
  counter: "Cash Counter",
  "day-close": "Day Close",
  depot: "Depots",
  dispatch: "Dispatch",
  lab: "Laboratory",
  entry: "Hourly Samples",
  vehicle: "Vehicle Samples",
  stoppages: "Stoppages",
  dmr: "DMR",
  production: "Production",
  plant: "Plant Levels",
  accounts: "Cane Accounts",
  scroll: "Payment Scroll",
  cess: "Road Cess",
  loans: "Loans",
  grower: "Grower Statement",
  documents: "Document Vault",
  contractors: "Contractor Bills",
  generate: "Generate",
  lookup: "Look up",
  elp: "ELP",
  gate: "Gate",
  board: "Loads",
  users: "Users & Devices",
  mis: "MIS",
  help: "Help",
  messages: "Grower Messages",
  purchase: "Purchase & Stores",
  sales: "Sugar Sales",
  finance: "Finance",
  hr: "HR & Payroll",
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
