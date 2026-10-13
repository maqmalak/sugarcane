import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeGetDocCount,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { LCProforma } from "@/types/frappe";

const LC_FIELDS = [
  "name",
  "proforma_no",
  "proforma_date",
  "company",
  "customer",
  "buyer_po_no",
  "export_order",
  "currency",
  "lc_no",
  "lc_date",
  "lc_type",
  "lc_amount",
  "lc_currency",
  "lc_expiry_date",
  "latest_shipment_date",
  "lc_status",
  "workflow_state",
  "total_quantity",
  "total_proforma_value",
  "incoterm",
  "country_of_destination",
] as const;

/** List LC Proformas. */
export function useLCProformas(args?: { filters?: unknown[][]; limit?: number; enabled?: boolean }) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<LCProforma>(
    "LC Proforma",
    {
      fields: LC_FIELDS as unknown as (keyof LCProforma)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.lc.${JSON.stringify({ filters, limit })}` : null,
  );
}

/** Single LC Proforma (full document with child items). */
export function useLCProforma(name?: string) {
  return useFrappeGetDoc<LCProforma>("LC Proforma", name ?? undefined, name ? `micromax.lc.doc.${name}` : null);
}

export function useLCProformaCount(filters: unknown[][], enabled = true) {
  return useFrappeGetDocCount<LCProforma>(
    "LC Proforma",
    filters as any,
    false,
    enabled ? `micromax.lc.count.${JSON.stringify(filters)}` : null,
  );
}

/** Create / Update / Delete mutations with built-in callbacks & loading state. */
export function useLCProformaMutations(onSuccess?: (doc: LCProforma) => void) {
  const create = useFrappeCreateDoc<LCProforma>();
  const update = useFrappeUpdateDoc<LCProforma>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: async (values: Partial<LCProforma>) => {
      const doc = await create.createDoc("LC Proforma", values as LCProforma);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<LCProforma>) => {
      const doc = await update.updateDoc("LC Proforma", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("LC Proforma", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

/** LC status distribution counts (for charts/lists). */
export function lcStatusDistribution(rows: LCProforma[] | undefined) {
  const counts = new Map<string, number>();
  (rows ?? []).forEach((r) => {
    const s = r.lc_status || r.workflow_state || "Draft";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  });
  return [...counts.entries()].map(([label, value]) => ({ label, value }));
}