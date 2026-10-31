import { DocFormPage } from "@/components/doc/doc-form-page";
import { ITEM_CONFIG } from "./masters-configs";

/** Item — tabbed create/edit with at-a-glance insights, connections, activity and actions (see masters-configs.tsx). */
export function ItemFormPage() {
  return <DocFormPage config={ITEM_CONFIG} />;
}
