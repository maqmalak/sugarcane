import { useFrappeGetDocList } from "frappe-react-sdk";
import type { Customer, CustomerGroup } from "@/types/frappe";

const CUSTOMER_FIELDS = ["name", "customer_name", "territory", "customer_group", "disabled"] as const;

/** List customers (buyers). `includeDisabled` opts out of the default active-only filter — for management pages, not pickers. */
export function useCustomers(args?: { enabled?: boolean; limit?: number; search?: string; includeDisabled?: boolean }) {
  const { enabled = true, limit = 500, search, includeDisabled = false } = args ?? {};
  const filters: unknown[][] = includeDisabled ? [] : [["disabled", "=", 0]];
  const orFilters: unknown[][] | undefined = search?.trim()
    ? [
        ["name", "like", `%${search.trim()}%`],
        ["customer_name", "like", `%${search.trim()}%`],
      ]
    : undefined;

  return useFrappeGetDocList<Customer>(
    "Customer",
    {
      fields: CUSTOMER_FIELDS as unknown as (keyof Customer)[],
      limit,
      orderBy: { field: "customer_name", order: "asc" },
      filters: filters as any,
      ...(orFilters ? { orFilters: orFilters as any } : {}),
    },
    enabled ? `micromax.customers.${search?.trim() || "all"}.${limit}.${includeDisabled}` : null,
  );
}

export function useCustomerOptions(enabled = true) {
  const { data, error, isLoading } = useCustomers({ enabled, limit: 500 });
  return {
    options: (data ?? [])
      .filter((c) => c.name)
      .map((c) => ({
        value: c.name as string,
        label:
          c.customer_name && c.customer_name !== c.name
            ? `${c.customer_name} (${c.name})`
            : ((c.customer_name ?? c.name) as string),
      })),
    data,
    error,
    isLoading,
  };
}

/** Customer Group tree — nested-set, ordered by `lft` for a valid pre-order walk. */
export function useCustomerGroups(enabled = true) {
  return useFrappeGetDocList<CustomerGroup>(
    "Customer Group",
    {
      fields: ["name", "customer_group_name", "parent_customer_group", "is_group", "lft"],
      limit: 0,
      orderBy: { field: "lft", order: "asc" },
    },
    enabled ? "micromax.customer-groups" : null,
  );
}
