import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeGetCall,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { DeliveryNote } from "@/types/frappe";

const DELIVERY_NOTE_FIELDS = [
  "name",
  "posting_date",
  "customer",
  "customer_name",
  "company",
  "currency",
  "grand_total",
  "total_qty",
  "status",
  "docstatus",
  "per_billed",
] as const;

/** List Delivery Notes. */
export function useDeliveryNotes(args?: { filters?: unknown[][]; limit?: number; enabled?: boolean }) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<DeliveryNote>(
    "Delivery Note",
    {
      fields: DELIVERY_NOTE_FIELDS as unknown as (keyof DeliveryNote)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.dn.${JSON.stringify({ filters, limit })}` : null,
  );
}

/** Single Delivery Note (full document with items). */
export function useDeliveryNote(name?: string) {
  return useFrappeGetDoc<DeliveryNote>("Delivery Note", name ?? undefined, name ? `micromax.dn.doc.${name}` : null);
}

/** Create / Update / Delete mutations. */
export function useDeliveryNoteMutations(onSuccess?: (doc: DeliveryNote) => void) {
  const create = useFrappeCreateDoc<DeliveryNote>();
  const update = useFrappeUpdateDoc<DeliveryNote>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: async (values: Partial<DeliveryNote>) => {
      const doc = await create.createDoc("Delivery Note", values as DeliveryNote);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<DeliveryNote>) => {
      const doc = await update.updateDoc("Delivery Note", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("Delivery Note", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

/**
 * List Delivery Notes linked to a Sales Order.
 *
 * The link lives on the child table (Delivery Note Item.against_sales_order).
 * The REST ``get_list`` API strips the ``parent`` field for child tables, so we
 * use the same server-side helper already used for PO/PR/PI linking.
 */
export function useDeliveryNotesForSO(soName?: string) {
  const { data: parentNames, isLoading: namesLoading, error: namesError, mutate: refreshNames } =
    useFrappeGetCall<string[]>(
      "mm_core.api.get_linked_parent_docs",
      soName
        ? {
            doctype: "Delivery Note Item",
            parenttype: "Delivery Note",
            link_field: "against_sales_order",
            link_value: soName,
          }
        : undefined,
      soName ? `micromax.dn-parents-so.${soName}` : null,
    );

  const raw = parentNames as unknown;
  const names: string[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { message?: unknown })?.message)
      ? ((raw as { message: string[] }).message)
      : [];

  const { data, isLoading, error, mutate } = useFrappeGetDocList<DeliveryNote>(
    "Delivery Note",
    names.length > 0
      ? {
          fields: DELIVERY_NOTE_FIELDS as unknown as (keyof DeliveryNote)[],
          filters: [["name", "in", names]],
          limit: 200,
          orderBy: { field: "posting_date", order: "desc" },
        }
      : { filters: [["name", "=", ""]], limit: 0 },
    names.length > 0 ? `micromax.dn-for-so.${soName}` : undefined,
  );

  return {
    data,
    isLoading: namesLoading || isLoading,
    error: namesError || error,
    mutate: () => {
      void refreshNames();
      void mutate();
    },
  };
}

/** Status distribution for charts/lists. */
export function deliveryNoteStatusDistribution(rows: DeliveryNote[] | undefined) {
  const counts = new Map<string, number>();
  (rows ?? []).forEach((r) => {
    const s = r.status || "Draft";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  });
  return [...counts.entries()].map(([label, value]) => ({ label, value }));
}
