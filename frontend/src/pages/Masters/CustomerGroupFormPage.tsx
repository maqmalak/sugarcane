import { DocFormPage } from "@/components/doc/doc-form-page";
import { CUSTOMER_GROUP_CONFIG } from "./masters-configs";

/** Customer Group — tabbed create/edit with at-a-glance insights, connections, activity and actions (see masters-configs.tsx). */
export function CustomerGroupFormPage() {
  return <DocFormPage config={CUSTOMER_GROUP_CONFIG} />;
}
