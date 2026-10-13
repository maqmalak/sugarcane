import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { StockEntry } from "@/types/frappe";

const STOCK_ENTRY_FIELDS = [
  "name",
  "posting_date",
  "company",
  "purpose",
  "from_warehouse",
  "to_warehouse",
  "total_amount",
  "docstatus",
] as const;

/** List Stock Entries. */
export function useStockEntries(args?: { filters?: unknown[][]; limit?: number; enabled?: boolean }) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<StockEntry>(
    "Stock Entry",
    {
      fields: STOCK_ENTRY_FIELDS as unknown as (keyof StockEntry)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.se.${JSON.stringify({ filters, limit })}` : null,
  );
}

/** Single Stock Entry (full document with items). */
export function useStockEntry(name?: string) {
  return useFrappeGetDoc<StockEntry>("Stock Entry", name ?? undefined, name ? `micromax.se.doc.${name}` : null);
}

/** Create / Update / Delete mutations. */
export function useStockEntryMutations(onSuccess?: (doc: StockEntry) => void) {
  const create = useFrappeCreateDoc<StockEntry>();
  const update = useFrappeUpdateDoc<StockEntry>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: async (values: Partial<StockEntry>) => {
      const doc = await create.createDoc("Stock Entry", values as StockEntry);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<StockEntry>) => {
      const doc = await update.updateDoc("Stock Entry", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("Stock Entry", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

/** Status distribution for charts/lists (Stock Entry has no `status` select — bucket by purpose instead). */
export function stockEntryPurposeDistribution(rows: StockEntry[] | undefined) {
  const counts = new Map<string, number>();
  (rows ?? []).forEach((r) => {
    const p = r.purpose || "Material Transfer";
    counts.set(p, (counts.get(p) ?? 0) + 1);
  });
  return [...counts.entries()].map(([label, value]) => ({ label, value }));
}
