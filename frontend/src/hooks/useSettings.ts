import {
  useFrappeGetDoc,
  useFrappeUpdateDoc,
  useFrappeGetDocList,
  useFrappeCreateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type {
  GlobalDefaults,
  AccountsSettings,
  AccountingDimension,
  SellingSettings,
  BuyingSettings,
  HRSettings,
  PayrollSettings,
} from "@/types/frappe";

/**
 * Single-doctype documents (one row system-wide) are addressed by their own
 * doctype name — Frappe's REST API treats `/api/resource/<DocType>/<DocType>`
 * as that row, same as any other named document.
 */
function useSingleDoc<T extends { name: string }>(doctype: string, cacheKey: string) {
  const { data, error, isLoading, mutate } = useFrappeGetDoc<T>(doctype, doctype, cacheKey);
  const { updateDoc: update, loading: saving } = useFrappeUpdateDoc<T>();

  const save = async (values: Partial<T>) => {
    const doc = await update(doctype, doctype, values);
    void mutate();
    return doc;
  };

  return { data, isLoading, error, mutate, save, saving };
}

/** Global Defaults — default company/currency/country and a few workspace-wide toggles. */
export function useGlobalDefaults() {
  return useSingleDoc<GlobalDefaults>("Global Defaults", "micromax.global-defaults");
}

/** Accounts Settings — site-wide accounting behavior (credit control, payment terms auto-fetch, GL display, ...). */
export function useAccountsSettings() {
  return useSingleDoc<AccountsSettings>("Accounts Settings", "micromax.accounts-settings");
}

/** Selling Settings — customer naming, default price list/territory, quotation/order behavior. */
export function useSellingSettings() {
  return useSingleDoc<SellingSettings>("Selling Settings", "micromax.selling-settings");
}

/** Buying Settings — supplier naming, default price list, PO/receipt requirements. */
export function useBuyingSettings() {
  return useSingleDoc<BuyingSettings>("Buying Settings", "micromax.buying-settings");
}

/** HR Settings — employee naming, leave/expense approval rules, reminder emails. */
export function useHRSettings() {
  return useSingleDoc<HRSettings>("HR Settings", "micromax.hr-settings");
}

/** Payroll Settings — payroll basis, attendance handling, salary slip emailing. */
export function usePayrollSettings() {
  return useSingleDoc<PayrollSettings>("Payroll Settings", "micromax.payroll-settings");
}

// -------------------------------------------------------------- Accounting Dimension

export function useAccountingDimensions(enabled = true) {
  return useFrappeGetDocList<AccountingDimension>(
    "Accounting Dimension",
    {
      fields: ["name", "label", "fieldname", "document_type", "disabled"],
      limit: 0,
      orderBy: { field: "label", order: "asc" },
    },
    enabled ? "micromax.accounting-dimensions" : null,
  );
}

/** Create / update / delete for the Accounting Dimension doctype. */
export function useAccountingDimensionMutations() {
  const create = useFrappeCreateDoc<AccountingDimension>();
  const update = useFrappeUpdateDoc<AccountingDimension>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: (values: Partial<AccountingDimension>) => create.createDoc("Accounting Dimension", values as AccountingDimension),
    updateDoc: (name: string, values: Partial<AccountingDimension>) => update.updateDoc("Accounting Dimension", name, values),
    deleteDoc: (name: string) => del.deleteDoc("Accounting Dimension", name),
    loading: create.loading || update.loading || del.loading,
  };
}
