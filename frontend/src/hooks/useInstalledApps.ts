import { useCallback, useMemo } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";
import { APPS, type AppTile } from "@/app/apps";
import { appSegmentForPath } from "@/app/navigation";

/**
 * Routes inside an otherwise shared section that need a specific backend app — most specific first.
 * A path not listed here falls back to its tile's `apps` (by first segment, see AppTile.apps).
 * The analytics/dashboard backend lives in mm_core (every site); these pages read MicroMax-only doctypes.
 */
export const ROUTE_APPS: { prefix: string; apps: string[] }[] = [
  { prefix: "/analytics/production", apps: ["micromax"] },
  { prefix: "/analytics/wo_analysis", apps: ["micromax"] },
  { prefix: "/analytics/export_analysis", apps: ["micromax"] },
  { prefix: "/analytics/import_analysis", apps: ["micromax"] },
  { prefix: "/analytics/export", apps: ["micromax"] },
  { prefix: "/analytics/import", apps: ["micromax"] },
  { prefix: "/analytics/suite/trade", apps: ["micromax"] },
  { prefix: "/analytics/suite/production", apps: ["micromax"] },
  { prefix: "/analytics/pnl-simulator", apps: ["micromax"] },
  { prefix: "/dashboard/export", apps: ["micromax"] },
  { prefix: "/export/dashboard", apps: ["micromax"] },
  { prefix: "/reports/import", apps: ["micromax"] },
  { prefix: "/reports/export", apps: ["micromax"] },
  { prefix: "/reports/shipments", apps: ["micromax"] },
  { prefix: "/reports/lc", apps: ["micromax"] },
];

/** Analytics modules (mm_core.dashboards) built on MicroMax-only doctypes — mirrors MICROMAX_MODULES there. */
export const MICROMAX_DASHBOARD_MODULES = new Set(["production", "wo_analysis", "export_analysis", "import_analysis"]);

/** The tile that owns a route's first path segment (e.g. /production/work-orders -> the Production tile). */
export function tileForPath(pathname: string): AppTile | undefined {
  const segment = appSegmentForPath(pathname);
  return APPS.find((app) => appSegmentForPath(app.to) === segment);
}

/** Backend apps a route needs: an explicit ROUTE_APPS rule, else its tile's `apps`. */
export function appsForPath(pathname: string): string[] {
  const path = pathname.split(/[?#]/)[0];
  const rule = ROUTE_APPS.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`));
  return rule ? rule.apps : (tileForPath(path)?.apps ?? []);
}

/**
 * Frappe apps installed on the site this SPA talks to (frappe, erpnext, hrms, micromax, education, ...).
 *
 * The same React build runs against several sites (micromaxerp, wise, ...), each with its own set of apps, so
 * tiles, sidebar links and routes that need a backend app are shown only where that app is installed.
 * `frappe.utils.change_log.get_versions` is whitelisted for any logged-in user and keyed by app name.
 * The app list only changes on install, so it is fetched once per session.
 */
export function useInstalledApps() {
  const { data, isLoading, error } = useFrappeGetCall<{ message: Record<string, unknown> }>(
    "frappe.utils.change_log.get_versions",
    undefined,
    "installed-apps",
    { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 60 * 60 * 1000 },
  );

  const apps = useMemo(() => {
    const raw = (data as unknown as { message?: Record<string, unknown> })?.message ?? data ?? {};
    return new Set(Object.keys(raw as Record<string, unknown>));
  }, [data]);

  /**
   * Whether every app in `required` is installed. Nothing required always passes. While the list is loading,
   * gated things are held back (no flash of a tile or link that then disappears); if the call fails they are
   * shown, so a transient error never hides working functionality.
   */
  const hasApps = useCallback(
    (required: string[] | undefined) => {
      if (!required || required.length === 0) return true;
      if (error) return true;
      if (isLoading) return false;
      return required.every((app) => apps.has(app));
    },
    [apps, isLoading, error],
  );

  /** Whether a tile's backend apps are all installed (see hasApps). */
  const isAvailable = useCallback((tile: Pick<AppTile, "apps">) => hasApps(tile.apps), [hasApps]);

  /** Whether a route/link target can work on this site (ROUTE_APPS rule or its tile's apps). */
  const isPathAvailable = useCallback((pathname: string) => hasApps(appsForPath(pathname)), [hasApps]);

  /** Whether an mm_core analytics module can run here (the MicroMax-only ones need micromax). */
  const isDashboardModuleAvailable = useCallback(
    (module: string) => !MICROMAX_DASHBOARD_MODULES.has(module) || hasApps(["micromax"]),
    [hasApps],
  );

  return { apps, isLoading, error, hasApps, isAvailable, isPathAvailable, isDashboardModuleAvailable };
}
