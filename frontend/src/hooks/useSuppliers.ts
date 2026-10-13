import { useFrappeGetDocList } from "frappe-react-sdk";
import type { Supplier, SupplierGroup } from "@/types/frappe";

const SUPPLIER_FIELDS = ["name", "supplier_name", "supplier_group", "country", "disabled"] as const;

/** List suppliers. `includeDisabled` opts out of the default active-only filter — for management pages, not pickers. */
export function useSuppliers(args?: { enabled?: boolean; limit?: number; includeDisabled?: boolean }) {
  const { enabled = true, limit = 400, includeDisabled = false } = args ?? {};
  return useFrappeGetDocList<Supplier>(
    "Supplier",
    {
      fields: SUPPLIER_FIELDS as unknown as (keyof Supplier)[],
      limit,
      orderBy: { field: "supplier_name", order: "asc" },
      filters: (includeDisabled ? [] : [["disabled", "=", 0]]) as unknown as [],
    },
    enabled ? `micromax.suppliers.${limit}.${includeDisabled}` : null,
  );
}

export function useSupplierOptions(enabled = true) {
  const { data, error, isLoading } = useSuppliers({ enabled });
  return {
    options: (data ?? []).map((s) => ({ value: s.name, label: s.supplier_name ?? s.name })),
    data,
    error,
    isLoading,
  };
}

/** Supplier Group tree — nested-set, ordered by `lft` for a valid pre-order walk. */
export function useSupplierGroups(enabled = true) {
  return useFrappeGetDocList<SupplierGroup>(
    "Supplier Group",
    {
      fields: ["name", "supplier_group_name", "parent_supplier_group", "is_group", "lft"],
      limit: 0,
      orderBy: { field: "lft", order: "asc" },
    },
    enabled ? "micromax.supplier-groups" : null,
  );
}