import useSWR from "swr";
import { getCrmDashboard, type CrmDashboardWidgetRaw } from "@/services/api";

/**
 * The manager dashboard: `CRM Dashboard.layout` widgets with each one's
 * aggregated `data` already attached server-side
 * (`crm.api.dashboard.get_dashboard` dynamically dispatches to a
 * `get_<widget_name>` aggregation function per widget — there is no
 * equivalent generic REST endpoint, so this whitelisted call is required).
 */
export function useCrmDashboard(range?: { fromDate?: string; toDate?: string }) {
  const key = `micromax.crm.dashboard.${range?.fromDate ?? ""}.${range?.toDate ?? ""}`;
  const { data, error, isLoading, mutate } = useSWR<CrmDashboardWidgetRaw[]>(key, () => getCrmDashboard(range));

  const widgets: CrmDashboardWidgetRaw[] = Array.isArray(data) ? data : Object.values(data ?? {}) as CrmDashboardWidgetRaw[];

  return { widgets, isLoading, error, mutate };
}
