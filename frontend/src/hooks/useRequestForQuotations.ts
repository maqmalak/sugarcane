import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { RequestForQuotation } from "@/types/frappe";

const RFQ_LIST_FIELDS = [
  "name",
  "title",
  "transaction_date",
  "schedule_date",
  "company",
  "subject",
  "status",
  "docstatus",
] as const;

/** List Requests for Quotation. */
export function useRequestForQuotations(args?: { filters?: unknown[][]; limit?: number; enabled?: boolean }) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<RequestForQuotation>(
    "Request for Quotation",
    {
      fields: RFQ_LIST_FIELDS as unknown as (keyof RequestForQuotation)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.rfq.${JSON.stringify({ filters, limit })}` : null,
  );
}

/** Single Request for Quotation (full document with items + suppliers). */
export function useRequestForQuotation(name?: string) {
  return useFrappeGetDoc<RequestForQuotation>(
    "Request for Quotation",
    name ?? undefined,
    name ? `micromax.rfq.doc.${name}` : null,
  );
}

/** Create / Update / Delete mutations. */
export function useRequestForQuotationMutations() {
  const create = useFrappeCreateDoc<RequestForQuotation>();
  const update = useFrappeUpdateDoc<RequestForQuotation>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<RequestForQuotation>) =>
      create.createDoc("Request for Quotation", values as RequestForQuotation),
    updateDoc: (name: string, values: Partial<RequestForQuotation>) =>
      update.updateDoc("Request for Quotation", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Request for Quotation", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}
