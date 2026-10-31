import { DocFormPage } from "@/components/doc/doc-form-page";
import { DocListPage } from "@/components/doc/doc-list-page";
import { STOCK_CONFIGS } from "./stock-configs";

const byBase = (base: string) => STOCK_CONFIGS.find((c) => c.base === base)!;

/** List / form for a stock master DocConfig, looked up by its base path (routes stay flat under /inventory). */
export function StockMasterList({ base }: { base: string }) {
  return <DocListPage config={byBase(base)} />;
}
export function StockMasterForm({ base }: { base: string }) {
  return <DocFormPage config={byBase(base)} />;
}
export const STOCK_MASTER_BASES = STOCK_CONFIGS.map((c) => c.base);
