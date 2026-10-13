import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeGetCall,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { SalesInvoice } from "@/types/frappe";

const SALES_INVOICE_FIELDS = [
  "name",
  "posting_date",
  "due_date",
  "customer",
  "customer_name",
  "company",
  "currency",
  "grand_total",
  "outstanding_amount",
  "status",
  "docstatus",
  "update_stock",
] as const;

/** List Sales Invoices. */
export function useSalesInvoices(args?: { filters?: unknown[][]; limit?: number; enabled?: boolean }) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<SalesInvoice>(
    "Sales Invoice",
    {
      fields: SALES_INVOICE_FIELDS as unknown as (keyof SalesInvoice)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.si.${JSON.stringify({ filters, limit })}` : null,
  );
}

/** Single Sales Invoice (full document with items). */
export function useSalesInvoice(name?: string) {
  return useFrappeGetDoc<SalesInvoice>("Sales Invoice", name ?? undefined, name ? `micromax.si.doc.${name}` : null);
}

/** Create / Update / Delete mutations. */
export function useSalesInvoiceMutations(onSuccess?: (doc: SalesInvoice) => void) {
  const create = useFrappeCreateDoc<SalesInvoice>();
  const update = useFrappeUpdateDoc<SalesInvoice>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: async (values: Partial<SalesInvoice>) => {
      const doc = await create.createDoc("Sales Invoice", values as SalesInvoice);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<SalesInvoice>) => {
      const doc = await update.updateDoc("Sales Invoice", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("Sales Invoice", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

function useSalesInvoicesLinkedBy(linkField: string, keyPrefix: string, value?: string) {
  const { data: parentNames, isLoading: namesLoading, error: namesError, mutate: refreshNames } =
    useFrappeGetCall<string[]>(
      "mm_core.api.get_linked_parent_docs",
      value
        ? {
            doctype: "Sales Invoice Item",
            parenttype: "Sales Invoice",
            link_field: linkField,
            link_value: value,
          }
        : undefined,
      value ? `micromax.si-parents-${keyPrefix}.${value}` : null,
    );

  const raw = parentNames as unknown;
  const names: string[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { message?: unknown })?.message)
      ? ((raw as { message: string[] }).message)
      : [];

  const { data, isLoading, error, mutate } = useFrappeGetDocList<SalesInvoice>(
    "Sales Invoice",
    names.length > 0
      ? {
          fields: SALES_INVOICE_FIELDS as unknown as (keyof SalesInvoice)[],
          filters: [["name", "in", names]],
          limit: 200,
          orderBy: { field: "posting_date", order: "desc" },
        }
      : { filters: [["name", "=", ""]], limit: 0 },
    names.length > 0 ? `micromax.si-for-${keyPrefix}.${value}` : undefined,
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

/** List Sales Invoices linked to a Sales Order (Sales Invoice Item.sales_order). */
export function useSalesInvoicesForSO(soName?: string) {
  return useSalesInvoicesLinkedBy("sales_order", "so", soName);
}

/** List Sales Invoices linked to a Delivery Note (Sales Invoice Item.delivery_note). */
export function useSalesInvoicesForDN(dnName?: string) {
  return useSalesInvoicesLinkedBy("delivery_note", "dn", dnName);
}

/** Status distribution for charts/lists. */
export function salesInvoiceStatusDistribution(rows: SalesInvoice[] | undefined) {
  const counts = new Map<string, number>();
  (rows ?? []).forEach((r) => {
    const s = r.status || "Draft";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  });
  return [...counts.entries()].map(([label, value]) => ({ label, value }));
}
