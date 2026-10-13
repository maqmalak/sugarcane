import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeGetCall,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { MaterialRequest, PurchaseOrder, RequestForQuotation, StockEntry } from "@/types/frappe";

const MR_LIST_FIELDS = [
  "name",
  "title",
  "material_request_type",
  "transaction_date",
  "schedule_date",
  "company",
  "status",
  "docstatus",
  "per_ordered",
  "per_received",
] as const;

/** List Material Requests. */
export function useMaterialRequests(args?: { filters?: unknown[][]; limit?: number; enabled?: boolean }) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<MaterialRequest>(
    "Material Request",
    {
      fields: MR_LIST_FIELDS as unknown as (keyof MaterialRequest)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.mr.${JSON.stringify({ filters, limit })}` : null,
  );
}

/** Single Material Request (full document with items). */
export function useMaterialRequest(name?: string) {
  return useFrappeGetDoc<MaterialRequest>(
    "Material Request",
    name ?? undefined,
    name ? `micromax.mr.doc.${name}` : null,
  );
}

/** Create / Update / Delete mutations. */
export function useMaterialRequestMutations() {
  const create = useFrappeCreateDoc<MaterialRequest>();
  const update = useFrappeUpdateDoc<MaterialRequest>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<MaterialRequest>) => create.createDoc("Material Request", values as MaterialRequest),
    updateDoc: (name: string, values: Partial<MaterialRequest>) => update.updateDoc("Material Request", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Material Request", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

const PO_FIELDS_FOR_MR = [
  "name",
  "supplier",
  "supplier_name",
  "transaction_date",
  "status",
  "docstatus",
  "grand_total",
  "currency",
] as const;

/** Purchase Orders created from ("Create Purchase Order" on) a Material Request — linked via Purchase Order Item.material_request. */
export function usePurchaseOrdersForMR(mrName?: string) {
  const { data: parentNames, isLoading: namesLoading, error: namesError, mutate: refreshNames } =
    useFrappeGetCall<string[]>(
      "mm_core.api.get_linked_parent_docs",
      mrName
        ? {
            doctype: "Purchase Order Item",
            parenttype: "Purchase Order",
            link_field: "material_request",
            link_value: mrName,
          }
        : undefined,
      mrName ? `micromax.po-parents-mr.${mrName}` : null,
    );

  const raw = parentNames as unknown;
  const names: string[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { message?: unknown })?.message)
      ? ((raw as { message: string[] }).message)
      : [];

  const { data, isLoading, error, mutate } = useFrappeGetDocList<PurchaseOrder>(
    "Purchase Order",
    names.length > 0
      ? {
          fields: PO_FIELDS_FOR_MR as unknown as (keyof PurchaseOrder)[],
          filters: [["name", "in", names]],
          limit: 200,
          orderBy: { field: "transaction_date", order: "desc" },
        }
      : { filters: [["name", "=", ""]], limit: 0 },
    names.length > 0 ? `micromax.po-for-mr.${mrName}` : undefined,
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

const SE_FIELDS_FOR_MR = ["name", "posting_date", "purpose", "docstatus", "total_amount"] as const;

/** Stock Entries created from ("Create Stock Entry" on) a Material Request — linked via Stock Entry Detail.material_request. */
export function useStockEntriesForMR(mrName?: string) {
  const { data: parentNames, isLoading: namesLoading, error: namesError, mutate: refreshNames } =
    useFrappeGetCall<string[]>(
      "mm_core.api.get_linked_parent_docs",
      mrName
        ? {
            doctype: "Stock Entry Detail",
            parenttype: "Stock Entry",
            link_field: "material_request",
            link_value: mrName,
          }
        : undefined,
      mrName ? `micromax.se-parents-mr.${mrName}` : null,
    );

  const raw = parentNames as unknown;
  const names: string[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { message?: unknown })?.message)
      ? ((raw as { message: string[] }).message)
      : [];

  const { data, isLoading, error, mutate } = useFrappeGetDocList<StockEntry>(
    "Stock Entry",
    names.length > 0
      ? {
          fields: SE_FIELDS_FOR_MR as unknown as (keyof StockEntry)[],
          filters: [["name", "in", names]],
          limit: 200,
          orderBy: { field: "posting_date", order: "desc" },
        }
      : { filters: [["name", "=", ""]], limit: 0 },
    names.length > 0 ? `micromax.se-for-mr.${mrName}` : undefined,
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

const RFQ_FIELDS_FOR_MR = ["name", "transaction_date", "status", "docstatus", "company"] as const;

/** Requests for Quotation created from ("Create RFQ" on) a Material Request — linked via Request for Quotation Item.material_request. */
export function useRFQsForMR(mrName?: string) {
  const { data: parentNames, isLoading: namesLoading, error: namesError, mutate: refreshNames } =
    useFrappeGetCall<string[]>(
      "mm_core.api.get_linked_parent_docs",
      mrName
        ? {
            doctype: "Request for Quotation Item",
            parenttype: "Request for Quotation",
            link_field: "material_request",
            link_value: mrName,
          }
        : undefined,
      mrName ? `micromax.rfq-parents-mr.${mrName}` : null,
    );

  const raw = parentNames as unknown;
  const names: string[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { message?: unknown })?.message)
      ? ((raw as { message: string[] }).message)
      : [];

  const { data, isLoading, error, mutate } = useFrappeGetDocList<RequestForQuotation>(
    "Request for Quotation",
    names.length > 0
      ? {
          fields: RFQ_FIELDS_FOR_MR as unknown as (keyof RequestForQuotation)[],
          filters: [["name", "in", names]],
          limit: 200,
          orderBy: { field: "transaction_date", order: "desc" },
        }
      : { filters: [["name", "=", ""]], limit: 0 },
    names.length > 0 ? `micromax.rfq-for-mr.${mrName}` : undefined,
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
