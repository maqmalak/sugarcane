import { DocFormPage } from "@/components/doc/doc-form-page";
import { SUPPLIER_GROUP_CONFIG } from "./masters-configs";

/** Supplier Group — tabbed create/edit with at-a-glance insights, connections, activity and actions (see masters-configs.tsx). */
export function SupplierGroupFormPage() {
  return <DocFormPage config={SUPPLIER_GROUP_CONFIG} />;
}
