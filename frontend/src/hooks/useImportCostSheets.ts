import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { ImportCostSheet } from "@/types/frappe";

const COST_FIELDS = [
  "name",
  "cost_sheet_date",
  "company",
  "supplier",
  "purchase_order",
  "import_shipment",
  "purchase_receipt",
  "currency",
  "total_purchase_value",
  "total_landed_cost",
] as const;

export function useImportCostSheets(args?: { filters?: unknown[][]; limit?: number; enabled?: boolean }) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<ImportCostSheet>(
    "Import Cost Sheet",
    {
      fields: COST_FIELDS as unknown as (keyof ImportCostSheet)[],
      filters: filters as [],
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.impcost.${JSON.stringify({ filters, limit })}` : null,
  );
}

export function useImportCostSheet(name?: string) {
  return useFrappeGetDoc<ImportCostSheet>(
    "Import Cost Sheet",
    name ?? undefined,
    name ? `micromax.impcost.doc.${name}` : null,
  );
}

export function useImportCostSheetMutations(onSuccess?: (doc: ImportCostSheet) => void) {
  const create = useFrappeCreateDoc<ImportCostSheet>();
  const update = useFrappeUpdateDoc<ImportCostSheet>();
  const del = useFrappeDeleteDoc();
  return {
    createDoc: async (values: Partial<ImportCostSheet>) => {
      const doc = await create.createDoc("Import Cost Sheet", values as ImportCostSheet);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<ImportCostSheet>) => {
      const doc = await update.updateDoc("Import Cost Sheet", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("Import Cost Sheet", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

export function useExportPackingList(args?: { limit?: number; enabled?: boolean }) {
  const { limit: _limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<ImportCostSheet>(
    "Export Packing Details",
    { fields: ["name", "packing_no", "packing_date", "sales_order", "customer", "total_cartons", "total_pieces"] as (keyof ImportCostSheet)[], limit: _limit },
    enabled ? "micromax.exppack" : null,
  );
}