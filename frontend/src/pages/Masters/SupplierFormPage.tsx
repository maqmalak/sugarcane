import { DocFormPage } from "@/components/doc/doc-form-page";
import { SUPPLIER_CONFIG } from "./masters-configs";

/** Supplier — tabbed create/edit with at-a-glance insights, connections, activity and actions (see masters-configs.tsx). */
export function SupplierFormPage() {
  return <DocFormPage config={SUPPLIER_CONFIG} />;
}
