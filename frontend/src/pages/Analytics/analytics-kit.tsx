import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link, NavLink } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import { Area, AreaChart as RCArea, ResponsiveContainer } from "recharts";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Factory,
  Gauge,
  Info,
  Timer,
  Landmark,
  ClipboardCheck,
  Container,
  Ship,
  Truck,
  ClipboardList,
  Cog,
  ListChecks,
  List as ListIcon,
  Minus,
  Package,
  Scale,
  ShoppingCart,
  TrendingUp,
  Users2,
  Users,
  UserPlus,
  UserMinus,
  UserCheck,
  UserRound,
  CalendarCheck,
  CalendarX,
  Plane,
  Wallet,
  CircleMinus,
  Receipt,
  Percent,
  Hash,
  Clock,
  ShieldCheck,
  Globe,
  Coins,
  Boxes,
  type LucideIcon,
} from "lucide-react";
import { AreaChart, BarChart, BarGauge, ComboChart, DonutChart, LineChart, PieChart } from "@/components/charts/charts";
import { BarList } from "@/components/doc/dashboard-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FrappeLinkField } from "@/components/forms/field-primitives";
import { cn } from "@/utils/cn";
import { compactNumber, formatMoney, formatNumber } from "@/utils/currency";
import { todayISO } from "@/utils/dates";
import { useInstalledApps } from "@/hooks/useInstalledApps";

// ------------------------------------------------------------------ API shape
/** Shape returned by `mm_core.dashboards.get_dashboard` (see apps/mm_core/mm_core/dashboards.py). */
export interface Kpi {
  key: string;
  label: string;
  value: number;
  format: "money" | "number" | "percent";
  avg: number | null;
  avg_label: string;
  delta: number | null;
  spark: number[];
  invert: boolean;
  hint: string | null;
}
export interface Widget {
  id: string;
  title: string;
  subtitle: string | null;
  type: "combo" | "bar" | "line" | "area" | "donut" | "pie" | "barlist" | "gauge" | "table";
  data: Record<string, any>[];
  series: { key: string; label: string; color?: string; type?: "bar" | "line"; axis?: "left" | "right"; format?: "money" | "number" | "percent"; dashed?: boolean }[];
  xKey: string;
  money: boolean;
  span: 1 | 2 | 3;
  percent?: boolean;
  stacked?: boolean;
  dualAxis?: boolean;
  zoom?: boolean;
  /** Bar charts: a field on each row holding that bar's own colour. */
  colorKey?: string;
  /** Bar charts: tilt the category labels so long names fit. */
  angledLabels?: boolean;
  /** Table widgets: columns (see TableColumn). */
  columns?: { key: string; label: string; align?: "left" | "right"; format?: "money" | "number" | "percent" | "days"; doctype?: string; doctype_key?: string }[];
}
export interface Insight {
  level: "critical" | "warning" | "positive" | "info";
  title: string;
  text: string;
  metric: string | number | null;
  module: string;
}
export interface DashboardData {
  period: { from: string; to: string; months: string[] };
  kpis: Kpi[];
  widgets: Widget[];
  insights?: Insight[];
  generated_at?: string;
}

export type ModuleId = "accounts" | "purchase" | "procurement" | "production" | "wo_analysis" | "jc_analysis" | "stock" | "sales" | "so_analysis" | "do_analysis" | "export_analysis" | "import_analysis" | "quality" | "hr" | "payroll" | "assets" | "financials";

/** Module dashboards, in tab order (the Executive summary tab comes first, see AnalyticsTabs). */
export const MODULES: { id: ModuleId; label: string; icon: LucideIcon; subtitle: string; accent: string }[] = [
  { id: "accounts", label: "Accounts", icon: Landmark, subtitle: "Profit & loss, cash, receivables and payables", accent: "hsl(221 83% 53%)" },
  { id: "purchase", label: "Purchase", icon: ShoppingCart, subtitle: "Orders, bills, suppliers and spend", accent: "hsl(35 92% 50%)" },
  { id: "procurement", label: "Buying Cycle", icon: Timer, subtitle: "Cycle days, PO coverage, vendor rate variation and PPV", accent: "hsl(20 90% 48%)" },
  { id: "production", label: "Production", icon: Factory, subtitle: "Output vs plan, yield, waste, OPS and downtime", accent: "hsl(173 80% 36%)" },
  { id: "wo_analysis", label: "WO Analysis", icon: Cog, subtitle: "Work order completion, schedule adherence, ageing, yield / OPS variance and downtime", accent: "hsl(187 85% 38%)" },
  { id: "jc_analysis", label: "Job Card Analysis", icon: ListChecks, subtitle: "Operation efficiency, queue wait, process loss, machine and operator performance", accent: "hsl(199 89% 40%)" },
  { id: "stock", label: "Stock", icon: Package, subtitle: "Stock value, movements and production output", accent: "hsl(199 89% 48%)" },
  { id: "sales", label: "Sales", icon: TrendingUp, subtitle: "Orders, invoicing, collections and customers", accent: "hsl(160 84% 39%)" },
  { id: "so_analysis", label: "SO Analysis", icon: ClipboardList, subtitle: "Order book, fulfilment, OTIF and overdue orders", accent: "hsl(142 71% 35%)" },
  { id: "export_analysis", label: "Export Analysis", icon: Ship, subtitle: "Export orders, destinations, LCs and shipments", accent: "hsl(221 83% 45%)" },
  { id: "import_analysis", label: "Import Analysis", icon: Container, subtitle: "Imported materials, landed cost, duties, transit and port dwell", accent: "hsl(28 80% 45%)" },
  { id: "do_analysis", label: "DO Analysis", icon: Truck, subtitle: "Deliveries, timeliness vs promise and billing speed", accent: "hsl(186 72% 38%)" },
  { id: "hr", label: "HR", icon: Users2, subtitle: "Headcount, attendance and workforce mix", accent: "hsl(262 83% 58%)" },
  { id: "payroll", label: "Payroll", icon: Banknote, subtitle: "Payroll cost, earnings and deductions", accent: "hsl(351 95% 59%)" },
  { id: "quality", label: "QA/QC", icon: ClipboardCheck, subtitle: "Inspections, lab results, non-conformances and quality goals", accent: "hsl(142 71% 35%)" },
  { id: "assets", label: "Assets", icon: Building2, subtitle: "Asset value, depreciation and additions", accent: "hsl(28 80% 45%)" },
  { id: "financials", label: "Financial", icon: Scale, subtitle: "Income statement, balance sheet and cash flow", accent: "hsl(243 75% 59%)" },
];

