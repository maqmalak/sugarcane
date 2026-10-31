import { DocFormPage } from "@/components/doc/doc-form-page";
import { SALES_ORDER_CONFIG } from "./selling-configs";

/** One tabbed page for view, edit and new (at-a-glance insights, ledger, connections, activity, actions) — see selling-configs.tsx. */
export function SalesOrderFormPage() {
  return <DocFormPage config={SALES_ORDER_CONFIG} />;
}
