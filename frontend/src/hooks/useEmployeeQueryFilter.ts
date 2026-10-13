import { useSearchParams } from "react-router-dom";

/**
 * Reads `?employee=<name>` from the URL — used by the Employee detail page's
 * Connections tab to deep-link into these list pages pre-filtered to one
 * employee, the same way `useCompanyContext`'s `companyFilter` scopes by company.
 */
export function useEmployeeQueryFilter(): { employee: string | null; filter: unknown[][] } {
  const [searchParams] = useSearchParams();
  const employee = searchParams.get("employee");
  return { employee, filter: employee ? [["employee", "=", employee]] : [] };
}
