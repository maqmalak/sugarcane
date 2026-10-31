import { DocFormPage } from "@/components/doc/doc-form-page";
import { PAYMENT_ENTRY_CONFIG } from "./payment-entry-config";

/**
 * Payment Entry — tabbed form (Payment · References · Taxes & Deductions · Transaction · Ledger · More ·
 * Connections · Activity): at-a-glance amounts and balances, "Get Outstanding Invoices", settlement status of
 * each referenced document, and the GL entries it posted (payment-entry-config.tsx).
 */
export function PaymentEntryFormPage() {
  return <DocFormPage config={PAYMENT_ENTRY_CONFIG} />;
}
