import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { CrmDeal } from "@/types/frappe";

const CRM_DEAL_FIELDS = [
  "name",
  "organization",
  "organization_name",
  "lead_name",
  "status",
  "deal_owner",
  "email",
  "mobile_no",
  "currency",
  "deal_value",
  "expected_deal_value",
  "expected_closure_date",
  "closed_date",
  "probability",
  "territory",
  "source",
  "next_step",
  "modified",
] as const;

/** List CRM Deals (flat list view — use useCrmDealKanban for the pipeline board). */
export function useCrmDeals(args?: { filters?: unknown[][]; limit?: number; enabled?: boolean }) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<CrmDeal>(
    "CRM Deal",
    {
      fields: CRM_DEAL_FIELDS as unknown as (keyof CrmDeal)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.crm.deals.${JSON.stringify({ filters, limit })}` : null,
  );
}

/** Single CRM Deal (full document). */
export function useCrmDeal(name?: string) {
  return useFrappeGetDoc<CrmDeal>("CRM Deal", name ?? undefined, name ? `micromax.crm.deal.doc.${name}` : null);
}

/** Create / Update / Delete mutations for CRM Deal. */
export function useCrmDealMutations(onSuccess?: (doc: CrmDeal) => void) {
  const create = useFrappeCreateDoc<CrmDeal>();
  const update = useFrappeUpdateDoc<CrmDeal>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: async (values: Partial<CrmDeal>) => {
      const doc = await create.createDoc("CRM Deal", values as CrmDeal);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<CrmDeal>) => {
      const doc = await update.updateDoc("CRM Deal", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("CRM Deal", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

/** Pipeline value grouped by status, for the dashboard/detail summary. */
export function crmDealValueByStatus(rows: CrmDeal[] | undefined) {
  const totals = new Map<string, number>();
  (rows ?? []).forEach((r) => {
    const s = r.status || "Qualification";
    totals.set(s, (totals.get(s) ?? 0) + Number(r.deal_value ?? r.expected_deal_value ?? 0));
  });
  return [...totals.entries()].map(([label, value]) => ({ label, value }));
}
