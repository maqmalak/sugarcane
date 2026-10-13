import * as React from "react";
import { useCompanies } from "./useCompanies";
import { useAuth } from "./useAuth";
import { setActiveCurrency } from "@/utils/currency";

/**
 * Active-company context. The selected company is applied as a filter to all
 * company-scoped list queries. ERPNext still enforces the real per-user company
 * restrictions server-side; this is purely a UI scope selector.
 */
interface CompanyContextValue {
  company?: string;
  setCompany: (company: string) => void;
  companies: { name: string; label: string; currency?: string }[];
  /** `default_currency` of the currently selected company, if known. */
  companyCurrency?: string;
  isLoading: boolean;
}

const CompanyContext = React.createContext<CompanyContextValue | null>(null);
const STORAGE_KEY = "micromax-active-company";

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, defaultCompany } = useAuth();
  const { data, isLoading } = useCompanies(isAuthenticated);
  const [company, setCompanyState] = React.useState<string | undefined>(
    () => localStorage.getItem(STORAGE_KEY) ?? undefined,
  );

  const companies = React.useMemo(
    () => (data ?? []).map((c) => ({ name: c.name, label: c.company_name ?? c.name, currency: c.default_currency })),
    [data],
  );

  const companyCurrency = companies.find((c) => c.name === company)?.currency;

  // Keep money formatting's app-wide fallback currency in sync with whatever
  // company is active, so amounts rendered without an explicit currency (list
  // columns, KPI tiles) reflect the real selected company instead of a static code.
  React.useEffect(() => {
    setActiveCurrency(companyCurrency);
  }, [companyCurrency]);

  // Pick a sensible default once the list resolves.
  React.useEffect(() => {
    if (company && companies.some((c) => c.name === company)) return;
    const fallback =
      (defaultCompany && companies.find((c) => c.name === defaultCompany)?.name) ??
      companies[0]?.name;
    if (fallback) setCompanyState(fallback);
  }, [companies, company, defaultCompany]);

  const setCompany = React.useCallback((next: string) => {
    setCompanyState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <CompanyContext.Provider value={{ company, setCompany, companies, companyCurrency, isLoading }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompanyContext(): CompanyContextValue {
  const ctx = React.useContext(CompanyContext);
  if (!ctx) throw new Error("useCompanyContext must be used within <CompanyProvider>");
  return ctx;
}

/** The selected company, or "" outside a <CompanyProvider> (for shared widgets that also render elsewhere). */
export function useSelectedCompany(): string {
  return React.useContext(CompanyContext)?.company ?? "";
}

/** Build a company filter for list queries; empty when no company is selected. */
export function companyFilter(company?: string, fieldname = "company"): unknown[][] {
  return company ? [[fieldname, "=", company]] : [];
}