import { DocFormPage } from "@/components/doc/doc-form-page";
import { DELIVERY_NOTE_CONFIG } from "./selling-configs";

/** One tabbed page for view, edit and new (at-a-glance insights, ledger, connections, activity, actions) — see selling-configs.tsx. */
export function DeliveryNoteFormPage() {
  return <DocFormPage config={DELIVERY_NOTE_CONFIG} />;
}
