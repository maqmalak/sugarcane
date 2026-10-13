import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeGetCall,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { PurchaseReceipt } from "@/types/frappe";

const PURCHASE_RECEIPT_FIELDS = [
  "name",
  "posting_date",
  "supplier",
  "supplier_name",
  "company",
  "currency",
  "grand_total",
  "status",
  "docstatus",
  "per_billed",
  "per_returned",
  "supplier_delivery_note",
] as const;

/** List Purchase Receipts. */
export function usePurchaseReceipts(args?: {
  filters?: unknown[][];
  limit?: number;
  enabled?: boolean;
}) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<PurchaseReceipt>(
    "Purchase Receipt",
    {
      fields: PURCHASE_RECEIPT_FIELDS as unknown as (keyof PurchaseReceipt)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.pr.${JSON.stringify({ filters, limit })}` : null,
  );
}

/** Single Purchase Receipt (full document with items). */
export function usePurchaseReceipt(name?: string) {
  return useFrappeGetDoc<PurchaseReceipt>(
    "Purchase Receipt",
    name ?? undefined,
    name ? `micromax.pr.doc.${name}` : null,
  );
}

/** Create / Update / Delete mutations. */
export function usePurchaseReceiptMutations(onSuccess?: (doc: PurchaseReceipt) => void) {
  const create = useFrappeCreateDoc<PurchaseReceipt>();
  const update = useFrappeUpdateDoc<PurchaseReceipt>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: async (values: Partial<PurchaseReceipt>) => {
      const doc = await create.createDoc("Purchase Receipt", values as PurchaseReceipt);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<PurchaseReceipt>) => {
      const doc = await update.updateDoc("Purchase Receipt", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("Purchase Receipt", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

/**
 * List Purchase Receipts linked to a Purchase Order.
 *
 * The link lives on the child table (Purchase Receipt Item.purchase_order).
 * The REST ``get_list`` API strips the ``parent`` field for child tables, so we
 * use a server-side helper that returns the distinct parent names, then fetch
 * the parent documents.
 */
export function usePurchaseReceiptsForPO(poName?: string) {
  const { data: parentNames, isLoading: namesLoading, error: namesError, mutate: refreshNames } =
    useFrappeGetCall<string[]>(
      "mm_core.api.get_linked_parent_docs",
      poName
        ? {
            doctype: "Purchase Receipt Item",
            parenttype: "Purchase Receipt",
            // NOTE: uses the legacy `purchase_order` kwarg — matches the
            // currently-deployed micromax backend. Once that app is redeployed
            // with the generalized `link_field`/`link_value` signature (see
            // apps/micromax/micromax/hooks.py), this can switch over too, but
            // the legacy kwarg keeps working either way.
            purchase_order: poName,
          }
        : undefined,
      poName ? `micromax.pr-parents.${poName}` : null,
    );

    // frappe-react-sdk's useFrappeGetCall returns the full response envelope,
    // so the array lives on .message — normalise defensively.
    const raw = parentNames as unknown;
    const names: string[] = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { message?: unknown })?.message)
        ? ((raw as { message: string[] }).message)
        : [];

  const { data, isLoading, error, mutate } = useFrappeGetDocList<PurchaseReceipt>(
    "Purchase Receipt",
    names.length > 0
      ? {
          fields: PURCHASE_RECEIPT_FIELDS as unknown as (keyof PurchaseReceipt)[],
          filters: [["name", "in", names]],
          limit: 200,
          orderBy: { field: "posting_date", order: "desc" },
        }
      : { filters: [["name", "=", ""]], limit: 0 },
    names.length > 0 ? `micromax.pr-for-po.${poName}` : undefined,
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
export function purchaseReceiptStatusDistribution(rows: PurchaseReceipt[] | undefined) {
  const counts = new Map<string, number>();
  (rows ?? []).forEach((r) => {
    const s = r.status || "Draft";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  });
  return [...counts.entries()].map(([label, value]) => ({ label, value }));
}
