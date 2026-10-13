import { useFrappeGetDocList, useFrappeGetDoc, useFrappeCreateDoc, useFrappeUpdateDoc, useFrappeDeleteDoc } from "frappe-react-sdk";
import type { Company } from "@/types/frappe";

/** List of companies. */
export function useCompanies(enabled = true) {
  return useFrappeGetDocList<Company>(
    "Company",
    { fields: ["name", "company_name", "default_currency", "abbr", "is_group", "parent_company", "country"], orderBy: { field: "name", order: "asc" } },
    enabled ? "micromax.companies" : null,
  );
}

export function useCompany(name?: string) {
  return useFrappeGetDoc<Company>("Company", name ?? undefined, name ? `micromax.company.${name}` : null);
}

/** Create / update / delete for the Company doctype. */
export function useCompanyMutations() {
  const create = useFrappeCreateDoc<Company>();
  const update = useFrappeUpdateDoc<Company>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<Company>) => create.createDoc("Company", values as Company),
    updateDoc: (name: string, values: Partial<Company>) => update.updateDoc("Company", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Company", name),
    loading: create.loading || update.loading || del.loading,
  };
}

/** Companies available to the current user (respects ERPNext per-user permissions). */
export function useCompanyOptions(enabled = true) {
  const { data, error, isLoading } = useCompanies(enabled);
  return {
    options: (data ?? []).map((c) => ({ value: c.name, label: c.company_name ?? c.name })),
    data,
    error,
    isLoading,
  };
}