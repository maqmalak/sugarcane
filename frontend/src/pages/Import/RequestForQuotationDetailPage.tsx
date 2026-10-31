import { DocFormPage } from "@/components/doc/doc-form-page";
import { RFQ_CONFIG } from "@/pages/Purchase/buying-configs";

/** One tabbed page for view, edit and new (at-a-glance insights, ledger, connections, activity, actions) — see buying-configs.tsx. */
export function RequestForQuotationDetailPage() {
  return <DocFormPage config={RFQ_CONFIG} />;
}
