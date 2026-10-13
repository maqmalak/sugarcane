import { useEffect } from "react";
import { useFrappeDocTypeEventListener, useFrappeEventListener } from "frappe-react-sdk";
import {
  REALTIME_DOCTYPES,
  MICROMAX_SERVER_EVENTS,
  DATA_CHANGED_EVENT,
  useRevalidateAll,
} from "@/hooks/useRealtime";

/**
 * Wires the frappe-react-sdk realtime listeners to global SWR revalidation.
 * Placed inside <FrappeProvider>. Renders nothing.
 *
 * `useFrappeDocTypeEventListener` subscribes to ERPNext's doc-list update
 * stream for each custom DocType; `useFrappeEventListener` listens for our own
 * server-published events. Any of them trigger a global SWR `mutate()`.
 */
export function RealtimeWatcher() {
  const revalidateAll = useRevalidateAll();

  // DocType list-update streams (fixed, top-level hook calls).
  useFrappeDocTypeEventListener(REALTIME_DOCTYPES[0], () => revalidateAll());
  useFrappeDocTypeEventListener(REALTIME_DOCTYPES[1], () => revalidateAll());
  useFrappeDocTypeEventListener(REALTIME_DOCTYPES[2], () => revalidateAll());
  useFrappeDocTypeEventListener(REALTIME_DOCTYPES[3], () => revalidateAll());
  useFrappeDocTypeEventListener(REALTIME_DOCTYPES[4], () => revalidateAll());
  useFrappeDocTypeEventListener(REALTIME_DOCTYPES[5], () => revalidateAll());
  useFrappeDocTypeEventListener(REALTIME_DOCTYPES[6], () => revalidateAll());
  useFrappeDocTypeEventListener(REALTIME_DOCTYPES[7], () => revalidateAll());
  useFrappeDocTypeEventListener(REALTIME_DOCTYPES[8], () => revalidateAll());
  useFrappeDocTypeEventListener(REALTIME_DOCTYPES[9], () => revalidateAll());

  // Custom server events (e.g. published by scheduler/hooks).
  useFrappeEventListener(MICROMAX_SERVER_EVENTS[0], () => revalidateAll());
  useFrappeEventListener(MICROMAX_SERVER_EVENTS[1], () => revalidateAll());
  useFrappeEventListener(MICROMAX_SERVER_EVENTS[2], () => revalidateAll());
  useFrappeEventListener(MICROMAX_SERVER_EVENTS[3], () => revalidateAll());
  useFrappeEventListener(MICROMAX_SERVER_EVENTS[4], () => revalidateAll());

  // Local "data changed" broadcast after mutations performed in this SPA.
  useEffect(() => {
    const handler = () => revalidateAll();
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
  }, [revalidateAll]);

  return null;
}