import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeGetCall,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { PurchaseInvoice } from "@/types/frappe";

const PURCHASE_INVOICE_FIELDS = [
  "name",
  "posting_date",
  "due_date",
  "supplier",
  "supplier_name",
  "company",
  "currency",
  "grand_total",
  "outstanding_amount",
  "status",
  "docstatus",
  "bill_no",
  "update_stock",
] as const;

/** List Purchase Invoices. */
export function usePurchaseInvoices(args?: {
  filters?: unknown[][];
  limit?: number;
  enabled?: boolean;
}) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<PurchaseInvoice>(
    "Purchase Invoice",
    {
      fields: PURCHASE_INVOICE_FIELDS as unknown as (keyof PurchaseInvoice)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.pi.${JSON.stringify({ filters, limit })}` : null,
  );
}

/** Single Purchase Invoice (full document with items). */
export function usePurchaseInvoice(name?: string) {
  return useFrappeGetDoc<PurchaseInvoice>(
    "Purchase Invoice",
    name ?? undefined,
    name ? `micromax.pi.doc.${name}` : null,
  );
}

/** Create / Update / Delete mutations. */
export function usePurchaseInvoiceMutations(onSuccess?: (doc: PurchaseInvoice) => void) {
  const create = useFrappeCreateDoc<PurchaseInvoice>();
  const update = useFrappeUpdateDoc<PurchaseInvoice>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: async (values: Partial<PurchaseInvoice>) => {
      const doc = await create.createDoc("Purchase Invoice", values as PurchaseInvoice);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<PurchaseInvoice>) => {
      const doc = await update.updateDoc("Purchase Invoice", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("Purchase Invoice", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

/**
 * List Purchase Invoices linked to a Purchase Order.
 *
 * The link lives on the child table (Purchase Invoice Item.purchase_order).
 * The REST ``get_list`` API strips the ``parent`` field for child tables, so we
 * use a server-side helper that returns the distinct parent names, then fetch
 * the parent documents.
 */
export function usePurchaseInvoicesForPO(poName?: string) {
  const { data: parentNames, isLoading: namesLoading, error: namesError, mutate: refreshNames } =
    useFrappeGetCall<string[]>(
      "mm_core.api.get_linked_parent_docs",
      poName
        ? {
            doctype: "Purchase Invoice Item",
            parenttype: "Purchase Invoice",
            // NOTE: uses the legacy `purchase_order` kwarg — matches the
            // currently-deployed micromax backend (see usePurchaseReceiptsForPO).
            purchase_order: poName,
          }
        : undefined,
      poName ? `micromax.pi-parents-po.${poName}` : null,
    );

  const raw = parentNames as unknown;
  const names: string[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { message?: unknown })?.message)
      ? ((raw as { message: string[] }).message)
      : [];

  const { data, isLoading, error, mutate } = useFrappeGetDocList<PurchaseInvoice>(
    "Purchase Invoice",
    names.length > 0
      ? {
          fields: PURCHASE_INVOICE_FIELDS as unknown as (keyof PurchaseInvoice)[],
          filters: [["name", "in", names]],
          limit: 200,
          orderBy: { field: "posting_date", order: "desc" },
        }
      : { filters: [["name", "=", ""]], limit: 0 },
    names.length > 0 ? `micromax.pi-for-po.${poName}` : undefined,
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

/**
 * List Purchase Invoices linked to a Purchase Receipt.
 *
 * Same server-side helper approach as usePurchaseInvoicesForPO, filtered on
 * Purchase Invoice Item.purchase_receipt instead.
 */
export function usePurchaseInvoicesForPR(prName?: string) {
  const { data: parentNames, isLoading: namesLoading, error: namesError, mutate: refreshNames } =
    useFrappeGetCall<string[]>(
      "mm_core.api.get_linked_parent_docs",
      prName
        ? {
            doctype: "Purchase Invoice Item",
            parenttype: "Purchase Invoice",
            link_field: "purchase_receipt",
            link_value: prName,
          }
        : undefined,
      prName ? `micromax.pi-parents-pr.${prName}` : null,
    );

  const raw = parentNames as unknown;
  const names: string[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { message?: unknown })?.message)
      ? ((raw as { message: string[] }).message)
      : [];

  const { data, isLoading, error, mutate } = useFrappeGetDocList<PurchaseInvoice>(
    "Purchase Invoice",
    names.length > 0
      ? {
          fields: PURCHASE_INVOICE_FIELDS as unknown as (keyof PurchaseInvoice)[],
          filters: [["name", "in", names]],
          limit: 200,
          orderBy: { field: "posting_date", order: "desc" },
        }
      : { filters: [["name", "=", ""]], limit: 0 },
    names.length > 0 ? `micromax.pi-for-pr.${prName}` : undefined,
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
export function purchaseInvoiceStatusDistribution(rows: PurchaseInvoice[] | undefined) {
  const counts = new Map<string, number>();
  (rows ?? []).forEach((r) => {
    const s = r.status || "Draft";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  });
  return [...counts.entries()].map(([label, value]) => ({ label, value }));
}
