import useSWR from "swr";
import {
  useFrappeGetDoc,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import { getCalendarEvents } from "@/services/api";
import type { FrappeEvent } from "@/types/frappe";

/**
 * Calendar meetings in a date range — core Frappe `Event` doctype (the CRM
 * app has no meeting doctype of its own). `get_events` expands recurring
 * events server-side, so the returned rows are already resolved occurrences.
 */
export function useCrmCalendarEvents(start?: string, end?: string, filters?: unknown[][]) {
  const key = start && end ? `micromax.crm.events.${start}.${end}.${JSON.stringify(filters ?? [])}` : null;
  const { data, error, isLoading, mutate } = useSWR<Record<string, unknown>[]>(key, () =>
    getCalendarEvents(start!, end!, filters),
  );
  return { events: (data ?? []) as unknown as FrappeEvent[], isLoading, error, mutate };
}

export function useCrmEvent(name?: string) {
  return useFrappeGetDoc<FrappeEvent>("Event", name ?? undefined, name ? `micromax.crm.event.doc.${name}` : null);
}

/**
 * Create/Update/Delete a meeting, plus a helper to link it to a Lead/Deal
 * via an `Event Participants` child row (`reference_doctype`/`reference_docname`).
 */
export function useCrmEventMutations(onSuccess?: (doc: FrappeEvent) => void) {
  const create = useFrappeCreateDoc<FrappeEvent>();
  const update = useFrappeUpdateDoc<FrappeEvent>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: async (values: Partial<FrappeEvent>) => {
      const doc = await create.createDoc("Event", values as FrappeEvent);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<FrappeEvent>) => {
      const doc = await update.updateDoc("Event", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("Event", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

/** Build the `event_participants` row that links a meeting to a CRM Lead/Deal. */
export function crmParticipant(referenceDoctype: "CRM Lead" | "CRM Deal" | "Contact", referenceDocname: string) {
  return { reference_doctype: referenceDoctype, reference_docname: referenceDocname };
}
