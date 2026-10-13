import {
  Banknote, Beaker, Boxes, ClipboardList, Factory, FileSpreadsheet, Gauge, Leaf, MapPinned, Receipt, Truck, UserCog, Users,
  Weight, type LucideIcon,
} from "lucide-react";

export interface AppTile {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  to: string;
  /** Curated, dark-mode-safe Tailwind color pair (same convention as ui/badge.tsx). */
  colorClass: string;
  /** Roles allowed to see this tile. Empty = everyone (server still enforces). */
  roles?: string[];
  /** Omit from the pre-login page's module preview (doesn't make sense signed out). */
  hideOnLogin?: boolean;
  /**
   * Real ERPNext module name(s) this tile corresponds to (any one match is
   * enough). When set, the post-login Desktop hides the tile unless a
   * visible, non-hidden Workspace for that module actually exists on this
   * site — so an ERPNext deployment without e.g. Payroll installed won't
   * show a dead Payroll tile. Left undefined for tiles that are core to this
   * app itself or built on doctypes spanning multiple ERPNext modules, which
   * always show.
   */
  module?: string[];
  /**
   * Frappe apps this tile's pages need on the backend (all of them). The Desktop, the home sidebar and the
   * route itself are hidden on a site that lacks any of them (see useInstalledApps) — e.g. Production needs
   * `micromax`, so the school site shows no Production tile. Undefined = core ERPNext/Frappe, always shown.
   */
  apps?: string[];
  /**
   * Curated capability bullets (copied from the public website's module
   * catalogue, website-data.ts MODULES) shown under the tile's description.
   * When unset, the Desktop falls back to real, live doctype names for
   * `module` — accurate, but the first few doctypes ERPNext returns for a
   * module aren't necessarily its most meaningful ones (e.g. Accounting
   * surfaced "Account Closing Balance" ahead of "Journal Entry").
   */
  features?: string[];
  /** Short line under the title (a few words). */
  tagline?: string;
  /** Desktop section this tile sits in (see APP_GROUPS). */
  group?: string;
}

/** Desktop sections, in display order. */
export const APP_GROUPS = ["Overview", "Cane", "Mill Operations", "Finance & Setup", "System"] as const;

const MANAGERS = ["Cane Manager", "Cane Admin"];
const soon = "bg-slate-500/10 text-slate-600 dark:text-slate-400";

/** Desktop app-launcher — one tile per module, shown after login, in this order. */
export const APPS: AppTile[] = [
  { id: "survey", label: "EagleEye Survey", tagline: "Crop survey & maps", group: "Cane", icon: Leaf, to: "/survey",
    roles: [...MANAGERS, "Circle Officer", "Surveyor", "MIS Viewer"],
    description: "Surveyed cane area, expected production, varieties, disease, overlaps and the bird's-eye survey map.",
    colorClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    features: ["Survey insights", "Survey map (satellite)", "Overlap control", "Competitor cane"] },
  { id: "field-force", label: "Field Force", tagline: "Surveyors & attendance", group: "Cane", icon: UserCog, to: "/field-force",
    roles: [...MANAGERS, "Circle Officer"],
    description: "Attendance with selfies and geofence, GPS tracks, targets vs achievement, phones and user access.",
    colorClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    features: ["Attendance insights", "Targets", "Devices", "Users & circles"] },
  { id: "growers", label: "Growers", tagline: "Registry & passbooks", group: "Cane", icon: Users, to: "/survey/growers",
    roles: [...MANAGERS, "Circle Officer", "Cane Accountant", "MIS Viewer"],
    description: "Passbook and non-passbook growers by circle and village, with CNIC, bank details and photo.",
    colorClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400", features: ["Search by CNIC / ID", "Passbooks", "Excel import"] },
  { id: "geo", label: "Area Map", tagline: "Pins & boundaries", group: "Cane", icon: MapPinned, to: "/survey/geo",
    roles: [...MANAGERS, "Circle Officer"],
    description: "Pins and boundaries for the mill, competitor mills and every division, district, zone, circle, sector and village.",
    colorClass: "bg-teal-500/10 text-teal-600 dark:text-teal-400", features: ["Company & competitor mills", "Circles", "Villages"] },
  { id: "reports", label: "Report Centre", tagline: "Preview, Excel & PDF", group: "Overview", icon: FileSpreadsheet, to: "/reports",
    description: "Every sugar-mill report with filters, charts, totals and Excel / PDF downloads.",
    colorClass: "bg-violet-500/10 text-violet-600 dark:text-violet-400", features: ["Crop survey", "Attendance", "Performance"] },
  { id: "setup", label: "Sugar Setup", tagline: "Masters & settings", group: "Finance & Setup", icon: Boxes, to: "/setup", roles: MANAGERS,
    description: "Sugar Settings, seasons, shifts, area hierarchy, sources, depots, varieties, vehicles and weighbridge terminals.",
    colorClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400", features: ["Seasons & rates", "Area hierarchy", "Vehicles"] },
  // later phases (coming-soon pages)
  { id: "indenting", label: "Indenting", tagline: "Phase 2", group: "Mill Operations", icon: ClipboardList, to: "/mill/indenting",
    description: "Indents from surveyed area × yield × quota, bulk printing with authorisation.", colorClass: soon },
  { id: "weighbridge", label: "Gate & Weighbridge", tagline: "Phase 3", group: "Mill Operations", icon: Weight, to: "/mill/weighbridge",
    description: "Tokens, yard board, gross / tare weighment through the hardware agent.", colorClass: soon },
  { id: "cpr", label: "CPR & Bilty", tagline: "Phase 3", group: "Mill Operations", icon: Receipt, to: "/mill/cpr",
    description: "Cane purchase receipts, TPT bilty cash counter, daily cane purchase invoice.", colorClass: soon },
  { id: "depots", label: "Depots & Vehicles", tagline: "Phase 4", group: "Mill Operations", icon: Truck, to: "/mill/depots",
    description: "Loading-point vehicle registration and depot purchase.", colorClass: soon },
  { id: "lab", label: "Laboratory & Production", tagline: "Phase 5", group: "Mill Operations", icon: Beaker, to: "/mill/lab",
    description: "Hourly samples, daily manufacturing report, production entries.", colorClass: soon },
  { id: "accounts", label: "Cane Accounts", tagline: "Phase 6", group: "Finance & Setup", icon: Banknote, to: "/mill/accounts",
    description: "Payment scrolls, road cess deposits, grower ledgers and loans.", colorClass: soon },
  { id: "mis", label: "MIS", tagline: "Phase 8", group: "Overview", icon: Gauge, to: "/mill/mis",
    description: "Realtime crushing, plant levels and management dashboards.", colorClass: soon },
  { id: "plant", label: "Plant", tagline: "Phase 5", group: "Mill Operations", icon: Factory, to: "/mill/plant",
    description: "Steam, juice, water and molasses levels from the plant system.", colorClass: soon },
];
