import { DocFormPage } from "@/components/doc/doc-form-page";
import { DocListPage } from "@/components/doc/doc-list-page";
import { SELLING_MASTER_CONFIGS } from "./selling-masters-configs";

const byBase = (base: string) => SELLING_MASTER_CONFIGS.find((c) => c.base === base)!;

/** List / form for the Selling DocConfigs added alongside the hand-built order pages (routes stay flat under /selling). */
export function SellingMasterList({ base }: { base: string }) {
  return <DocListPage config={byBase(base)} />;
}
export function SellingMasterForm({ base }: { base: string }) {
  return <DocFormPage config={byBase(base)} />;
}
