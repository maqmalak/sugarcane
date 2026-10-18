import {
  Banknote, Landmark, Beaker, Boxes, Warehouse, ClipboardList, Factory, FileSpreadsheet, Gauge, Leaf, MapPinned, Truck, UserCog, Users,
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
  { id: "indenting", label: "Indenting", tagline: "Permits & printing", group: "Mill Operations", icon: ClipboardList, to: "/indenting",
    roles: [...MANAGERS, "Indent Clerk", "Circle Officer", "MIS Viewer"],
    description: "Indents from surveyed area × yield × quota, scheduled to the mill's daily intake, authorized in batches and printed with barcodes.",
    colorClass: "bg-violet-500/10 text-violet-600 dark:text-violet-400", features: ["Generate & preview", "Batch authorization", "Barcode slips", "Look up"] },
  { id: "procurement", label: "Cane Procurement", tagline: "Gate · weighbridge · CPR", group: "Mill Operations", icon: Weight, to: "/procurement",
    roles: [...MANAGERS, "Token Clerk", "Gross Weighman", "Tare Weighman", "Yard Supervisor", "Cane Cashier", "Cane Accountant", "MIS Viewer"],
    description: "Gate tokens with rates, gross / tare from the weighbridge, CPRs posted to the ledgers, TPT bilty cash counter and the daily cane purchase invoice.",
    colorClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", features: ["Gate token", "Weighbridge", "Yard board", "Cash counter", "Day close"] },
  { id: "depot", label: "Depots", tagline: "Buy, hold & dispatch", group: "Mill Operations", icon: Warehouse, to: "/depot",
    roles: [...MANAGERS, "Depot User", "Gross Weighman", "Tare Weighman", "Yard Supervisor", "Cane Accountant", "MIS Viewer"],
    description: "Cane bought at depots on their own weighbridges, held in the depot, sent to the mill in contractor trucks; transit shortage, freight and commission.",
    colorClass: "bg-violet-500/10 text-violet-600 dark:text-violet-400", features: ["Depot purchase", "Dispatch trucks", "Transit shortage", "Freight"] },
  { id: "elp", label: "ELP", tagline: "Electronic loading point", group: "Mill Operations", icon: Truck, to: "/elp",
    roles: [...MANAGERS, "ELP Auditor", "Token Clerk", "Yard Supervisor", "LP Operator", "Depot User", "MIS Viewer"],
    description: "Vehicles registered at loading points and depots with GPS and snapshots, gate arrival and photo verification by the audit team.",
    colorClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400", features: ["Dashboard & map", "Gate & verification", "Verification report", "MIS reports"] },
  { id: "lab", label: "Laboratory", tagline: "Samples & DMR", group: "Mill Operations", icon: Beaker, to: "/lab",
    roles: [...MANAGERS, "Lab Chemist", "Production Manager", "MIS Viewer"],
    description: "Hourly samples of every stream, vehicle core samples (CCS, recovery by variety), mill stoppages and the Daily Manufacturing Report.",
    colorClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400", features: ["Hourly samples", "Vehicle samples", "Stoppages", "DMR"] },
  { id: "accounts", label: "Cane Accounts", tagline: "Pay growers, cess, loans", group: "Finance & Setup", icon: Banknote, to: "/accounts",
    roles: [...MANAGERS, "Cane Accountant", "Cane Cashier", "MIS Viewer"],
    description: "Payment scrolls by CPR barcode with bank files and letters, road cess deposits, grower loans and their recovery, grower statements, costing.",
    colorClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400", features: ["Payment scroll", "Bank letters", "Road cess", "Loans", "Statements"] },
  { id: "purchase", label: "Purchase & Stores", tagline: "Demand to GRN, stores", group: "Finance & Setup", icon: Boxes, to: "/purchase",
    roles: [...MANAGERS, "Stock Manager", "Stock User", "Purchase Manager", "Purchase User", "MIS Viewer", "Accounts User"],
    description: "Purchase demand, inquiry, comparative statement, local / import PO, GRN with quality inspection, store issues by department, gate passes.",
    colorClass: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400", features: ["Comparative statement", "GRN + QC", "Store issues", "Gate passes"] },
  { id: "sales", label: "Sugar Sales", tagline: "Contracts, DO, dispatch", group: "Finance & Setup", icon: Truck, to: "/sales",
    roles: [...MANAGERS, "Sales Manager", "Sales User", "Stock Manager", "MIS Viewer", "Accounts User", "Gross Weighman", "Tare Weighman"],
    description: "Dealers, agents and brokers, contracts, Delivery Orders weighed on the weighbridge, dispatch gate passes, GST invoices and receivables.",
    colorClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400", features: ["Rate list", "Dispatch weighment", "GST invoices", "Receivables"] },
  { id: "finance", label: "Finance", tagline: "GL, vouchers, tax", group: "Finance & Setup", icon: Landmark, to: "/finance",
    roles: [...MANAGERS, "Accounts Manager", "Accounts User", "MIS Viewer"],
    description: "Five-level chart of accounts, JV / BPV / BRV / CPV / CRV vouchers with batch posting and printing, cheques, PDCs, withholding, EPS, WPPF, fixed assets.",
    colorClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400", features: ["Batch posting", "Voucher printing", "PDC", "EPS / WPPF"] },
  { id: "hr", label: "HR & Payroll", tagline: "Shifts, attendance, pay", group: "Finance & Setup", icon: Users, to: "/hr",
    roles: [...MANAGERS, "HR Manager", "HR User"],
    description: "Shifts, biometric attendance, late penalties, leave, EOBI / PESSI / PF, Pakistan income tax slabs, gratuity and final settlement.",
    colorClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400", features: ["Shifts", "Biometric", "Payroll", "Income tax"] },
  { id: "mis", label: "MIS", tagline: "The mill right now", group: "Overview", icon: Gauge, to: "/mis",
    roles: [...MANAGERS, "MIS Viewer", "Cane Accountant", "Production Manager", "Lab Chemist", "Yard Supervisor"],
    description: "One live screen for the mill — cane today, yard, depots, payments, DMR, stock, plant alerts, season and circles — and the grower SMS / WhatsApp messages.",
    colorClass: "bg-teal-500/10 text-teal-600 dark:text-teal-400", features: ["Live wall", "Season progress", "Circle performance", "Grower messages"] },
  { id: "production", label: "Sugar Production", tagline: "Bags, by-products, plant", group: "Mill Operations", icon: Factory, to: "/production",
    roles: [...MANAGERS, "Production Manager", "Lab Chemist", "Cane Accountant", "MIS Viewer"],
    description: "Each approved DMR posts a Work Order and a Manufacture entry (actual cane, sugar bags, by-products at NRV); plant levels.",
    colorClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", features: ["Production entries", "Cost per bag", "Plant levels"] },
];
