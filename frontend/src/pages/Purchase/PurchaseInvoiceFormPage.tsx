import { DocFormPage } from "@/components/doc/doc-form-page";
import { PURCHASE_INVOICE_CONFIG } from "@/pages/Purchase/buying-configs";

/** One tabbed page for view, edit and new (at-a-glance insights, ledger, connections, activity, actions) — see buying-configs.tsx. */
export function PurchaseInvoiceFormPage() {
  return <DocFormPage config={PURCHASE_INVOICE_CONFIG} />;
}