/** Tab strip shared by the Executive summary and every module dashboard. */
export function AnalyticsTabs() {
  // Modules shown together on one overview page share one tab: Sales + SO + DO, Purchase + Buying Cycle, Production + WO Analysis.
  const merged: ModuleId[] = ["wo_analysis", "jc_analysis", "so_analysis", "do_analysis", "procurement", "export_analysis", "import_analysis"];
  const base = [
    { to: "/dashboard", label: "Executive", icon: Gauge },
    ...MODULES.filter((m) => !merged.includes(m.id)).map((m) =>
      m.id === "sales"
        ? { to: "/analytics/suite/sales", label: "Sales", icon: m.icon }
        : m.id === "purchase"
          ? { to: "/analytics/suite/purchase", label: "Buying", icon: m.icon }
          : m.id === "production"
            ? { to: "/production", label: "Production", icon: m.icon }
            : { to: `/analytics/${m.id}`, label: m.label, icon: m.icon },
    ),
  ];
  // The Export & Import dashboard (LCs, shipments, landed cost) sits right after Sales.
  const at = base.findIndex((t) => t.to === "/analytics/suite/sales") + 1;
  const tabs = [
    ...base.slice(0, at),
    { to: "/analytics/suite/trade", label: "Imp/Exp", icon: Ship },
    ...base.slice(at),
    { to: "/analytics/pnl-simulator", label: "P&L Simulator", icon: Scale },
  ];
  const query = usePeriodQuery(); // keep the period and filters when switching dashboards
  // Tabs for dashboards this site can't run (Production, Import & Export, P&L Simulator need micromax) are left out.
  const { isPathAvailable } = useInstalledApps();
  const { isPermitted } = usePermittedDashboardModules();
  // A tab shows when the user may open at least one of the dashboards it covers.
  const TAB_MODULES: Record<string, string[]> = {
    "/analytics/suite/sales": ["sales", "so_analysis", "do_analysis"],
    "/analytics/suite/purchase": ["purchase", "procurement"],
    "/analytics/suite/trade": ["export_analysis", "import_analysis"],
    "/production": ["production", "wo_analysis", "jc_analysis"],
    "/analytics/pnl-simulator": ["accounts"],
  };
  const tabAllowed = (to: string) => {
    if (to === "/dashboard") return true;
    const mods = TAB_MODULES[to] ?? (to.startsWith("/analytics/") ? [to.slice("/analytics/".length)] : []);
    return mods.length === 0 || mods.some(isPermitted);
  };
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 scrollbar-thin">
      {tabs.filter((t) => isPathAvailable(t.to) && tabAllowed(t.to)).map((t) => (
        <NavLink
          key={t.to}
          to={{ pathname: t.to, search: t.to.startsWith("/analytics") ? query : "" }}
          end
          className={({ isActive }) =>
            cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )
          }
        >
          <t.icon className="h-4 w-4" />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
export const moduleMeta = (id: string) => MODULES.find((m) => m.id === id);

/** One module's dashboard payload for a period. The server caches each result for 15 minutes. */
/**
 * Dashboards the current user may open on this site (mm_core.dashboards.get_permitted_modules: read access to
 * the module's main doctype; MicroMax-only modules need micromax). Fetched once; until it arrives nothing is
 * requested, and if it fails everything is (the server still enforces permissions).
 */
export function usePermittedDashboardModules() {
  const { data, isLoading, error } = useFrappeGetCall<{ message: string[] }>(
    "mm_core.dashboards.get_permitted_modules",
    undefined,
    "mm_core.dashboards.permitted",
    { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 10 * 60 * 1000 },
  );
  const permitted = useMemo(() => {
    const raw = (data as unknown as { message?: string[] })?.message ?? (Array.isArray(data) ? (data as string[]) : []);
    return new Set(raw);
  }, [data]);
  const isPermitted = useCallback((module: string) => (error ? true : !isLoading && permitted.has(module)), [permitted, isLoading, error]);
  return { isPermitted, isLoading: isLoading && !error };
}

export function useModuleDashboard(
  module: string,
  range: { from: string; to: string },
  company: string | undefined,
  refreshToken: number,
  enabled = true,
  /** Buying Cycle only: ± % band for the rate-abnormality check. */
  tolerance?: number,
) {
  const filters = useDashFilters(module);
  // Only request dashboards this user may open: otherwise each one the user can't read is a PermissionError.
  const { isPermitted, isLoading: permsLoading } = usePermittedDashboardModules();
  const notPermitted = !permsLoading && !isPermitted(module);
  enabled = enabled && !permsLoading && !notPermitted;
  const { data, ...rest } = useFrappeGetCall<{ message: DashboardData }>(
    "mm_core.dashboards.get_dashboard",
    { module, from_date: range.from, to_date: range.to, company: company ?? "", refresh: refreshToken ? 1 : 0, ...(tolerance != null ? { tolerance } : {}), ...filters },
    enabled ? `micromax.analytics.${module}.${range.from}.${range.to}.${company ?? ""}.${refreshToken}.${tolerance ?? ""}.${filtersKey(filters)}` : null,
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  return { dash: data?.message, ...rest, notPermitted };
}

// ------------------------------------------------------------------ fiscal-year period (Jul–Jun)
export function fiscalYearOf(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return m >= 7 ? y : y - 1;
}
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

export type Preset = "FY" | "H1" | "H2" | "Q1" | "Q2" | "Q3" | "Q4";
const PRESETS: { id: Preset; label: string; months: [number, number] }[] = [
  { id: "FY", label: "Full year", months: [0, 11] },
  { id: "H1", label: "H1", months: [0, 5] },
  { id: "H2", label: "H2", months: [6, 11] },
  { id: "Q1", label: "Q1", months: [0, 2] },
  { id: "Q2", label: "Q2", months: [3, 5] },
  { id: "Q3", label: "Q3", months: [6, 8] },
  { id: "Q4", label: "Q4", months: [9, 11] },
];

/** Month offset from July (0 = Jul, 11 = Jun) → ISO range within fiscal year `fy`. */
export function presetRange(fy: number, preset: Preset) {
  const [a, b] = PRESETS.find((p) => p.id === preset)!.months;
  const toYm = (offset: number) => {
    const month = ((6 + offset) % 12) + 1;
    return { y: month >= 7 ? fy : fy + 1, m: month };
  };
  const s = toYm(a);
  const e = toYm(b);
  return { from: `${s.y}-${pad(s.m)}-01`, to: `${e.y}-${pad(e.m)}-${pad(lastDay(e.y, e.m))}` };
}
export const fyLabel = (fy: number) => `FY ${fy}-${String(fy + 1).slice(2)}`;

/** Period state shared by the dashboards: defaults to the current fiscal year, Jul–Jun. */
// ------------------------------------------------------------------ shared period + filters
/** Dashboard filters (sent as get_dashboard arguments; each module honours only its own — see MODULE_FILTERS). */
export type FilterKey =
  | "cost_center" | "account" | "account_group" | "account_type" | "customer" | "supplier" | "item_group" | "item"
  | "department" | "asset_category" | "stream" | "wo_status";
export type DashFilters = Partial<Record<FilterKey, string>>;
export interface FilterDef {
  key: FilterKey;
  label: string;
  /** Link picker target; select filters have `options` instead. */
  doctype?: string;
  linkFilters?: unknown[][];
  options?: string[];
}
export const FILTER_DEFS: FilterDef[] = [
  { key: "cost_center", label: "Cost center", doctype: "Cost Center" },
  { key: "account", label: "Account", doctype: "Account" },
  { key: "account_group", label: "Account group", doctype: "Account", linkFilters: [["is_group", "=", 1]] },
  {
    key: "account_type", label: "Account type",
    options: ["Bank", "Cash", "Receivable", "Payable", "Stock", "Tax", "Income Account", "Expense Account", "Cost of Goods Sold",
      "Stock Received But Not Billed", "Fixed Asset", "Accumulated Depreciation", "Depreciation", "Equity", "Round Off", "Temporary"],
  },
  { key: "customer", label: "Customer", doctype: "Customer" },
  { key: "supplier", label: "Supplier", doctype: "Supplier" },
  { key: "item_group", label: "Item group", doctype: "Item Group" },
  { key: "item", label: "Item", doctype: "Item" },
  { key: "department", label: "Department", doctype: "Department" },
  { key: "asset_category", label: "Asset category", doctype: "Asset Category" },
  { key: "stream", label: "Conversion / production", options: ["Conversion", "Own production"] },
  { key: "wo_status", label: "Work order status", options: ["Not Started", "In Process", "Completed", "Stopped", "Closed"] },
];
/** Filters each analytics page shows (pages are the tabs; a suite page spans several modules). */
export const PAGE_FILTERS: Record<string, FilterKey[]> = {
  executive: ["cost_center", "account", "supplier", "customer"],
  accounts: ["cost_center", "account", "supplier", "customer"],
  financials: ["cost_center", "account", "account_group", "account_type", "supplier", "customer"],
  "suite:sales": ["cost_center", "customer", "item_group", "item"],
  "suite:purchase": ["cost_center", "supplier", "item_group", "item"],
  "suite:production": ["stream", "wo_status"],
  "suite:trade": ["customer", "supplier", "item_group", "item"],
  hr: ["department"],
  payroll: ["department"],
  assets: ["asset_category"],
};
/** Mirrors mm_core.dashboards.MODULE_FILTERS. */
export const MODULE_FILTERS: Record<string, FilterKey[]> = {
  accounts: ["cost_center", "account", "account_group", "account_type", "customer", "supplier"],
  financials: ["cost_center", "account", "account_group", "account_type", "customer", "supplier"],
  sales: ["cost_center", "customer", "item_group", "item"], so_analysis: ["cost_center", "customer", "item_group", "item"],
  do_analysis: ["cost_center", "customer", "item_group", "item"], export_analysis: ["customer", "item_group", "item"],
  purchase: ["cost_center", "supplier", "item_group", "item"], procurement: ["cost_center", "supplier", "item_group", "item"],
  import_analysis: ["supplier", "item_group", "item"], stock: ["item_group", "item"],
  production: ["stream", "wo_status"], wo_analysis: ["stream", "wo_status"], jc_analysis: ["stream", "wo_status"],
  quality: ["item"], hr: ["department"], payroll: ["department"], assets: ["asset_category"],
};

interface PeriodState {
  fy: number;
  preset: Preset | "custom";
  custom: { from: string; to: string };
  filters: DashFilters;
}
const PERIOD_KEY = "micromax.analytics.period.v1";
const PRESET_IDS = ["FY", "H1", "H2", "Q1", "Q2", "Q3", "Q4", "custom"];

/** First load: a shared link's query string wins, then what this browser last used, then the current fiscal year. */
function loadPeriod(): PeriodState {
  const fy0 = fiscalYearOf(todayISO());
  let st: PeriodState = { fy: fy0, preset: "FY", custom: presetRange(fy0, "FY"), filters: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(PERIOD_KEY) || "null");
    if (saved && typeof saved.fy === "number" && PRESET_IDS.includes(saved.preset)) st = { ...st, ...saved, filters: saved.filters || {} };
  } catch {
    /* storage unavailable: defaults */
  }
  try {
    const q = new URLSearchParams(window.location.search);
    const fy = Number(q.get("fy"));
    if (fy) st = { ...st, fy };
    const preset = q.get("period");
    if (preset && PRESET_IDS.includes(preset)) st = { ...st, preset: preset as PeriodState["preset"] };
    if (q.get("from") && q.get("to")) st = { ...st, preset: "custom", custom: { from: q.get("from")!, to: q.get("to")! } };
    const f: DashFilters = { ...st.filters };
    FILTER_DEFS.forEach(({ key }) => {
      if (q.has(key)) f[key] = q.get(key) || undefined;
    });
    st = { ...st, filters: f };
  } catch {
    /* no window */
  }
  return st;
}

let periodState: PeriodState | null = null;
const periodListeners = new Set<() => void>();
function getPeriodState() {
  if (!periodState) periodState = loadPeriod();
  return periodState;
}
function setPeriodState(patch: Partial<PeriodState>) {
  periodState = { ...getPeriodState(), ...patch };
  try {
    localStorage.setItem(PERIOD_KEY, JSON.stringify(periodState));
  } catch {
    /* private mode etc.: kept in memory for this tab */
  }
  periodListeners.forEach((l) => l());
}
function subscribePeriod(l: () => void) {
  periodListeners.add(l);
  return () => periodListeners.delete(l);
}
function usePeriodState() {
  return useSyncExternalStore(subscribePeriod, getPeriodState, getPeriodState);
}

// The filters the current page shows (set by its PeriodBar). Filters kept from another page but not shown here
// are not applied — what you see in the bar is what the figures use.
let pageKeys: FilterKey[] | null = null;
const pageKeyListeners = new Set<() => void>();
function setPageKeys(keys: FilterKey[]) {
  if (pageKeys && pageKeys.join() === keys.join()) return;
  pageKeys = keys;
  pageKeyListeners.forEach((l) => l());
}
function usePageKeys() {
  return useSyncExternalStore(
    (l) => {
      pageKeyListeners.add(l);
      return () => pageKeyListeners.delete(l);
    },
    () => pageKeys,
    () => pageKeys,
  );
}

/** The filters a module's dashboard should receive: shown on this page, honoured by the module, non-empty. */
export function useDashFilters(module?: string): DashFilters {
  const { filters } = usePeriodState();
  const keys = usePageKeys();
  return useMemo(() => {
    const allowed = (module ? MODULE_FILTERS[module] ?? [] : FILTER_DEFS.map((d) => d.key)).filter((k) => !keys || keys.includes(k));
    const out: DashFilters = {};
    allowed.forEach((k) => {
      if (filters[k]) out[k] = filters[k];
    });
    return out;
  }, [filters, module, keys]);
}

export function filtersKey(f: DashFilters) {
  return FILTER_DEFS.map(({ key }) => f[key] ?? "").join("|");
}

/** Query string carrying the current period and filters, for links that open another dashboard. */
export function usePeriodQuery(): string {
  const st = usePeriodState();
  const q = new URLSearchParams();
  q.set("fy", String(st.fy));
  q.set("period", st.preset);
  if (st.preset === "custom") {
    q.set("from", st.custom.from);
    q.set("to", st.custom.to);
  }
  FILTER_DEFS.forEach(({ key }) => st.filters[key] && q.set(key, st.filters[key]!));
  return `?${q.toString()}`;
}

/** Fiscal year, preset / custom range and dashboard filters — one shared selection for every dashboard page,
 * kept across tabs, module switches and reloads. */
export function usePeriod() {
  const st = usePeriodState();
  const { fy, preset, custom, filters } = st;
  const setFy = (v: number | ((y: number) => number)) => setPeriodState({ fy: typeof v === "function" ? v(getPeriodState().fy) : v });
  const setPreset = (p: Preset | "custom") => setPeriodState({ preset: p });
  const setCustom = (v: { from: string; to: string } | ((c: { from: string; to: string }) => { from: string; to: string })) =>
    setPeriodState({ custom: typeof v === "function" ? v(getPeriodState().custom) : v });
  const setFilter = (key: FilterKey, value: string) => setPeriodState({ filters: { ...getPeriodState().filters, [key]: value || undefined } });
  const clearFilters = () => setPeriodState({ filters: {} });
  const range = preset === "custom" ? custom : presetRange(fy, preset);
  const label = preset === "custom" ? "Custom period" : `${fyLabel(fy)} ${preset === "FY" ? "(Jul–Jun)" : preset}`;
  return { fy, setFy, preset, setPreset, custom, setCustom, filters, setFilter, clearFilters, range, label, invalid: range.from > range.to };
}

export function PeriodBar({ period, company, module, page }: { period: ReturnType<typeof usePeriod>; company?: string; module?: string; page?: string }) {
  const { fy, setFy, preset, setPreset, custom, setCustom, range, filters, setFilter, clearFilters } = period;
  // the page's own list (tabs), else the single module's, else none
  const keys = (page && PAGE_FILTERS[page]) || (module && (PAGE_FILTERS[module] ?? MODULE_FILTERS[module])) || [];
  const shown = keys.map((k) => FILTER_DEFS.find((d) => d.key === k)!).filter(Boolean);
  const keySig = keys.join();
  useEffect(() => setPageKeys(keySig ? (keySig.split(",") as FilterKey[]) : []), [keySig]);
  const active = shown.filter((d) => filters[d.key]).length;
  const hidden = FILTER_DEFS.filter((d) => filters[d.key] && !shown.includes(d));
  return (
    <Card className="space-y-3 p-3">
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous fiscal year" onClick={() => setFy((y) => y - 1)} disabled={preset === "custom"}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="flex items-center gap-1.5 px-1 text-sm font-semibold tabular-nums">
          <CalendarRange className="h-4 w-4 text-muted-foreground" /> {fyLabel(fy)}
        </span>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Next fiscal year" onClick={() => setFy((y) => y + 1)} disabled={preset === "custom"}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1 rounded-md bg-muted p-1">
        {[...PRESETS.map((p) => ({ id: p.id as Preset | "custom", label: p.label })), { id: "custom" as const, label: "Custom" }].map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              if (p.id === "custom") setCustom(range);
              setPreset(p.id);
            }}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              preset === p.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" ? (
        <div className="flex items-center gap-2">
          <Input type="date" className="h-8 w-[150px]" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="h-8 w-[150px]" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
        </div>
      ) : (
        <span className="text-xs text-muted-foreground tabular-nums">
          {range.from} → {range.to}
        </span>
      )}
      <span className="ml-auto text-xs text-muted-foreground">{company ?? "All companies"}</span>
    </div>
    {shown.length > 0 && (
      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
        {shown.map((d) => (
          <div key={d.key} className="w-full min-w-0 sm:w-[210px]">
            <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{d.label}</span>
            {d.options ? (
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={filters[d.key] ?? ""}
                onChange={(e) => setFilter(d.key, e.target.value)}
              >
                <option value="">All</option>
                {d.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <FrappeLinkField
                meta={{ fieldname: d.key, label: d.label, fieldtype: "Link", options: d.doctype, placeholder: `All ${d.label.toLowerCase()}s`,
                  ...(d.linkFilters ? { filters: d.linkFilters } : {}) }}
                value={filters[d.key] ?? ""}
                onChange={(v) => setFilter(d.key, v)}
                allowCreate={false}
              />
            )}
          </div>
        ))}
        {(active > 0 || hidden.length > 0) && (
          <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
        {hidden.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {hidden.map((d) => `${d.label}: ${filters[d.key]}`).join(" · ")} — kept, but not used by this dashboard
          </span>
        )}
      </div>
    )}
    </Card>
  );
}

// ------------------------------------------------------------------ formatting
export function formatKpi(v: number, format: Kpi["format"], currency: string, compact = true) {
  if (format === "percent") return `${formatNumber(v, 1)}%`;
  if (format === "money") return formatMoney(v, currency, { compact });
  if (compact && Math.abs(v) >= 100_000) return compactNumber(v);
  return formatNumber(v, Math.abs(v) < 100 && v % 1 !== 0 ? 2 : 0);
}

// ------------------------------------------------------------------ KPI tile
export function Sparkline({ values, color, height = 40 }: { values: number[]; color: string; height?: number }) {
  const data = values.map((v, i) => ({ i, v }));
  const id = useMemo(() => `spark-${Math.random().toString(36).slice(2)}`, []);
  if (values.filter(Boolean).length < 2) return <div style={{ height }} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RCArea data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} fill={`url(#${id})`} isAnimationActive={false} />
      </RCArea>
    </ResponsiveContainer>
  );
}

