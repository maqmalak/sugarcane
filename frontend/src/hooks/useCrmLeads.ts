import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { CrmLead } from "@/types/frappe";

const CRM_LEAD_FIELDS = [
  "name",
  "lead_name",
  "first_name",
  "last_name",
  "organization",
  "job_title",
  "status",
  "email",
  "mobile_no",
  "phone",
  "source",
  "industry",
  "website",
  "address",
  "territory",
  "lead_owner",
  "annual_revenue",
  "converted",
  "image",
  "modified",
  "priority",
] as const;

/** List CRM Leads (flat list view — use useCrmLeadKanban for the pipeline board). */
export function useCrmLeads(args?: { filters?: unknown[][]; limit?: number; enabled?: boolean }) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<CrmLead>(
    "CRM Lead",
    {
      fields: CRM_LEAD_FIELDS as unknown as (keyof CrmLead)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.crm.leads.${JSON.stringify({ filters, limit })}` : null,
  );
}

/** Single CRM Lead (full document). */
export function useCrmLead(name?: string) {
  return useFrappeGetDoc<CrmLead>("CRM Lead", name ?? undefined, name ? `micromax.crm.lead.doc.${name}` : null);
}

/** Create / Update / Delete mutations for CRM Lead. */
export function useCrmLeadMutations(onSuccess?: (doc: CrmLead) => void) {
  const create = useFrappeCreateDoc<CrmLead>();
  const update = useFrappeUpdateDoc<CrmLead>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: async (values: Partial<CrmLead>) => {
      const doc = await create.createDoc("CRM Lead", values as CrmLead);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<CrmLead>) => {
      const doc = await update.updateDoc("CRM Lead", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("CRM Lead", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

/** Status distribution for charts. */
export function crmLeadStatusDistribution(rows: CrmLead[] | undefined) {
  const counts = new Map<string, number>();
  (rows ?? []).forEach((r) => {
    const s = r.status || "Lead";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  });
  return [...counts.entries()].map(([label, value]) => ({ label, value }));
}
