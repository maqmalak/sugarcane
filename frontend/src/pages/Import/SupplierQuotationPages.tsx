import { DocFormPage } from "@/components/doc/doc-form-page";
import { DocListPage } from "@/components/doc/doc-list-page";
import { SUPPLIER_QUOTATION_CONFIG } from "@/pages/Purchase/buying-configs";

/** Supplier quotations: list and one tabbed page for view, edit and new — see buying-configs.tsx. */
export function SupplierQuotationsPage() {
  return <DocListPage config={SUPPLIER_QUOTATION_CONFIG} />;
}
export function SupplierQuotationPage() {
  return <DocFormPage config={SUPPLIER_QUOTATION_CONFIG} />;
}