export function DeltaPill({ delta, invert, className }: { delta: number | null; invert: boolean; className?: string }) {
  if (delta == null || !isFinite(delta)) {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground", className)}>
        <Minus className="h-3 w-3" /> n/a
      </span>
    );
  }
  const up = delta >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      title="Last month in the period vs the month before"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        good ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(delta) >= 1000 ? ">999" : formatNumber(Math.abs(delta), 1)}%
    </span>
  );
}

function KpiIcon({ kpi, accent }: { kpi: Kpi; accent: string }) {
  const Icon = kpiIcon(kpi);
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
      style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

/** An icon for a KPI tile, picked from what the tile measures (label keywords first, then its format). */
const KPI_ICONS: [RegExp, LucideIcon][] = [
  [/joiner|hired|new employee/i, UserPlus],
  [/leaver|attrition|left/i, UserMinus],
  [/female|male|gender/i, UserRound],
  [/present|attendance/i, CalendarCheck],
  [/absen/i, CalendarX],
  [/leave/i, Plane],
  [/employee|staff|headcount|active|operator|strength/i, Users],
  [/paid|slip/i, Receipt],
  [/deduction|tax/i, CircleMinus],
  [/gross|net pay|payroll|salary|wage|pay\b/i, Wallet],
  [/reject|non-conform|open|overdue|late|expir|delay|rework/i, AlertTriangle],
  [/accept|pass|conform|quality|inspection/i, ShieldCheck],
  [/on time|otif|approved|completed|shipped|delivered/i, UserCheck],
  [/day|hour|transit|wait|lead|cycle|dwell|age/i, Clock],
  [/countr|export|destination/i, Globe],
  [/ship|vessel|sea/i, Ship],
  [/stock|quantity|qty|kg|units|produced|output/i, Boxes],
  [/work order|production|plan/i, Factory],
  [/cash|bank/i, Landmark],
];

function kpiIcon(kpi: Kpi): LucideIcon {
  for (const [re, icon] of KPI_ICONS) if (re.test(kpi.label)) return icon;
  return kpi.format === "money" ? Coins : kpi.format === "percent" ? Percent : Hash;
}

export function KpiTile({ kpi, currency, accent, to, onClick }: { kpi: Kpi; currency: string; accent: string; to?: string; onClick?: () => void }) {
  const body = (
    <Card className={cn("group relative flex h-full min-w-0 flex-col gap-2 overflow-hidden p-4", (to || onClick) && "hover-lift")}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <KpiIcon kpi={kpi} accent={accent} />
          <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">{kpi.label}</span>
        </span>
        <DeltaPill delta={kpi.delta} invert={kpi.invert} />
      </div>
      <p className="truncate text-2xl font-bold leading-tight tabular-nums" title={formatKpi(kpi.value, kpi.format, currency, false)}>
        {formatKpi(kpi.value, kpi.format, currency)}
      </p>
      <p className="truncate text-[11px] text-muted-foreground">
        {kpi.hint ?? (kpi.avg != null ? `Avg ${formatKpi(kpi.avg, kpi.format, currency)} ${kpi.avg_label}` : " ")}
      </p>
      <div className="-mx-4 -mb-4 mt-auto">
        <Sparkline values={kpi.spark} color={accent} />
      </div>
      {onClick && (
        <span className="pointer-events-none absolute bottom-2 right-3 flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium text-primary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          <ListIcon className="h-3 w-3" /> View list
        </span>
      )}
    </Card>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Show the documents behind this figure"
        className="block min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {body}
      </button>
    );
  }
  return to ? (
    <Link to={to} className="block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {body}
    </Link>
  ) : (
    body
  );
}

