import { DocFormPage } from "@/components/doc/doc-form-page";
import { ITEM_GROUP_CONFIG } from "./masters-configs";

/** Item Group — tabbed create/edit with at-a-glance insights, connections, activity and actions (see masters-configs.tsx). */
export function ItemGroupFormPage() {
  return <DocFormPage config={ITEM_GROUP_CONFIG} />;
}
