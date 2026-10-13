import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeGetDocCount,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { PurchaseOrder } from "@/types/frappe";

const PO_LIST_FIELDS = [
  "name",
  "supplier",
  "supplier_name",
  "transaction_date",
  "schedule_date",
  "company",
  "currency",
  "grand_total",
  "status",
  "docstatus",
  "per_received",
  "per_billed",
  "total_qty",
] as const;

/** List Purchase Orders. */
export function usePurchaseOrders(args?: {
  filters?: unknown[][];
  limit?: number;
  enabled?: boolean;
}) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<PurchaseOrder>(
    "Purchase Order",
    {
      fields: PO_LIST_FIELDS as unknown as (keyof PurchaseOrder)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.po.${JSON.stringify({ filters, limit })}` : null,
  );
}

/** Single Purchase Order (full document with items). */
export function usePurchaseOrder(name?: string) {
  return useFrappeGetDoc<PurchaseOrder>(
    "Purchase Order",
    name ?? undefined,
    name ? `micromax.po.doc.${name}` : null,
  );
}

export function usePurchaseOrderCount(filters: unknown[][], enabled = true) {
  return useFrappeGetDocCount(
    "Purchase Order",
    filters as any,
    false,
    enabled ? `micromax.po.count.${JSON.stringify(filters)}` : null,
  );
}

/** Create / Update / Delete mutations. */
export function usePurchaseOrderMutations(onSuccess?: (doc: PurchaseOrder) => void) {
  const create = useFrappeCreateDoc<PurchaseOrder>();
  const update = useFrappeUpdateDoc<PurchaseOrder>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: async (values: Partial<PurchaseOrder>) => {
      const doc = await create.createDoc("Purchase Order", values as PurchaseOrder);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<PurchaseOrder>) => {
      const doc = await update.updateDoc("Purchase Order", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("Purchase Order", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

/** Status distribution for charts/lists. */
export function poStatusDistribution(rows: PurchaseOrder[] | undefined) {
  const counts = new Map<string, number>();
  (rows ?? []).forEach((r) => {
    const s = r.status || "Draft";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  });
  return [...counts.entries()].map(([label, value]) => ({ label, value }));
}