// ------------------------------------------------------------------ tables & drill-down
/** SPA route for a document, where one exists. */
const DOC_ROUTES: Record<string, string> = {
  "Material Request": "/import/material-requests/",
  "Purchase Order": "/import/purchase-orders/",
  "Purchase Receipt": "/purchase/receipts/",
  "Purchase Invoice": "/purchase/invoices/",
  "Sales Order": "/selling/sales-orders/",
  "Delivery Note": "/selling/delivery-notes/",
  "Sales Invoice": "/selling/sales-invoices/",
  "Payment Entry": "/accounting/payment-entries/",
  "Journal Entry": "/accounting/journal-entries/",
  "Work Order": "/production/work-orders/",
  "Job Card": "/production/job-cards/",
  "Downtime Entry": "/production/downtime/",
  "Stock Entry": "/inventory/stock-entries/",
  Employee: "/hr/employees/",
  Customer: "/masters/customers/",
  Supplier: "/masters/suppliers/",
  "Salary Slip": "/payroll/salary-slips/",
  Asset: "/asset-management/register/",
};

export interface TableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: "money" | "number" | "percent" | "days";
  /** Link every cell to this doctype… */
  doctype?: string;
  /** …or to the doctype named in this row field. */
  doctype_key?: string;
}

function formatCell(v: unknown, fmt: TableColumn["format"], currency: string) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v !== "number") return String(v);
  if (fmt === "money") return formatMoney(v, currency);
  if (fmt === "percent") return `${formatNumber(v, 1)}%`;
  if (fmt === "days") return formatNumber(v, 0);
  if (fmt === "number") return formatNumber(v, v % 1 === 0 ? 0 : 2);
  return String(v);
}

