import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, AtSign, Award, Bell, BellRing, ChevronRight, LogOut, ListTodo, Menu, MessageSquare, Search, Settings as SettingsIcon, Share2, Building2, Clock, Languages, LifeBuoy, ShieldCheck, UserCheck, UserCircle, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { ThemeCustomizer } from "./theme-provider";
import { Logo } from "@/components/common/logo";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { titleForSegment } from "@/app/navigation";
import { useFrappeGetDocCount } from "frappe-react-sdk";
import { useCrmNotifications, type CrmNotificationDoc } from "@/hooks/useCrmNotifications";
import { useNotificationLog } from "@/hooks/useNotificationLog";
import { docUrl } from "@/app/doc-routes";
import { formatDateTime } from "@/utils/dates";
import { cn } from "@/utils/cn";
import { htmlToText } from "@/utils/text";

function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-xs text-muted-foreground md:flex">
      <Link to="/home" className="transition-colors hover:text-foreground">
        Home
      </Link>
      {segments.map((seg, i) => {
        const to = `/${segments.slice(0, i + 1).join("/")}`;
        const isLast = i === segments.length - 1;
        // Dynamic segments (doc names) may be URL-encoded, e.g. a User's name
        // is its email ("%40" -> "@") — decode before titleForSegment's
        // ROUTE_TITLES lookup / fallback title-casing runs on it.
        const decoded = decodeURIComponent(seg);
        return (
          <span key={to} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            {isLast ? (
              <span className="max-w-[16rem] truncate font-medium text-foreground">
                {titleForSegment(decoded)}
              </span>
            ) : (
              <Link to={to} className="transition-colors hover:text-foreground">
                {titleForSegment(decoded)}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** Where a CRM Notification's `reference_doctype`/`reference_name` actually leads. */
function notificationHref(n: CrmNotificationDoc): string | undefined {
  if (!n.reference_name) return undefined;
  switch (n.reference_doctype) {
    case "CRM Lead":
      return `/crm/leads/${encodeURIComponent(n.reference_name)}`;
    case "CRM Deal":
      return `/crm/deals/${encodeURIComponent(n.reference_name)}`;
    case "CRM Task":
      return `/crm/tasks?open=${encodeURIComponent(n.reference_name)}`;
    case "Event":
      return "/crm/calendar";
    default:
      return undefined;
  }
}

const LOG_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Assignment: UserCheck, Mention: AtSign, Alert: BellRing, Share: Share2, "Energy Point": Award,
};

interface BellItem {
  key: string; source: "frappe" | "crm"; type: string; text: string; when: string; read: boolean;
  href?: string; external?: boolean; name: string;
}

function NotificationsBell() {
  // One bell for: Frappe's Notification Log (assignments, mentions, alerts, shares — what the desk bell shows)
  // and CRM notifications (follow-up reminders, CRM assignments / mentions). Open to-dos are linked in the footer.
  const { currentUser } = useAuth();
  const { data: todoCount } = useFrappeGetDocCount(
    "ToDo",
    [["status", "=", "Open"], ["allocated_to", "=", currentUser ?? ""]],
    false,
    currentUser ? `micromax.todo.count.${currentUser}` : null,
    { refreshInterval: 30_000 },
  );
  const crm = useCrmNotifications();
  const log = useNotificationLog();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: BellItem[] = [
    ...log.notifications.map((n): BellItem => {
      const u = n.document_type && n.document_name ? docUrl(n.document_type, n.document_name) : undefined;
      return { key: `f:${n.name}`, name: n.name, source: "frappe", type: n.type, text: htmlToText(n.subject) || n.type, when: n.creation,
        read: Boolean(n.read), href: u?.href, external: u?.external };
    }),
    ...crm.notifications.map((n): BellItem => ({
      key: `c:${n.name}`, name: n.name, source: "crm", type: "CRM", text: htmlToText(n.notification_text) || "Notification", when: n.creation,
      read: Boolean(n.read), href: notificationHref(n),
    })),
  ].sort((a, b) => b.when.localeCompare(a.when));
  const unread = log.unreadCount + crm.unreadCount;

  const openItem = (n: BellItem) => {
    setOpen(false);
    if (!n.read) void (n.source === "frappe" ? log.markRead(n.name) : crm.markRead(n.name));
    if (!n.href) return;
    if (n.external) window.location.assign(n.href);
    else navigate(n.href);
  };
  const markAll = () => {
    if (log.unreadCount) void log.markRead();
    if (crm.unreadCount) void crm.markRead();
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" className="relative" aria-label="Notifications" title="Notifications" onClick={() => setOpen((o) => !o)}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div
          className={cn(
            "absolute right-0 z-40 mt-1 w-96 max-w-[calc(100vw-1.5rem)] animate-fade-in overflow-hidden rounded-xl border border-border bg-popover shadow-xl",
            "dark:border-white/10 dark:bg-[hsl(216_67%_9%_/_0.97)] dark:shadow-[0_18px_60px_rgb(2_6_23_/_0.55)] dark:backdrop-blur-xl",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notifications {unread > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">{unread} new</span>}
            </p>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing new — you're all caught up.</p>
            ) : (
              items.slice(0, 25).map((n) => {
                const Icon = n.source === "crm" ? MessageSquare : LOG_ICON[n.type] ?? Bell;
                return (
                  <button key={n.key} onClick={() => openItem(n)}
                    className={cn("flex w-full gap-2.5 border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-accent/50", !n.read && "bg-primary/5")}>
                    <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      n.type === "Assignment" ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                        : n.type === "Mention" ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                          : n.type === "Alert" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-muted text-muted-foreground")}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13px] leading-snug">{n.text}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        {n.type} · {formatDateTime(n.when)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
            <Link to="/todos" onClick={() => setOpen(false)} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <ListTodo className="h-3.5 w-3.5" /> {Number(todoCount ?? 0)} open to-do{Number(todoCount ?? 0) === 1 ? "" : "s"}
            </Link>
            <Link to="/approvals/inbox" onClick={() => setOpen(false)} className="text-primary hover:underline">Approvals inbox</Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function Header({
  onOpenSidebar,
  onOpenSearch,
  brand = false,
  sidebarCollapsed = false,
  onToggleSidebar,
}: {
  /** Omitted on routes with no sidebar (the Desktop launcher) — hides the toggle. */
  onOpenSidebar?: () => void;
  /** Desktop show / hide of the sidebar. */
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenSearch: () => void;
  /** Show the logo — used on the Desktop launcher, which has no sidebar to carry it. */
  brand?: boolean;
}) {
  const { user, currentUser, roles, logout } = useAuth();
  const { company, setCompany, companies } = useCompanyContext();
  const navigate = useNavigate();

  const fullName = user?.full_name ?? currentUser ?? "User";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 dark:border-white/10 dark:bg-white/[0.03] dark:supports-[backdrop-filter]:bg-white/[0.03] sm:px-4">
      {onOpenSidebar && (
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenSidebar} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      )}
      {onToggleSidebar && (
        <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"} title={`${sidebarCollapsed ? "Show" : "Hide"} sidebar (Ctrl+B)`}>
          {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>
      )}

      {brand && <Logo className="h-8 w-auto shrink-0" />}
      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {/* Global search trigger */}
        <button
          onClick={onOpenSearch}
          className="flex h-10 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm text-muted-foreground transition-colors hover:bg-accent sm:w-72"
          aria-label="Open global search"
        >
          <Search className="h-5 w-5 shrink-0" />
          <span className="hidden flex-1 text-left sm:inline">Search…</span>
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-xs sm:inline">
            Ctrl K
          </kbd>
        </button>

        {/* Company selector */}
        {companies.length > 0 && (
          <Select
            value={company ?? ""}
            onChange={(e) => setCompany(e.target.value)}
            className="hidden h-8 w-40 text-xs md:block"
            aria-label="Active company"
          >
            {companies.map((c) => (
              <option key={c.name} value={c.name}>
                {c.label}
              </option>
            ))}
          </Select>
        )}

        <NotificationsBell />
        <ThemeCustomizer />

        <UserMenu fullName={fullName} email={user?.email ?? currentUser ?? ""} image={user?.user_image} roles={roles}
          company={company ?? ""} language={user?.language ?? "en"} timeZone={user?.time_zone ?? ""}
          onNavigate={navigate} onLogout={() => void logout()} />
      </div>
    </header>
  );
}

/** The account menu under the avatar: who is signed in, their roles and context, and the account actions. */
function UserMenu({ fullName, email, image, roles, company, language, timeZone, onNavigate, onLogout }: {
  fullName: string; email: string; image?: string; roles: string[]; company: string; language: string; timeZone: string;
  onNavigate: (to: string) => void; onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [allRoles, setAllRoles] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const shown = (roles ?? []).filter((r) => !["All", "Guest", "Desk User"].includes(r)).sort();
  const visible = allRoles ? shown : shown.slice(0, 6);
  const localTime = (() => { try { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: timeZone || undefined }); } catch { return ""; } })();
  const go = (to: string) => { setOpen(false); onNavigate(to); };
  const Row = ({ icon: I, label, value }: { icon: typeof Building2; label: string; value: string }) => (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><I className="size-4" /></span>
      <div className="min-w-0"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="truncate text-sm font-medium">{value || "—"}</div></div>
    </div>
  );
  const Action = ({ icon: I, label, sub, to }: { icon: typeof Building2; label: string; sub: string; to: string }) => (
    <button type="button" onClick={() => go(to)} className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><I className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label}</span><span className="block truncate text-xs text-muted-foreground">{sub}</span></span>
      <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="User menu" aria-expanded={open}
        className={cn("relative rounded-full p-0.5 ring-2 ring-transparent transition-all hover:ring-primary/30", open && "ring-primary/50")}>
        <Avatar name={fullName} src={image} size="sm" />
        <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl">
          <div className="relative bg-gradient-to-br from-primary/25 via-primary/10 to-transparent px-4 pb-4 pt-5">
            <div className="flex items-center gap-3">
              <div className="relative"><Avatar name={fullName} src={image} size="lg" className="ring-4 ring-background" />
                <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-emerald-500" /></div>
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">{fullName}</div>
                <div className="truncate text-xs text-muted-foreground">{email}</div>
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" />Signed in</div>
              </div>
            </div>
          </div>
          {shown.length > 0 && (
            <div className="border-b px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><ShieldCheck className="size-3.5" />Roles · {shown.length}</div>
              <div className="flex flex-wrap gap-1.5">
                {visible.map((r) => <span key={r} className="rounded-md border bg-muted/50 px-2 py-0.5 text-[11px] font-medium">{r}</span>)}
                {shown.length > 6 && <button type="button" onClick={() => setAllRoles((v) => !v)} className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10">{allRoles ? "Show less" : `+${shown.length - 6} more`}</button>}
              </div>
            </div>
          )}
          <div className="border-b py-1">
            <Row icon={Building2} label="Company" value={company} />
            <div className="grid grid-cols-2">
              <Row icon={Clock} label="Time zone" value={`${timeZone || "—"}${localTime ? ` · ${localTime}` : ""}`} />
              <Row icon={Languages} label="Language" value={language.toUpperCase()} />
            </div>
          </div>
          <div className="space-y-0.5 p-2">
            <Action icon={UserCircle} label="My account" sub="Profile, password, photo" to="/account" />
            <Action icon={SettingsIcon} label="Settings" sub="Preferences and system settings" to="/settings" />
            <Action icon={LifeBuoy} label="Help & guides" sub="Manuals, guides and videos" to="/help" />
          </div>
          <div className="border-t p-2">
            <button type="button" onClick={() => { setOpen(false); onLogout(); }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400">
              <LogOut className="size-4" />Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}

export { Badge };