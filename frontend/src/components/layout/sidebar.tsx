import { useState } from "react";
import { NavLink, matchPath, useLocation } from "react-router-dom";
import { ChevronRight, ExternalLink, X, LayoutGrid } from "lucide-react";
import { cn } from "@/utils/cn";
import type { NavGroup } from "@/app/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/common/logo";

/** "/", "/accounting", "/production"… — an app's home link; highlight it only on that exact page, not on every page below it. */
const isAppRoot = (to: string) => to.split("#")[0].split("/").filter(Boolean).length <= 1;

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
    "text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    isActive && "bg-primary/90 text-white hover:bg-primary hover:text-white",
  );
}

/** Always-present link back to the app launcher, above the current app's own nav. */
function BackToDesktop({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="border-b border-white/10 px-3 py-3">
      <NavLink to="/home" end onClick={onNavigate} className={navLinkClass}>
        <LayoutGrid className="h-4 w-4 shrink-0" />
        <span className="truncate">Desktop</span>
      </NavLink>
    </div>
  );
}

const OPEN_KEY = "sidebar.open-groups";

/** Titled groups start collapsed ("less"); the user's show/less choices are remembered per group title. */
function useOpenGroups() {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(OPEN_KEY) || "{}"); } catch { return {}; }
  });
  const toggle = (title: string, value: boolean) => setOpen((o) => {
    const next = { ...o, [title]: value };
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });
  return { open, toggle };
}

function NavLinks({
  groups,
  appLabel,
  onNavigate,
}: {
  groups: NavGroup[];
  appLabel?: string;
  onNavigate?: () => void;
}) {
  const { hasRole } = useAuth();
  const location = useLocation();
  // Links that jump to a section (`/production#wo_analysis--top`) are active only on that hash; the plain page
  // link then steps aside so just one item is highlighted.
  const hashLinks = groups.flatMap((g) => g.items.map((i) => i.to)).filter((to) => to.includes("#"));
  const activeHashLink = hashLinks.find((to) => to === location.pathname + location.hash);
  const linkClass = (to: string) => ({ isActive }: { isActive: boolean }) =>
    navLinkClass({ isActive: to.includes("#") ? to === activeHashLink : isActive && !(activeHashLink && activeHashLink.startsWith(to + "#")) });
  const { open, toggle } = useOpenGroups();
  // The group holding the current page always shows, so you can see where you are.
  const isHere = (to: string) => {
    const path = to.split("#")[0];
    return !!matchPath({ path, end: isAppRoot(path) }, location.pathname) || (!isAppRoot(path) && location.pathname.startsWith(path + "/"));
  };
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.length === 0 || hasRole(...item.roles)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-4 scrollbar-thin">
      {appLabel && !visibleGroups[0]?.title && (
        <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
          {appLabel}
        </p>
      )}
      {visibleGroups.map((group, gi) => {
        const here = group.items.some((i) => isHere(i.to));
        const expanded = !group.title || (open[group.title] ?? here);
        return (
        <div key={gi} className="space-y-1">
          {group.title && (
            <button type="button" onClick={() => toggle(group.title!, !expanded)} aria-expanded={expanded}
              title={expanded ? "Show less" : `Show ${group.items.length} items`}
              className="group/head flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted transition-colors hover:bg-white/5 hover:text-sidebar-foreground">
              <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform duration-200", expanded && "rotate-90")} />
              <span className="truncate">{group.title}</span>
              {here && !expanded && <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Current page is in this group" />}
              <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-white/10 px-1.5 text-[9px] font-medium normal-case tracking-normal opacity-70 group-hover/head:opacity-100">
                {expanded ? "less" : group.items.length}
              </span>
            </button>
          )}
          {expanded && group.items.map((item) => {
            const Icon = item.icon;
            return (
              item.to.startsWith("/desk/") ? (
                // ERPNext desk screens (no React page): a normal link, so the browser loads the desk
                <a key={item.to} href={item.to} target="_blank" rel="noopener" onClick={onNavigate} className={linkClass(item.to)({ isActive: false })}
                  title="Opens in a new tab (ERPNext desk)">
                  {Icon && <Icon className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{item.label}</span>
                  <ExternalLink className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                </a>
              ) : (
              <NavLink key={item.to} to={item.to} end={isAppRoot(item.to)} onClick={onNavigate} className={linkClass(item.to)}>
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                <span className="truncate">{item.label}</span>
              </NavLink>
              )
            );
          })}
        </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center border-b border-white/10 px-4 py-4">
      <Logo onDark className="h-10 w-auto" />
    </div>
  );
}

/**
 * Per-app sidebar (fixed on desktop, drawer on mobile). Scoped to a single
 * app's own nav groups — `AppShell` resolves which app the current route
 * belongs to and passes just that app's groups in, rather than one combined
 * sidebar for the whole workspace.
 */
export function Sidebar({
  groups,
  appLabel,
  mobileOpen,
  onCloseMobile,
  collapsed = false,
}: {
  groups: NavGroup[];
  appLabel?: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  /** Desktop: slid away (header toggle / Ctrl+B). */
  collapsed?: boolean;
}) {
  return (
    <>
      {/* Desktop */}
      {/* Pinned to the viewport: the page scrolls, the sidebar stays; its own nav scrolls inside it when long. */}
      <aside aria-hidden={collapsed} {...(collapsed ? { inert: "" } : {})} className={cn("sticky top-0 hidden h-screen max-h-screen shrink-0 flex-col self-start overflow-hidden bg-sidebar transition-[width,opacity] duration-300 ease-in-out lg:flex",
        collapsed ? "w-0 opacity-0" : "w-60 opacity-100")}>
        <div className="flex h-full w-60 flex-col">
        <Brand />
        <BackToDesktop />
        <NavLinks groups={groups} appLabel={appLabel} />
        <div className="border-t border-white/10 px-4 py-3">
          <p className="text-[10px] text-sidebar-muted">Powered by ERPNext / Frappe</p>
        </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onCloseMobile} aria-hidden="true" />
          <aside className="relative flex h-full w-64 animate-slide-in-right flex-col bg-sidebar">
            <button
              onClick={onCloseMobile}
              className="absolute right-3 top-4 rounded p-1 text-sidebar-muted hover:text-sidebar-foreground"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <Brand />
            <BackToDesktop onNavigate={onCloseMobile} />
            <NavLinks groups={groups} appLabel={appLabel} onNavigate={onCloseMobile} />
          </aside>
        </div>
      )}
    </>
  );
}
