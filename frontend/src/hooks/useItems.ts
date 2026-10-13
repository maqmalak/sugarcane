import { useFrappeGetDocList, useSearch } from "frappe-react-sdk";
import type { Item, ItemGroup } from "@/types/frappe";

/** Reusable query args for the Item master. */
const ITEM_FIELDS = [
  "name",
  "item_code",
  "item_name",
  "item_group",
  "stock_uom",
  "standard_rate",
  "disabled",
  "image",
  "hs_code",
] as const;

/** List items (used by child tables, searches, masters). */
export function useItems(args?: {
  filters?: unknown[][];
  limit?: number;
  fields?: (keyof Item)[];
  enabled?: boolean;
}) {
  const { filters = [], limit = 200, fields = ITEM_FIELDS as unknown as (keyof Item)[], enabled = true } =
    args ?? {};
  return useFrappeGetDocList<Item>(
    "Item",
    {
      fields: fields as (keyof Item)[],
      filters: filters as [],
      limit,
      orderBy: { field: "item_name", order: "asc" },
    },
    enabled ? `micromax.items.${JSON.stringify({ filters, limit })}` : null,
  );
}

/** Frappe search API for global item search (Frappe v15+). */
export function useItemSearch(text: string, limit = 20) {
  return useSearch("Item", text, [], limit, 200);
}

/** Simple label for rendering a list of item options. */
export function itemLabel(item: Item): string {
  return item.item_name ?? item.name;
}

/** Item Group tree — nested-set, ordered by `lft` for a valid pre-order walk. */
export function useItemGroups(enabled = true) {
  return useFrappeGetDocList<ItemGroup>(
    "Item Group",
    {
      fields: ["name", "item_group_name", "parent_item_group", "is_group", "lft"],
      limit: 0,
      orderBy: { field: "lft", order: "asc" },
    },
    enabled ? "micromax.item-groups" : null,
  );
}