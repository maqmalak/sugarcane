import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { CrmOrganization } from "@/types/frappe";

const CRM_ORGANIZATION_FIELDS = [
  "name",
  "organization_name",
  "website",
  "industry",
  "territory",
  "no_of_employees",
  "annual_revenue",
  "currency",
  "modified",
] as const;

/** List CRM Organizations ("Accounts"). */
export function useCrmOrganizations(args?: { filters?: unknown[][]; limit?: number; enabled?: boolean }) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<CrmOrganization>(
    "CRM Organization",
    {
      fields: CRM_ORGANIZATION_FIELDS as unknown as (keyof CrmOrganization)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.crm.organizations.${JSON.stringify({ filters, limit })}` : null,
  );
}

export function useCrmOrganization(name?: string) {
  return useFrappeGetDoc<CrmOrganization>(
    "CRM Organization",
    name ?? undefined,
    name ? `micromax.crm.organization.doc.${name}` : null,
  );
}

export function useCrmOrganizationMutations(onSuccess?: (doc: CrmOrganization) => void) {
  const create = useFrappeCreateDoc<CrmOrganization>();
  const update = useFrappeUpdateDoc<CrmOrganization>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: async (values: Partial<CrmOrganization>) => {
      const doc = await create.createDoc("CRM Organization", values as CrmOrganization);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<CrmOrganization>) => {
      const doc = await update.updateDoc("CRM Organization", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("CRM Organization", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}
