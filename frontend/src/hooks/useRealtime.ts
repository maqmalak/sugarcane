import { useCallback } from "react";
import { useSWRConfig } from "frappe-react-sdk";

/**
 * Realtime helpers.
 *
 * The FrappeProvider opens a Socket.IO connection. DocType list-event drivers
 * are surfaced by the SDK's `useFrappeDocTypeEventListener` and are wired up in
 * <RealtimeWatcher/> (a component, so hook rules are respected). When any
 * watched DocType changes in ERPNext we globally revalidate SWR so the UI
 * refreshes without a manual page reload.
 */

export const REALTIME_DOCTYPES = [
  "LC Proforma",
  "Export Shipment",
  "Import Shipment",
  "Import Cost Sheet",
  "Export Packing Details",
  "Sales Order",
  "Purchase Order",
  "Purchase Receipt",
  "Purchase Invoice",
  "Landed Cost Voucher",
] as const;

/** Global SWR revalidation handle (used by the watcher and explicit calls). */
export function useRevalidateAll() {
  const { mutate } = useSWRConfig();
  return useCallback(() => {
    void mutate(() => true, undefined, { revalidate: true });
  }, [mutate]);
}

/** Tell the whole UI "data changed" (used after local mutations). */
export const DATA_CHANGED_EVENT = "micromax:data-changed";

export function notifyDataChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
  }
}

/** Extra server-published events we listen to for revalidation. */
export const MICROMAX_SERVER_EVENTS = [
  "micromax_lc_updated",
  "micromax_shipment_updated",
  "micromax_import_updated",
  "micromax_cost_sheet_updated",
  "micromax_production_updated",
] as const;
