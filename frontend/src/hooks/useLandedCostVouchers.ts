import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeGetCall,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { LandedCostReceiptDocType, LandedCostVoucher } from "@/types/frappe";

const LCV_LIST_FIELDS = [
  "name",
  "company",
  "posting_date",
  "distribute_charges_based_on",
  "total_taxes_and_charges",
  "docstatus",
] as const;

/** List Landed Cost Vouchers. */
export function useLandedCostVouchers(args?: {
  filters?: unknown[][];
  limit?: number;
  enabled?: boolean;
}) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<LandedCostVoucher>(
    "Landed Cost Voucher",
    {
      fields: LCV_LIST_FIELDS as unknown as (keyof LandedCostVoucher)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.lcv.${JSON.stringify({ filters, limit })}` : null,
  );
}

/** Single Landed Cost Voucher (full document with items/taxes/receipts). */
export function useLandedCostVoucher(name?: string) {
  return useFrappeGetDoc<LandedCostVoucher>(
    "Landed Cost Voucher",
    name ?? undefined,
    name ? `micromax.lcv.doc.${name}` : null,
  );
}

/** Create / Update / Delete mutations. */
export function useLandedCostVoucherMutations(onSuccess?: (doc: LandedCostVoucher) => void) {
  const create = useFrappeCreateDoc<LandedCostVoucher>();
  const update = useFrappeUpdateDoc<LandedCostVoucher>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: async (values: Partial<LandedCostVoucher>) => {
      const doc = await create.createDoc("Landed Cost Voucher", values as LandedCostVoucher);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<LandedCostVoucher>) => {
      const doc = await update.updateDoc("Landed Cost Voucher", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("Landed Cost Voucher", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

/**
 * List Landed Cost Vouchers referencing a given Purchase Receipt / Purchase
 * Invoice (the "Vouchers" child table, Landed Cost Purchase Receipt).
 * `receipt_document` is a Dynamic Link shared by several doctypes, so
 * `receipt_document_type` is passed as an extra exact-match filter.
 */
export function useLandedCostVouchersFor(docType: LandedCostReceiptDocType, docName?: string) {
  const { data: parentNames, isLoading: namesLoading, error: namesError, mutate: refreshNames } =
    useFrappeGetCall<string[]>(
      "mm_core.api.get_linked_parent_docs",
      docName
        ? {
            doctype: "Landed Cost Purchase Receipt",
            parenttype: "Landed Cost Voucher",
            link_field: "receipt_document",
            link_value: docName,
            extra_filters: JSON.stringify({ receipt_document_type: docType }),
          }
        : undefined,
      docName ? `micromax.lcv-parents.${docType}.${docName}` : null,
    );

  const raw = parentNames as unknown;
  const names: string[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { message?: unknown })?.message)
      ? ((raw as { message: string[] }).message)
      : [];

  const { data, isLoading, error, mutate } = useFrappeGetDocList<LandedCostVoucher>(
    "Landed Cost Voucher",
    names.length > 0
      ? {
          fields: LCV_LIST_FIELDS as unknown as (keyof LandedCostVoucher)[],
          filters: [["name", "in", names]],
          limit: 200,
          orderBy: { field: "posting_date", order: "desc" },
        }
      : { filters: [["name", "=", ""]], limit: 0 },
    names.length > 0 ? `micromax.lcv-for.${docType}.${docName}` : undefined,
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
