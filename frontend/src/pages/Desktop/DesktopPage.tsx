import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import toast from "react-hot-toast";
import {
  AlertTriangle, ChevronRight, Inbox, ListTodo, RefreshCw, Truck, Activity, AlertCircle, CheckCircle2, ClipboardList,
  FileCheck2, FileClock, FileWarning, Landmark, PackageMinus, PackageX, PhoneCall, ShoppingCart, BookOpen, CalendarCheck, FileText, HandCoins,
  Package, Receipt, ShoppingBag, Target, Eye, Flag, type LucideIcon, ArrowRight, Factory, LayoutGrid,
  Users2, Zap, ShieldCheck, Layers, Smartphone, FilePen, UserX, MapPinOff, Leaf, UserCog, MapPinned, Boxes, FileSpreadsheet, Sprout,
} from "lucide-react";
import { APPS, APP_GROUPS, type AppTile } from "@/app/apps";
import { APP_NAVIGATION, appSegmentForPath } from "@/app/navigation";
import { docUrl } from "@/app/doc-routes";
import { Logo } from "@/components/common/logo";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useInstalledApps } from "@/hooks/useInstalledApps";
import { useVisibleModules } from "@/hooks/useWorkspaces";
import { isoDaysAgo } from "@/hooks/useUrlFlag";
import { SystemStatusCard } from "./system-status";
import { GlossyIcon, hueOf, ICON_GRADIENT } from "@/components/ui/app-icon";
import { humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { compactNumber, formatMoney } from "@/utils/currency";
import { APP_TIME_ZONE } from "@/utils/dates";

// ------------------------------------------------------------------ data (mm_core.home.get_home)
interface Alert { key: string; n: number; label: string; meta: string; to: string; tone: string; amount?: number | null }
interface Approval { doctype: string; name: string; state: string; amount?: number | null; title?: string; since: string; can_approve: boolean }
interface Activity { doctype: string; name: string; category: string; title: string; amount?: number | null; status: string; owner: string; owner_name: string; at: string }
interface HomeData {
  company: string; alerts: Alert[]; approvals: Approval[]; approvals_total?: number; activity: Activity[];
  module_mix?: { counts: Record<string, Record<string, number>>; top: Record<string, Record<string, [string, number][]>> };
  hours: number[]; days?: { date: string; count: number }[]; todos?: { open: number; overdue: number };
  cheques?: { count: number; amount: number; oldest?: string | null } | null; mix: Record<string, number>; stats: { entries_today: number; pending: number; posted_today: number };
  tiles: Record<string, { value: number; label: string }>;
}


const CATEGORY: Record<string, { label: string; tone: string }> = {
  survey: { label: "Survey", tone: "teal" },
  field: { label: "Field Force", tone: "violet" },
  indent: { label: "Indenting", tone: "teal" },
  elp: { label: "ELP", tone: "red" },
  procurement: { label: "Procurement", tone: "teal" },
  masters: { label: "Masters", tone: "rose" },
  finance: { label: "Accounts", tone: "red" },
};

/** Quick links: the main modules as colour cards (gradient, icon, what's inside). */
const QUICK: { label: string; sub: string; to: string; icon: LucideIcon; bg: string }[] = [
  { label: "Survey insights", sub: "Progress, varieties, circles", to: "/survey", icon: Leaf, bg: "from-emerald-500 to-teal-600 shadow-emerald-500/30" },
  { label: "Survey Map", sub: "Fields, mills & attendance", to: "/survey/map", icon: MapPinned, bg: "from-sky-500 to-blue-600 shadow-sky-500/30" },
  { label: "Season quotas", sub: "Circle quotas vs survey", to: "/survey/quota", icon: Target, bg: "from-amber-500 to-orange-500 shadow-amber-500/30" },
  { label: "Gate token", sub: "Scan indent / ELP slip", to: "/procurement/gate", icon: Truck, bg: "from-emerald-500 to-teal-600 shadow-emerald-500/30" },
  { label: "Indenting", sub: "Generate, authorize & print", to: "/indenting", icon: ClipboardList, bg: "from-fuchsia-500 to-purple-600 shadow-fuchsia-500/30" },
  { label: "Field Force", sub: "Attendance & devices", to: "/field-force", icon: UserCog, bg: "from-violet-500 to-purple-600 shadow-violet-500/30" },
  { label: "Growers", sub: "Registry & passbooks", to: "/survey/growers", icon: Users2, bg: "from-pink-500 to-rose-600 shadow-pink-500/30" },
  { label: "Area Map", sub: "Pins & boundaries", to: "/setup/area-map", icon: MapPinned, bg: "from-cyan-500 to-sky-600 shadow-cyan-500/30" },
  { label: "Sources & routes", sub: "Depots, check posts, journey time", to: "/setup/d/cane-source", icon: Truck, bg: "from-indigo-500 to-violet-600 shadow-indigo-500/30" },
  { label: "Report Centre", sub: "Excel & PDF reports", to: "/reports", icon: FileSpreadsheet, bg: "from-red-500 to-orange-500 shadow-red-500/30" },
  { label: "Sugar Setup", sub: "Masters & settings", to: "/setup", icon: Boxes, bg: "from-slate-500 to-slate-600 shadow-slate-500/30" },
];


function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function ago(iso: string): string {
  const t = new Date(iso.replace(" ", "T")).getTime();
  if (t > Date.now() + 60_000) return iso.slice(11, 16);          // dated later today: show the time
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m}m`;
  if (m < 24 * 60) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

function dayLabel(iso: string): string {
  const d = iso.slice(0, 10);
  const today = isoDaysAgo(0);          // local dates (not UTC — Pakistan is UTC+5)
  const yest = isoDaysAgo(1);
  return d === today ? "Today" : d === yest ? "Yesterday" : "Earlier";
}

/** A document link: React route when the app has a page for it, the Frappe desk otherwise (a full page load). */
function DocLink({ doctype, name, className, children, to }: { doctype: string; name: string; className?: string; children: React.ReactNode; to?: string }) {
  const u = to ? { href: to, external: false } : docUrl(doctype, name);
  return u.external ? <a href={u.href} className={className}>{children}</a> : <Link to={u.href} className={className}>{children}</Link>;
}

/** Attention links: React list pages, or the Frappe desk (/app/...) for screens the app doesn't have. */
function AlertLink({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  return to.startsWith("/app/") || to.startsWith("/desk/") ? <a href={to} className={className}>{children}</a> : <Link to={to} className={className}>{children}</Link>;
}

const money = (v?: number | null) => (v ? formatMoney(v, undefined, { compact: true }) : "");

/** Per alert: icon, round badge gradient, status pill — and whether it's urgent (red accent bar, listed first). */
const ALERT_STYLE: Record<string, { icon: LucideIcon; dot: string; pill: string; tag: string; urgent?: boolean }> = {
  overdue_sales: { icon: AlertCircle, dot: "from-rose-500 to-red-600", pill: "bg-rose-500/15 text-rose-600 ring-rose-500/30 dark:text-rose-300", tag: "Overdue", urgent: true },
  overdue_purchase: { icon: FileWarning, dot: "from-red-500 to-rose-600", pill: "bg-red-500/15 text-red-600 ring-red-500/30 dark:text-red-300", tag: "Overdue", urgent: true },
  approvals: { icon: CheckCircle2, dot: "from-blue-500 to-indigo-600", pill: "bg-blue-500/15 text-blue-600 ring-blue-500/30 dark:text-blue-300", tag: "Approval", urgent: true },
  late_delivery: { icon: Truck, dot: "from-amber-400 to-orange-500", pill: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300", tag: "Late" },
  late_receipt: { icon: PackageX, dot: "from-amber-400 to-yellow-500", pill: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300", tag: "Late" },
  followups: { icon: PhoneCall, dot: "from-pink-500 to-rose-500", pill: "bg-pink-500/15 text-pink-600 ring-pink-500/30 dark:text-pink-300", tag: "Follow-up" },
  quotations_expiring: { icon: FileClock, dot: "from-orange-400 to-orange-600", pill: "bg-orange-500/15 text-orange-600 ring-orange-500/30 dark:text-orange-300", tag: "Expiring" },
  reorder: { icon: PackageMinus, dot: "from-yellow-400 to-amber-500", pill: "bg-yellow-500/15 text-yellow-700 ring-yellow-500/30 dark:text-yellow-300", tag: "Low stock" },
  material_requests: { icon: ClipboardList, dot: "from-violet-500 to-purple-600", pill: "bg-violet-500/15 text-violet-600 ring-violet-500/30 dark:text-violet-300", tag: "Pending" },
  dn_to_bill: { icon: FileCheck2, dot: "from-emerald-500 to-green-600", pill: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300", tag: "To bill" },
  pr_to_bill: { icon: FileCheck2, dot: "from-teal-500 to-cyan-600", pill: "bg-teal-500/15 text-teal-600 ring-teal-500/30 dark:text-teal-300", tag: "To bill" },
  wo_running: { icon: Factory, dot: "from-purple-500 to-violet-600", pill: "bg-purple-500/15 text-purple-600 ring-purple-500/30 dark:text-purple-300", tag: "Process" },
  po_running: { icon: ShoppingCart, dot: "from-sky-500 to-blue-600", pill: "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-300", tag: "Open" },
  bank: { icon: Landmark, dot: "from-cyan-500 to-sky-600", pill: "bg-cyan-500/15 text-cyan-600 ring-cyan-500/30 dark:text-cyan-300", tag: "Reconcile" },
};
Object.assign(ALERT_STYLE, {
  sc_overlaps: { icon: Layers, dot: "from-rose-500 to-red-600", pill: "bg-rose-500/15 text-rose-600 ring-rose-500/30 dark:text-rose-300", tag: "Review", urgent: true },
  sc_devices: { icon: Smartphone, dot: "from-amber-400 to-orange-500", pill: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300", tag: "Approve", urgent: true },
  sc_drafts: { icon: FilePen, dot: "from-violet-500 to-purple-600", pill: "bg-violet-500/15 text-violet-600 ring-violet-500/30 dark:text-violet-300", tag: "Draft" },
  sc_absent: { icon: UserX, dot: "from-orange-400 to-orange-600", pill: "bg-orange-500/15 text-orange-600 ring-orange-500/30 dark:text-orange-300", tag: "Absent" },
  sc_out_of_area: { icon: MapPinOff, dot: "from-red-500 to-rose-600", pill: "bg-red-500/15 text-red-600 ring-red-500/30 dark:text-red-300", tag: "Geofence", urgent: true },
  sc_quota: { icon: Target, dot: "from-yellow-400 to-amber-500", pill: "bg-yellow-500/15 text-yellow-700 ring-yellow-500/30 dark:text-yellow-300", tag: "Quota" },
  sc_elp_verify: { icon: ShieldCheck, dot: "from-violet-500 to-purple-600", pill: "bg-violet-500/15 text-violet-600 ring-violet-500/30 dark:text-violet-300", tag: "Verify", urgent: true },
  sc_depot_overdue: { icon: Truck, dot: "from-red-500 to-rose-600", pill: "bg-red-500/15 text-red-600 ring-red-500/30 dark:text-red-300", tag: "Depot", urgent: true },
  sc_yard_late: { icon: Truck, dot: "from-red-500 to-rose-600", pill: "bg-red-500/15 text-red-600 ring-red-500/30 dark:text-red-300", tag: "Yard", urgent: true },
  sc_day_close: { icon: FileCheck2, dot: "from-amber-500 to-orange-600", pill: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300", tag: "Close day" },
  sc_elp_overdue: { icon: Truck, dot: "from-red-500 to-rose-600", pill: "bg-red-500/15 text-red-600 ring-red-500/30 dark:text-red-300", tag: "Overdue", urgent: true },
  sc_indent_draft: { icon: ClipboardList, dot: "from-violet-500 to-purple-600", pill: "bg-violet-500/15 text-violet-600 ring-violet-500/30 dark:text-violet-300", tag: "Authorize", urgent: true },
  sc_indent_unprinted: { icon: FileCheck2, dot: "from-sky-500 to-blue-600", pill: "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-300", tag: "Print" },
  sc_nopin_cane_source: { icon: MapPinOff, dot: "from-sky-500 to-blue-600", pill: "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-300", tag: "No pin" },
  sc_nopin_cane_depot: { icon: MapPinOff, dot: "from-sky-500 to-blue-600", pill: "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-300", tag: "No pin" },
  sc_nopin_loading_point: { icon: MapPinOff, dot: "from-sky-500 to-blue-600", pill: "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-300", tag: "No pin" },
});
const alertStyle = (key: string) => ALERT_STYLE[key] ?? { icon: AlertTriangle, dot: "from-slate-500 to-slate-600", pill: "bg-slate-500/15 text-slate-600 ring-slate-500/30 dark:text-slate-300", tag: "Info" };

function NeedsAttentionPanel({ alerts, loading }: { alerts?: Alert[]; loading: boolean }) {
  const [all, setAll] = useState(false);
  const sorted = [...(alerts ?? [])].sort((a, b) => Number(!!alertStyle(b.key).urgent) - Number(!!alertStyle(a.key).urgent));
  const shown = all ? sorted : sorted.slice(0, 6);
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-lg shadow-sky-500/30 ring-1 ring-inset ring-white/20">
          <Activity className="h-5 w-5" />
          {sorted.some((a) => alertStyle(a.key).urgent) && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500 ring-2 ring-card" />}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">Needs Attention</h2>
          <p className="truncate text-xs text-muted-foreground">{loading ? "Checking your day…" : sorted.length ? `${sorted.length} thing${sorted.length === 1 ? "" : "s"} waiting on you` : "Nothing waiting — all clear"}</p>
        </div>
        {sorted.length > 6 && (
          <button type="button" onClick={() => setAll((v) => !v)} className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary">
            {all ? "Show less" : `View all ${sorted.length}`} <ArrowRight className={cn("h-3.5 w-3.5 transition-transform", all && "-rotate-90")} />
          </button>
        )}
      </div>
      {loading ? <Skeleton className="h-64 rounded-xl" /> : sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-sm text-muted-foreground">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" /> Everything is up to date.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/40">
          {shown.map((a) => {
            const st = alertStyle(a.key);
            return (
              <li key={a.key} className="relative">
                {st.urgent && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-rose-500 to-red-600" />}
                <AlertLink to={a.to} className="group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/50">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-md ring-1 ring-inset ring-white/20", st.dot)}>
                    <st.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold group-hover:text-primary">{a.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.meta}{a.amount ? ` · ${money(a.amount)}` : ""}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground"><b className="text-sm tabular-nums text-foreground">{a.n > 999 ? compactNumber(a.n) : a.n}</b> {a.n === 1 ? "item" : "items"}</span>
                    <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", st.pill)}>{st.tag}</span>
                  </span>
                </AlertLink>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function QuickLinksPanel({ links }: { links: typeof QUICK }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30 ring-1 ring-inset ring-white/20">
          <Zap className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">Quick Links</h2>
          <p className="truncate text-xs text-muted-foreground">Access your important modules</p>
        </div>
        <a href="#all-modules" className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary">
          <LayoutGrid className="h-3.5 w-3.5" /> All Modules <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-4">
        {links.map((q) => (
          <Link key={q.label} to={q.to}
            className={cn("group relative flex min-h-[112px] flex-col overflow-hidden rounded-xl bg-gradient-to-br p-3 text-white shadow-md ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg", q.bg)}>
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-white/0" />
            <q.icon className="relative h-6 w-6 drop-shadow-sm" strokeWidth={2} />
            <span className="relative mt-2 text-sm font-bold leading-tight">{q.label}</span>
            <span className="relative mt-0.5 line-clamp-2 pr-4 text-[11px] leading-snug text-white/85">{q.sub}</span>
            <ArrowRight className="absolute bottom-2.5 right-2.5 h-3.5 w-3.5 text-white/90 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="mb-2.5 flex items-center gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
      {count !== undefined && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{count}</span>}
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

// ------------------------------------------------------------------ page
/** Post-login home: KPIs, things needing attention, quick links, app launcher and a live activity panel. */
export function DesktopPage() {
  const { user, currentUser, hasRole } = useAuth();
  const { company } = useCompanyContext();
  const name = user?.full_name || currentUser || "there";
  const { modules: visibleModules, isLoading: modulesLoading } = useVisibleModules();
  const { isAvailable, isPathAvailable } = useInstalledApps();
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState<string>("all");

  const { data, isLoading, isValidating, mutate } = useFrappeGetCall<{ message: HomeData }>(
    "mm_core.home.get_home",
    { company: company ?? "", refresh: refresh ? 1 : 0 },
    `mm_core.home.${company ?? ""}.${refresh}`,
    { revalidateOnFocus: true, dedupingInterval: 60_000 },
  );
  const home = (data as unknown as { message?: HomeData })?.message;

  // App tiles: same visibility rules as before (roles, installed backend apps, enabled modules).
  const apps = useMemo(
    () =>
      APPS.filter((app) => {
        if (app.roles && app.roles.length > 0 && !hasRole(...app.roles)) return false;
        if (!isAvailable(app)) return false;
        if (!app.module || modulesLoading) return true;
        return app.module.some((m) => visibleModules.has(m));
      }),
    [hasRole, isAvailable, modulesLoading, visibleModules],
  );
  const sections = [...APP_GROUPS, "More"]
    .map((group) => ({ group, label: GROUP_LABEL[group] ?? group, items: apps.filter((a) => !HOME_HIDDEN.has(a.id) && homeGroupOf(a) === group) }))
    .filter((s) => s.items.length > 0);
  const overview = sections.find((s) => s.group === "Overview");
  const rest = sections.filter((s) => s !== overview);
  const quick = QUICK.filter((q) => isPathAvailable(q.to));

  const pending = home?.approvals_total ?? home?.approvals.length ?? 0;
  const subtitle = !home
    ? "Loading your day…"
    : pending
      ? `${pending} document${pending === 1 ? " is" : "s are"} waiting for your approval.`
      : home.alerts.length
        ? `${home.alerts.length} thing${home.alerts.length === 1 ? " needs" : "s need"} attention today.`
        : "Everything is up to date.";

  return (
    <div className="flex flex-wrap items-start gap-6">
      <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
        {/* greeting */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo variant="mark" className="h-10 w-auto shrink-0" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{greeting()}, {name.split(" ")[0]}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
            <Button variant="outline" size="sm" onClick={() => { setRefresh((r) => r + 1); void mutate(); }} disabled={isValidating}>
              <RefreshCw className={cn("h-3.5 w-3.5", isValidating && "animate-spin")} /> Refresh
            </Button>
          </div>
        </div>

        {/* overview apps first: dashboards and reports */}
        <span id="all-modules" className="-mb-6 block scroll-mt-20" />
        {overview && <AppSection {...overview} tiles={home?.tiles} extra={<>{hasRole("System Manager") && <SystemStatusCard />}</>}
          oneRow={overview.items.length + (hasRole("System Manager") ? 2 : 1)} />}

        {/* apps: Accounts & Settings, Operations, People & Customer Communication, … (APP_GROUPS order) */}
        {rest.map((sec) => {
          const cols = SECTION_COLUMNS[sec.group];
          return <AppSection key={sec.group} {...sec} tiles={home?.tiles} oneRow={cols === "all" ? sec.items.length : cols} />;
        })}

        {/* last: needs attention (left) beside quick links (right) */}
        {(

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <NeedsAttentionPanel alerts={home?.alerts} loading={!home} />
            {quick.length > 0 && <QuickLinksPanel links={quick} />}
          </div>
        )}
      </main>

      <ActivityPanel home={home} loading={isLoading && !home} tab={tab} setTab={setTab} onChanged={() => { setRefresh((r) => r + 1); void mutate(); }} />
    </div>
  );
}

/** A small link tile in the activity panel header (to-dos, approvals). */
function PanelTile({ to, icon: Icon, tone, title, label, count, sub, warn, warnTone }: {
  to: string; icon: LucideIcon; tone: "violet" | "amber" | "sky"; title: string; label: string; count: number; sub: string;
  warn: boolean; warnTone: "rose" | "amber" | "sky";
}) {
  const g = { violet: "from-violet-500 to-purple-600 shadow-violet-500/30", amber: "from-amber-400 to-orange-500 shadow-amber-500/30",
    sky: "from-sky-500 to-blue-600 shadow-sky-500/30" }[tone];
  const subTone = { rose: "text-rose-600 dark:text-rose-400", amber: "text-amber-600 dark:text-amber-400", sky: "text-sky-600 dark:text-sky-400" }[warnTone];
  return (
    <Link to={to} title={title}
      className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-background/50 p-2.5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-md ring-1 ring-inset ring-white/20", g)}><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5"><span className="text-lg font-bold leading-none tabular-nums">{count}</span><span className="truncate text-[11px] font-medium text-muted-foreground">{label}</span></span>
        <span className={cn("mt-0.5 block truncate text-[10px] font-medium", warn ? subTone : "text-muted-foreground")}>{sub}</span>
      </span>
    </Link>
  );
}

/** Home page only: cards not shown here (still reachable from the menu), and cards shown in another section. */
const HOME_HIDDEN = new Set(["account", "pos", "analytics"]);
/** Icons per row for these sections ("all" = the whole section on one line); others wrap at 120px. */
const SECTION_COLUMNS: Record<string, number | "all"> = {
  "Finance & Setup": "all",
  Operations: "all",
  "Customers & Collaboration": "all",
};
const HOME_GROUP: Record<string, string> = { admin: "Finance & Setup", settings: "Finance & Setup" };
/** Whole sections folded into another on the home page (People sits in front of Customers & Collaboration). */
const MERGE_INTO: Record<string, string> = { People: "Customers & Collaboration" };
const homeGroupOf = (a: AppTile) => { const g = HOME_GROUP[a.id] ?? a.group ?? "More"; return MERGE_INTO[g] ?? g; };
const GROUP_LABEL: Record<string, string> = { "Finance & Setup": "Accounts & Settings", "Customers & Collaboration": "People & Customer Communication" };

function AppSection({ label, items, tiles, extra, oneRow }: { label: string; items: AppTile[]; tiles?: HomeData["tiles"]; extra?: React.ReactNode; oneRow?: number }) {
  return (
    <div>
      <SectionTitle count={items.length}>{label}</SectionTitle>
      {/* Fixed-size cards in regular rows (248px columns). `oneRow`: that many cards per line — up to 248px each,
          narrower on a small screen instead of wrapping early (Overview, Accounts & Settings, Operations…). */}
      <div className={cn("grid gap-x-2 gap-y-4", !oneRow && "grid-cols-[repeat(auto-fill,minmax(104px,1fr))] sm:grid-cols-[repeat(auto-fill,120px)]")}
        style={oneRow ? { gridTemplateColumns: `repeat(${oneRow}, minmax(0, 120px))` } : undefined}>
        {items.map((app) => <AppTileCard key={app.id} app={app} stat={tiles?.[app.id]} />)}
        {extra}
      </div>
    </div>
  );
}

/** Each module's usual flow, shown as numbered steps when hovering its card. Others use their sidebar links. */
const PLAYBOOKS: Record<string, { title: string; steps: { label: string; to: string }[] }> = {
  dashboard: { title: "Executive Summary first", steps: [
    { label: "Executive Summary", to: "/dashboard" }, { label: "Accounts", to: "/analytics/accounts" },
    { label: "Sales", to: "/analytics/suite/sales" }, { label: "Buying", to: "/analytics/suite/purchase" },
    { label: "Stock", to: "/analytics/stock" }, { label: "HR", to: "/analytics/hr" },
    { label: "Financial Statements", to: "/analytics/financials" }] },
  selling: { title: "Order to cash", steps: [
    { label: "Quotation", to: "/selling/quotations" }, { label: "Sales Order", to: "/selling/sales-orders" },
    { label: "Delivery Note", to: "/selling/delivery-notes" }, { label: "Sales Invoice", to: "/selling/sales-invoices" },
    { label: "Receive payment", to: "/accounting/payment-entries" }] },
  purchase: { title: "Procure to pay", steps: [
    { label: "Material Request", to: "/import/material-requests" }, { label: "Request for Quotation", to: "/import/rfqs" },
    { label: "Purchase Order", to: "/import/purchase-orders" }, { label: "Purchase Receipt", to: "/purchase/receipts" },
    { label: "Purchase Invoice", to: "/purchase/invoices" }, { label: "Pay supplier", to: "/accounting/payment-entries" }] },
  accounting: { title: "Record to report", steps: [
    { label: "Journal Entries", to: "/accounting/journal-entries" }, { label: "Payment Entries", to: "/accounting/payment-entries" },
    { label: "General Ledger", to: "/accounting/reports/general-ledger" }, { label: "Trial Balance", to: "/accounting/reports/trial-balance" },
    { label: "Profit and Loss", to: "/accounting/reports/profit-and-loss" }, { label: "Balance Sheet", to: "/accounting/reports/balance-sheet" }] },
  stock: { title: "Inventory flow", steps: [
    { label: "Items", to: "/masters/items" }, { label: "Stock Entries", to: "/inventory/stock-entries" },
    { label: "Stock levels", to: "/inventory/stock" }, { label: "Stock Ledger", to: "/inventory/reports/stock-ledger" }] },
  crm: { title: "Lead to deal", steps: [
    { label: "Leads", to: "/crm/leads" }, { label: "Follow-ups", to: "/crm/follow-ups" }, { label: "Tasks", to: "/crm/tasks" }] },
};

/** A step's icon: the sidebar's icon for that page, else a file. */
const NAV_ICON = new Map(Object.values(APP_NAVIGATION).flatMap((groups) => groups.flatMap((g) => g.items.map((i) => [i.to, i.icon] as const))));
const stepIcon = (to: string): LucideIcon => (NAV_ICON.get(to) as LucideIcon | undefined) ?? FileText;

function playbookFor(app: AppTile, isPathAvailable: (to: string) => boolean) {
  const curated = PLAYBOOKS[app.id];
  if (curated) return { title: curated.title, steps: curated.steps.filter((s) => isPathAvailable(s.to)) };
  // Fallback: the module's own sidebar links (first group's items first), de-duplicated.
  const nav = APP_NAVIGATION[appSegmentForPath(app.to)] ?? [];
  const seen = new Set<string>();
  const steps = nav.flatMap((g) => g.items).filter((i) => i.to !== app.to && isPathAvailable(i.to) && !seen.has(i.to) && seen.add(i.to))
    .slice(0, 6).map((i) => ({ label: i.label, to: i.to }));
  return { title: app.tagline ?? app.label, steps };
}

/** The app's icon in the glossy app-store style. */
function AppIcon({ app, size = "lg" }: { app: AppTile; size?: "lg" | "sm" }) {
  return <GlossyIcon icon={app.icon} hue={hueOf(app.colorClass)} size={size} />;
}

function AppTileCard({ app, stat }: { app: AppTile; stat?: { value: number; label: string } }) {
  const { isPathAvailable } = useInstalledApps();
  const playbook = playbookFor(app, isPathAvailable);
  return (
    <div className="group/tile relative">
    <Link to={app.to} className="group flex w-full flex-col items-center gap-1.5 rounded-2xl p-2 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-primary">
      <AppIcon app={app} />
      <span className="w-full truncate text-[13px] font-semibold leading-tight">{app.label}</span>
      {stat ? (
        <span className="-mt-1 w-full truncate text-[10px] text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{stat.value > 9999 ? compactNumber(stat.value) : stat.value.toLocaleString()}</span> {stat.label}
        </span>
      ) : app.tagline ? <span className="-mt-1 w-full truncate text-[10px] text-muted-foreground">{app.tagline}</span> : null}
    </Link>
    {playbook.steps.length > 0 && (
      // Playbook: appears on hover / keyboard focus, stays while the pointer is over it.
      <div className="invisible absolute left-1/2 top-full z-30 w-80 -translate-x-1/2 pt-2 opacity-0 transition-all delay-150 duration-200 group-hover/tile:visible group-hover/tile:translate-y-0 group-hover/tile:opacity-100 group-focus-within/tile:visible group-focus-within/tile:opacity-100 translate-y-1">
        <span aria-hidden className="absolute left-1/2 top-[3px] h-3 w-3 -translate-x-1/2 rotate-45 rounded-sm border-l border-t border-border bg-popover" />
        <div className="relative overflow-hidden rounded-2xl border border-border bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur">
          {/* header in the app's colours */}
          <div className={cn("relative overflow-hidden bg-gradient-to-br px-4 py-3 text-white", ICON_GRADIENT[hueOf(app.colorClass)] ?? ICON_GRADIENT.slate)}>
            <span aria-hidden className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-white/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow-inner ring-1 ring-inset ring-white/30 backdrop-blur">
                <app.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold leading-tight">{app.label} playbook</div>
                <div className="truncate text-[11px] text-white/80">{playbook.title}</div>
              </div>
              <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ring-white/30">{playbook.steps.length} steps</span>
            </div>
          </div>
          {/* stepper */}
          <ol className="relative p-2">
            {playbook.steps.map((st, i) => {
              const last = i === playbook.steps.length - 1;
              const StepIcon = stepIcon(st.to);
              return (
                <li key={st.to} className="relative">
                  {!last && <span aria-hidden className="absolute left-[23px] top-9 h-[calc(100%-22px)] w-px bg-gradient-to-b from-border to-border/30" />}
                  <Link to={st.to} className="group/step flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/70">
                    <span className={cn("relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white shadow-md ring-2 ring-popover transition-transform group-hover/step:scale-110",
                      ICON_GRADIENT[hueOf(app.colorClass)] ?? ICON_GRADIENT.slate)}>
                      {last ? <Flag className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold leading-tight group-hover/step:text-primary">{st.label}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{last ? "Final step" : `Step ${i + 1} · then ${playbook.steps[i + 1].label}`}</span>
                    </span>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors group-hover/step:bg-primary/10 group-hover/step:text-primary">
                      <StepIcon className="h-3.5 w-3.5" />
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover/step:translate-x-0.5 group-hover/step:text-primary" />
                  </Link>
                </li>
              );
            })}
          </ol>
          <Link to={app.to} className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary">
            Open {app.label} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    )}
    </div>
  );
}

// ------------------------------------------------------------------ right panel
/** Feed icon by document type (falls back to a file). */
const DOC_ICON: [RegExp, LucideIcon][] = [
  [/Sales Invoice|POS Invoice/, Receipt], [/Sales Order|Quotation/, ShoppingBag], [/Purchase Order|Material Request|Request for Quotation/, ShoppingCart],
  [/Purchase Invoice/, FileText], [/Purchase Receipt|Stock Entry|Stock Reconciliation/, Package], [/Delivery Note|Shipment/, Truck],
  [/Payment Entry/, HandCoins], [/Journal Entry/, BookOpen], [/Work Order|Job Card|Production/, Factory],
  [/Attendance|Checkin|Leave/, CalendarCheck], [/Employee|Salary|Payroll|Advance/, Users2], [/Lead|Opportunity|Customer/, Target],
];
const docIcon = (doctype: string) => DOC_ICON.find(([re]) => re.test(doctype))?.[1] ?? FileText;
/** Round badge gradient per feed category. */
const CAT_GRADIENT: Record<string, string> = {
  finance: "from-rose-500 to-red-600 shadow-rose-500/30", ops: "from-teal-500 to-cyan-600 shadow-teal-500/30",
  crm: "from-pink-500 to-fuchsia-600 shadow-pink-500/30", hr: "from-violet-500 to-purple-600 shadow-violet-500/30",
};
/** Status pill colour from the document status. */
const statusPill = (status: string) =>
  /cancel|reject|overdue|unpaid|expired|lost|stopped/i.test(status) ? "bg-rose-500/15 text-rose-600 ring-rose-500/30 dark:text-rose-300"
    : /draft|pending|open|to |hold|partly|waiting|not /i.test(status) ? "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300"
      : /paid|complete|submitted|approved|closed|delivered|received|present|billed|active|converted/i.test(status) ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300"
        : "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-300";

function ActivityPanel({ home, loading, tab, setTab, onChanged }: { home?: HomeData; loading: boolean; tab: string; setTab: (t: string) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (loading) return <aside className="w-full flex-[1_1_340px] xl:max-w-[400px]"><Skeleton className="h-[640px] rounded-2xl" /></aside>;
  if (!home) return null;

  // The last 7 days, today last.
  const week = home.days ?? [];
  const todayIso = isoDaysAgo(0);
  const peak = Math.max(...week.map((d) => d.count), 0);
  const peakDay = peak ? week.find((d) => d.count === peak) : undefined;
  const dayName = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });
  const weekTotal = week.reduce((a, d) => a + d.count, 0);
  const cats = Object.keys(CATEGORY).filter((c) => home.activity.some((a) => a.category === c));
  const approvalsTotal = home.approvals_total ?? home.approvals.length;
  const tabs = [{ key: "all", label: "All" }, ...(approvalsTotal ? [{ key: "approvals", label: `Approvals ${approvalsTotal}` }] : []), ...cats.map((c) => ({ key: c, label: CATEGORY[c].label }))];

  const approve = async (a: Approval) => {
    setBusy(a.name);
    try {
      await postCall("mm_core.home.approve", { doctype: a.doctype, name: a.name });
      toast.success(`${a.name} approved`);
      onChanged();
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setBusy(null);
    }
  };

  const feed = tab === "approvals" ? [] : home.activity.filter((a) => tab === "all" || a.category === tab);
  const days = ["Today", "Yesterday", "Earlier"]
    .map((label) => ({ label, items: feed.filter((a) => dayLabel(a.at) === label) }))
    .filter((d) => d.items.length);

  return (
    <aside className="w-full flex-[1_1_340px] xl:sticky xl:top-20 xl:max-w-[400px]">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* soft glow behind the header */}
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-sky-500/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -left-20 top-10 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative space-y-4 p-4">
          {/* header */}
          <div className="flex items-center gap-3">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-lg shadow-sky-500/30 ring-1 ring-inset ring-white/20">
              <Activity className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold leading-tight">Recent Activity</h2>
              <p className="truncate text-xs text-muted-foreground">Latest updates from your system</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>
              Live
            </span>
          </div>

          {/* to-dos + approvals */}
          <div className="grid grid-cols-2 gap-2">
            <PanelTile to={home.todos?.overdue ? "/todos?overdue=1" : "/todos"} icon={ListTodo} tone="violet" title="Your open to-dos"
              label="To-dos" count={home.todos?.open ?? 0}
              sub={home.todos?.overdue ? `${home.todos.overdue} overdue` : "none overdue"} warn={Boolean(home.todos?.overdue)} warnTone="rose" />
            <PanelTile to="/approvals/inbox" icon={Inbox} tone="amber" title="Overlap reviews, workflow and HR requests waiting for you"
              label="Approvals" count={approvalsTotal}
              sub={approvalsTotal ? "waiting for you" : "all clear"} warn={approvalsTotal > 0} warnTone="amber" />
          </div>

          {/* today in numbers */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: String(home.stats.entries_today), l: "Entries today", c: "text-foreground", g: "from-sky-500/15" },
              { v: String(home.stats.pending), l: "Pending", c: home.stats.pending ? "text-amber-600 dark:text-amber-400" : "text-foreground", g: "from-amber-500/15" },
              { v: String(home.stats.posted_today), l: "Submitted today", c: "text-emerald-600 dark:text-emerald-400", g: "from-emerald-500/15" },
            ].map((s) => (
              <div key={s.l} className={cn("rounded-xl border border-border bg-gradient-to-b to-transparent p-2.5 text-center", s.g)}>
                <div className={cn("text-lg font-bold leading-tight tabular-nums", s.c)}>{s.v}</div>
                <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{s.l}</div>
              </div>
            ))}
          </div>

          {/* last 7 days */}
          <div className="rounded-xl border border-border bg-background/40 p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-semibold">Last 7 days</span>
              <span className="text-[11px] text-muted-foreground">{weekTotal ? <><b className="tabular-nums text-foreground">{weekTotal}</b> entries{peakDay ? ` · peak ${dayName(peakDay.date)}` : ""}</> : "None yet"}</span>
            </div>
            <div className="flex h-16 items-end gap-2">
              {week.map((d) => {
                const isToday = d.date === todayIso;
                return (
                  <div key={d.date} className="group/bar relative flex h-full flex-1 flex-col justify-end">
                    <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-foreground px-1 text-[9px] font-semibold tabular-nums text-background opacity-0 transition-opacity group-hover/bar:opacity-100">{d.count}</span>
                    <span title={`${dayName(d.date)} ${d.date} · ${d.count}`}
                      className={cn("w-full rounded-md bg-gradient-to-t transition-all", isToday ? "from-sky-600 to-cyan-400 shadow-md shadow-sky-500/30" : "from-sky-500/40 to-sky-400/20 group-hover/bar:from-sky-500/70 group-hover/bar:to-sky-400/40")}
                      style={{ height: `${peak ? Math.max(8, (d.count / peak) * 100) : 8}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 flex gap-2 text-[10px] text-muted-foreground">
              {week.map((d) => <span key={d.date} className={cn("flex-1 text-center", d.date === todayIso && "font-semibold text-sky-600 dark:text-sky-400")}>{dayName(d.date)}</span>)}
            </div>
          </div>

          <ModuleMix mix={home.module_mix} />

          {/* segmented tabs */}
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 scrollbar-thin">
            {tabs.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={cn("shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all",
                  tab === t.key ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="-mx-1 max-h-[560px] space-y-4 overflow-y-auto px-1 pr-1.5 scrollbar-thin">
            {(tab === "all" || tab === "approvals") && home.approvals.length > 0 && (
              <div className="space-y-2">
                <GroupLabel>{approvalsTotal > home.approvals.length ? `Waiting for you · latest ${home.approvals.length} of ${approvalsTotal}` : "Waiting for you"}</GroupLabel>
                {home.approvals.map((a) => (
                  <div key={`${a.doctype}-${a.name}`} className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
                    <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-400 to-orange-500" />
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/30">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold" title={`${a.doctype} ${a.name}`}>{a.name}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{ago(a.since)}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{a.doctype}{a.title ? ` · ${a.title}` : ""}{a.amount ? ` · ${money(a.amount)}` : ""}</div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300">{a.state}</span>
                          <span className="ml-auto flex gap-1.5">
                            {a.can_approve && (
                              <button type="button" disabled={busy === a.name} onClick={() => void approve(a)}
                                className="inline-flex h-7 items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 px-3 text-xs font-semibold text-white shadow-md shadow-emerald-500/30 ring-1 ring-inset ring-white/20 transition hover:brightness-110 active:scale-95 disabled:opacity-60">
                                {busy === a.name ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} {a.doctype === "Survey Overlap Review" ? "Accept both" : a.doctype === "Indent Batch" ? "Authorize" : "Approve"}
                              </button>
                            )}
                            <DocLink doctype={a.doctype} name={a.name} to={a.doctype === "Survey Overlap Review" ? "/approvals/inbox" : undefined}
                              className="inline-flex h-7 items-center gap-1 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-3 text-xs font-semibold text-white shadow-md shadow-sky-500/30 ring-1 ring-inset ring-white/20 transition hover:brightness-110 active:scale-95">
                              <Eye className="h-3.5 w-3.5" /> Review
                            </DocLink>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {days.map((d) => (
              <div key={d.label}>
                <GroupLabel>{d.label}</GroupLabel>
                {/* timeline */}
                <ol className="relative mt-1 space-y-1 before:absolute before:bottom-3 before:left-[19px] before:top-3 before:w-px before:bg-gradient-to-b before:from-border before:via-border before:to-transparent">
                  {d.items.map((a) => {
                    const Icon = docIcon(a.doctype);
                    return (
                      <li key={`${a.doctype}-${a.name}`}>
                        <DocLink doctype={a.doctype} name={a.name} className="group relative flex items-start gap-3 rounded-xl p-1.5 transition-colors hover:bg-muted/50">
                          <span className={cn("relative z-10 flex h-[26px] w-[26px] shrink-0 translate-x-[0px] items-center justify-center rounded-full bg-gradient-to-br text-white shadow-md ring-4 ring-card", CAT_GRADIENT[a.category] ?? "from-slate-400 to-slate-600")}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-[13px] font-semibold group-hover:text-primary" title={`${a.doctype} ${a.name}`}>{a.name}</span>
                              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{ago(a.at)}</span>
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground" title={a.title || undefined}>{a.doctype}{a.title ? ` · ${a.title}` : ""}</span>
                            <span className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span className={cn("rounded-md px-1.5 py-px font-semibold ring-1 ring-inset", statusPill(a.status))}>{a.status}</span>
                              {a.amount ? <span className="font-medium tabular-nums text-foreground">{money(a.amount)}</span> : null}
                              <span className="ml-auto flex min-w-0 items-center gap-1"><Avatar name={a.owner_name} size="sm" className="!h-4 !w-4 !text-[8px]" /><span className="truncate">{a.owner_name}</span></span>
                            </span>
                          </span>
                        </DocLink>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}

            {!home.approvals.length && !days.length && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-sm text-muted-foreground">
                <Activity className="h-7 w-7 opacity-50" /> No activity in the last 7 days.
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Module colours for the share bar (gradient + solid dot). */
const MODULE_STYLE: Record<string, { g: string; icon: LucideIcon }> = {
  Selling: { g: "from-emerald-400 to-green-600", icon: ShoppingBag }, Buying: { g: "from-pink-400 to-rose-600", icon: ShoppingCart },
  Accounts: { g: "from-sky-400 to-blue-600", icon: Landmark }, Stock: { g: "from-teal-400 to-cyan-600", icon: Package },
  Production: { g: "from-amber-400 to-orange-600", icon: Factory }, HR: { g: "from-violet-400 to-purple-600", icon: Users2 },
  CRM: { g: "from-fuchsia-400 to-pink-600", icon: Target }, POS: { g: "from-indigo-400 to-blue-700", icon: Receipt },
  Survey: { g: "from-emerald-400 to-teal-600", icon: Sprout }, "Field Force": { g: "from-violet-400 to-purple-600", icon: UserCog },
  Masters: { g: "from-pink-400 to-rose-600", icon: Boxes }, Indenting: { g: "from-violet-400 to-purple-600", icon: ClipboardList },
  ELP: { g: "from-orange-400 to-red-500", icon: Truck },
};
const PERIODS = [["today", "Today"], ["week", "7 days"], ["month", "30 days"]] as const;

/** Share by module: documents created per module for the chosen period — stacked bar plus a ranked breakdown. */
function ModuleMix({ mix }: { mix?: HomeData["module_mix"] }) {
  const counts = mix?.counts ?? {};
  const firstWithData = PERIODS.find(([p]) => Object.keys(counts[p] ?? {}).length)?.[0] ?? "week";
  const [period, setPeriod] = useState<string | null>(null);
  const active = period ?? firstWithData;
  const [hover, setHover] = useState<string | null>(null);
  const rows = Object.entries(counts[active] ?? {}).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((a, [, n]) => a + n, 0);
  const max = rows[0]?.[1] ?? 0;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold">Share by module</div>
          <div className="text-[10px] text-muted-foreground">{total ? <><b className="tabular-nums text-foreground">{total.toLocaleString()}</b> documents created</> : "No documents yet"}</div>
        </div>
        <div className="flex rounded-lg bg-muted/70 p-0.5">
          {PERIODS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setPeriod(k)}
              className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold transition-all", active === k ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <div className="flex h-10 items-center justify-center rounded-full border border-dashed border-border text-[11px] text-muted-foreground">Nothing created {active === "today" ? "today" : "in this period"} yet</div>
      ) : (
        <>
          {/* stacked bar */}
          <div className="flex h-3 w-full gap-[3px] overflow-hidden rounded-full bg-muted/60 p-[2px]">
            {rows.map(([m, n]) => (
              <span key={m} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)} title={`${m} · ${n} (${pct(n).toFixed(1)}%)`}
                className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out", MODULE_STYLE[m]?.g ?? "from-slate-400 to-slate-600",
                  hover && hover !== m && "opacity-35")}
                style={{ width: `${Math.max(pct(n), 1.5)}%` }} />
            ))}
          </div>

          {/* ranked breakdown */}
          <ul className="mt-3 space-y-1.5">
            {rows.map(([m, n]) => {
              const st = MODULE_STYLE[m] ?? { g: "from-slate-400 to-slate-600", icon: FileText };
              const top = mix?.top?.[active]?.[m] ?? [];
              return (
                <li key={m} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)}
                  className={cn("group/mod rounded-lg px-1.5 py-1 transition-colors", hover === m && "bg-muted/60")}
                  title={top.map(([dt, c]) => `${dt}: ${c}`).join("\n")}>
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-sm", st.g)}><st.icon className="h-3.5 w-3.5" /></span>
                    <span className="w-[72px] shrink-0 truncate text-[11px] font-semibold">{m}</span>
                    <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className={cn("absolute inset-y-0 left-0 rounded-full bg-gradient-to-r transition-all duration-700 ease-out", st.g)} style={{ width: `${max ? (n / max) * 100 : 0}%` }} />
                    </span>
                    <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums">{n.toLocaleString()}</span>
                    <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{pct(n) < 1 ? "<1" : Math.round(pct(n))}%</span>
                  </div>
                  {hover === m && top.length > 0 && (
                    <div className="ml-8 mt-1 flex flex-wrap gap-1">
                      {top.map(([dt, c]) => <span key={dt} className="rounded bg-card px-1.5 py-px text-[10px] text-muted-foreground ring-1 ring-border">{dt} <b className="tabular-nums text-foreground">{c}</b></span>)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
    </div>
  );
}