function downloadCsv(filename: string, columns: TableColumn[], rows: Record<string, any>[]) {
  const esc = (v: unknown) => {
    const t = String(v ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = [columns.map((c) => esc(c.label)).join(","), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Sortable, filterable table with document links, a totals row for amount columns and CSV download. */
export function DataTable({
  columns,
  rows: data,
  filename,
  currency = "PKR",
  maxHeight = 420,
  onOpen,
}: {
  columns: TableColumn[];
  rows: Record<string, any>[];
  filename: string;
  currency?: string;
  maxHeight?: number;
  /** Called when a document link is followed (e.g. to close the dialog it sits in). */
  onOpen?: () => void;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = needle ? data.filter((r) => columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(needle))) : data;
    if (sort) {
      out = [...out].sort((a, b) => {
        const x = a[sort.key], y = b[sort.key];
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""))) * sort.dir;
      });
    }
    return out;
  }, [data, q, sort, columns]);
  // Totals only make sense for amounts and quantities, not for rates, % or day counts.
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    columns.forEach((c) => {
      if (c.format === "money" || (c.format === "number" && !/rate|ops|%/i.test(c.label))) t[c.key] = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    });
    return t;
  }, [rows, columns]);
  const hasTotals = Object.keys(totals).length > 0 && rows.length > 1;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter rows…" className="h-8 max-w-xs" />
        <span className="text-xs text-muted-foreground tabular-nums">
          {rows.length.toLocaleString()} of {data.length.toLocaleString()} rows
        </span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => downloadCsv(filename, columns, rows)}>
          Download CSV
        </Button>
      </div>
      <div className="overflow-auto rounded-md border border-border scrollbar-thin" style={{ maxHeight }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.format ? -1 : 1 }))}
                  className={cn(
                    "cursor-pointer select-none whitespace-nowrap px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {c.label}
                  {sort?.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border/60 hover:bg-muted/40">
                {columns.map((c) => {
                  const doctype = c.doctype ?? (c.doctype_key ? r[c.doctype_key] : undefined);
                  const route = doctype ? DOC_ROUTES[doctype] : undefined;
                  const val = r[c.key];
                  return (
                    <td key={c.key} className={cn("whitespace-nowrap px-3 py-1.5", c.align === "right" && "text-right tabular-nums")}>
                      {route && val ? (
                        <Link to={`${route}${encodeURIComponent(val)}`} onClick={onOpen} className="font-medium text-primary hover:underline">
                          {val}
                        </Link>
                      ) : (
                        formatCell(val, c.format, currency)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {hasTotals && (
            <tfoot className="sticky bottom-0 bg-muted/95 font-semibold backdrop-blur">
              <tr className="border-t border-border">
                {columns.map((c, i) => (
                  <td key={c.key} className={cn("whitespace-nowrap px-3 py-2", c.align === "right" && "text-right tabular-nums")}>
                    {c.key in totals ? formatCell(totals[c.key], c.format, currency) : i === 0 ? "Total" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function TableWidget({ w, currency }: { w: Widget; currency: string }) {
  return <DataTable columns={(w.columns ?? []) as TableColumn[]} rows={w.data} filename={`${w.id}.csv`} currency={currency} />;
}

interface DrillData {
  title: string;
  columns: TableColumn[];
  rows: Record<string, any>[];
  total: number;
  truncated: boolean;
  available: boolean;
}

/** The documents behind one KPI tile, for the same period / company (and tolerance on Buying Cycle). */
export function DrillDialog({
  module,
  kpi,
  range,
  company,
  currency,
  tolerance,
  onClose,
}: {
  module: string;
  kpi: Kpi | null;
  range: { from: string; to: string };
  company?: string;
  currency: string;
  tolerance?: number;
  onClose: () => void;
}) {
  const filters = useDashFilters(module);
  const { data, error, isLoading } = useFrappeGetCall<{ message: DrillData }>(
    "mm_core.dashboards.get_drilldown",
    { module, key: kpi?.key, from_date: range.from, to_date: range.to, company: company ?? "", ...(tolerance != null ? { tolerance } : {}), ...filters },
    kpi ? `micromax.drill.${module}.${kpi.key}.${range.from}.${range.to}.${company ?? ""}.${tolerance ?? ""}.${filtersKey(filters)}` : null,
    { revalidateOnFocus: false },
  );
  const d = data?.message;
  return (
    <Dialog
      open={!!kpi}
      onClose={onClose}
      size="xl"
      className="max-w-[min(1200px,95vw)]"
      title={kpi ? `${kpi.label}: ${formatKpi(kpi.value, kpi.format, currency)}` : ""}
      description={d ? `${d.title} · ${range.from} → ${range.to}${d.truncated ? ` · showing the largest ${d.rows.length.toLocaleString()}` : ""}` : "Loading the documents behind this figure…"}
    >
      {error ? (
        <p className="text-sm text-rose-600">Could not load the list: {(error as any)?.message ?? String(error)}</p>
      ) : isLoading || !d ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : !d.available ? (
        <p className="text-sm text-muted-foreground">No drill-down is available for this figure.</p>
      ) : d.rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No documents in this period.</p>
      ) : (
        <DataTable columns={d.columns} rows={d.rows} filename={`${module}-${kpi?.key}.csv`} currency={currency} maxHeight={560} onOpen={onClose} />
      )}
    </Dialog>
  );
}

export function WidgetChart({ w, currency, height = 280 }: { w: Widget; currency: string; height?: number }) {
  const common = { data: w.data, xKey: w.xKey, money: w.money, currency, height };
  switch (w.type) {
    case "combo":
      return <ComboChart {...common} series={w.series} legend dualAxis={w.dualAxis} />;
    case "bar":
      return <BarChart {...common} series={w.series} legend={w.series.length > 1} stacked={w.stacked} percent={w.percent} colorKey={w.colorKey} angledLabels={w.angledLabels} />;
    case "line":
      return <LineChart {...common} series={w.series} legend={w.series.length > 1} percent={w.percent} zoom={w.zoom} />;
    case "area":
      return <AreaChart {...common} series={w.series} legend={w.series.length > 1} percent={w.percent} />;
    case "donut":
      return <DonutChart data={w.data as any} money={w.money} currency={currency} height={height} />;
    case "pie":
      return <PieChart data={w.data as any} money={w.money} currency={currency} height={height} />;
    case "gauge":
      return <BarGauge data={w.data as any} money={w.money} currency={currency} height={height} />;
    case "table":
      return <TableWidget w={w} currency={currency} />;
    case "barlist":
      return (
        <BarList
          rows={w.data.map((r) => ({ label: r.label, value: Number(r.value) }))}
          format={(v) => (w.money ? formatMoney(v, currency, { compact: true }) : w.percent ? `${formatNumber(v, 1)}%` : formatNumber(v, Math.abs(v) < 1000 && v % 1 !== 0 ? 1 : 0))}
          empty="No data in this period."
        />
      );
  }
}

export function isEmptyWidget(w: Widget) {
  if (!w.data.length) return true;
  if (w.type === "table") return false;
  if (w.type === "donut" || w.type === "pie" || w.type === "barlist" || w.type === "gauge") return w.data.every((r) => !Number(r.value));
  return w.data.every((r) => w.series.every((s) => !Number(r[s.key])));
}

// ------------------------------------------------------------------ insights
export const INSIGHT_STYLE: Record<Insight["level"], { icon: LucideIcon; chip: string; ring: string; label: string }> = {
  critical: { icon: AlertOctagon, chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400", ring: "border-l-rose-500", label: "Critical" },
  warning: { icon: AlertTriangle, chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400", ring: "border-l-amber-500", label: "Watch" },
  positive: { icon: CheckCircle2, chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", ring: "border-l-emerald-500", label: "Good" },
  info: { icon: Info, chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400", ring: "border-l-sky-500", label: "Note" },
};

export function InsightRow({ i, showModule }: { i: Insight; showModule?: boolean }) {
  const st = INSIGHT_STYLE[i.level];
  const mod = moduleMeta(i.module);
  const Icon = st.icon;
  const query = usePeriodQuery();
  return (
    <li className="flex gap-3 rounded-md p-2.5 transition-colors hover:bg-muted/50">
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", st.chip)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="text-sm font-semibold">{i.title}</p>
          {showModule && mod && (
            <Link to={`/analytics/${mod.id}${query}`} className="text-[11px] font-medium text-muted-foreground hover:text-primary">
              {mod.label} <ArrowRight className="inline h-3 w-3" />
            </Link>
          )}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{i.text}</p>
      </div>
      {i.metric != null && i.metric !== "" && <span className="shrink-0 self-start text-sm font-bold tabular-nums">{i.metric}</span>}
    </li>
  );
}

/** Compact horizontal strip for a module page: one card per insight. */
export function InsightStrip({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {insights.slice(0, 4).map((i, n) => {
        const st = INSIGHT_STYLE[i.level];
        const Icon = st.icon;
        return (
          <Card key={n} className="flex gap-3 p-3.5">
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", st.chip)}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="flex items-baseline gap-2 text-sm font-semibold">
                <span className="truncate">{i.title}</span>
                {i.metric != null && <span className="ml-auto shrink-0 tabular-nums">{i.metric}</span>}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{i.text}</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
