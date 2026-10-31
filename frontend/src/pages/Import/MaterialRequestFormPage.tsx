import { DocFormPage } from "@/components/doc/doc-form-page";
import { MATERIAL_REQUEST_CONFIG } from "@/pages/Purchase/buying-configs";

/** One tabbed page for view, edit and new (at-a-glance insights, ledger, connections, activity, actions) — see buying-configs.tsx. */
export function MaterialRequestFormPage() {
  return <DocFormPage config={MATERIAL_REQUEST_CONFIG} />;
}
