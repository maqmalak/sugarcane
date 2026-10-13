import { useCallback, useMemo } from "react";
import { useFrappeGetDocList, useFrappeGetCall, useSWRConfig } from "frappe-react-sdk";
import type { FrappeRole } from "@/types/frappe";

const HAS_ROLE_ROWS_KEY = "micromax.hasrole.all";

/** List all Roles (Administration → Roles). */
export function useRoles(args?: { enabled?: boolean }) {
  const { enabled = true } = args ?? {};
  return useFrappeGetDocList<FrappeRole>(
    "Role",
    {
      fields: ["name", "disabled", "desk_access"],
      limit: 0,
      orderBy: { field: "name", order: "asc" },
    },
    enabled ? "micromax.roles.all" : null,
  );
}

export interface HasRoleRow {
  parent: string;
  role: string;
}

/**
 * Every `Has Role` row across every user, fetched once. `Has Role` is a child
 * table of User, so (as in useAuth.tsx's own-roles query) it must go through
 * `frappe.client.get_list` directly with an explicit `parent` doctype — the
 * generic `useFrappeGetDocList` hook has no such option and Frappe needs it
 * to resolve permissions for child-table rows.
 */
export function useHasRoleRows(args?: { enabled?: boolean }) {
  const { enabled = true } = args ?? {};
  const { data, isLoading, error, mutate } = useFrappeGetCall<{ message: HasRoleRow[] } | HasRoleRow[]>(
    "frappe.client.get_list",
    {
      doctype: "Has Role",
      filters: JSON.stringify([]),
      fields: JSON.stringify(["parent", "role"]),
      parent: "User",
      limit_page_length: 0,
    },
    enabled ? HAS_ROLE_ROWS_KEY : null,
  );
  const rows = (data as any)?.message ?? data ?? [];
  return { data: (Array.isArray(rows) ? rows : []) as HasRoleRow[], isLoading, error, mutate };
}

/**
 * Invalidate the shared Has Role cache after any role assignment change —
 * needed regardless of which page performed the change (User detail's role
 * checklist, Role detail's assign/remove), since role counts and assigned-
 * user lists elsewhere in Administration read from this same cache entry.
 *
 * Must go through frappe-react-sdk's own `useSWRConfig` (its bundled SWR
 * instance/cache), not the standalone `swr` package — the SDK vendors its
 * own copy of SWR internally, so `import { mutate } from "swr"` operates on
 * a different, unrelated cache and would silently no-op here.
 */
export function useInvalidateRoleAssignments() {
  const { mutate } = useSWRConfig();
  return useCallback(() => mutate(HAS_ROLE_ROWS_KEY), [mutate]);
}

/** Map of role name → number of users holding that role. */
export function useRoleUserCounts() {
  const { data, isLoading } = useHasRoleRows();
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    (data ?? []).forEach((row) => {
      map.set(row.role, (map.get(row.role) ?? 0) + 1);
    });
    return map;
  }, [data]);
  return { counts, isLoading };
}

/** Usernames (User.name) assigned to a given role. */
export function useUsersForRole(roleName?: string) {
  const { data, isLoading, mutate } = useHasRoleRows({ enabled: Boolean(roleName) });
  const userNames = useMemo(
    () => (data ?? []).filter((row) => row.role === roleName).map((row) => row.parent),
    [data, roleName],
  );
  return { userNames, isLoading, mutate };
}
