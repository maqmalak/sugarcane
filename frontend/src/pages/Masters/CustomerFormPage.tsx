import { DocFormPage } from "@/components/doc/doc-form-page";
import { CUSTOMER_CONFIG } from "./masters-configs";

/** Customer — tabbed create/edit with at-a-glance insights, connections, activity and actions (see masters-configs.tsx). */
export function CustomerFormPage() {
  return <DocFormPage config={CUSTOMER_CONFIG} />;
}
