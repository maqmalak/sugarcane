import { useFrappeGetDocList, useFrappeGetDoc, useFrappeCreateDoc, useFrappeUpdateDoc } from "frappe-react-sdk";
import { postCall } from "@/services/frappe";
import type { FrappeUser } from "@/types/frappe";

const USER_LIST_FIELDS = [
  "name",
  "full_name",
  "email",
  "enabled",
  "user_image",
  "user_type",
  "last_login",
  "creation",
] as const;

/** List System Users (Administration → Users). */
export function useUsers(args?: { search?: string; limit?: number; enabled?: boolean }) {
  const { search, limit = 200, enabled = true } = args ?? {};
  const filters: unknown[][] = [["user_type", "=", "System User"]];
  const orFilters: unknown[][] | undefined = search?.trim()
    ? [
        ["full_name", "like", `%${search.trim()}%`],
        ["name", "like", `%${search.trim()}%`],
      ]
    : undefined;

  return useFrappeGetDocList<FrappeUser>(
    "User",
    {
      fields: USER_LIST_FIELDS as unknown as (keyof FrappeUser)[],
      filters: filters as any,
      limit,
      orderBy: { field: "full_name", order: "asc" },
      ...(orFilters ? { orFilters: orFilters as any } : {}),
    },
    enabled ? `micromax.users.${search?.trim() || "all"}.${limit}` : null,
  );
}

/** Single full User doc (includes the `roles` child table). */
export function useUser(name?: string) {
  return useFrappeGetDoc<FrappeUser>("User", name ?? undefined, name ? `micromax.user.doc.${name}` : null);
}

/** Create / update mutations for the User doctype, plus a role-assignment helper. */
export function useUserMutations() {
  const create = useFrappeCreateDoc<FrappeUser>();
  const update = useFrappeUpdateDoc<FrappeUser>();

  return {
    createUser: (values: {
      email: string;
      first_name: string;
      last_name?: string;
      send_welcome_email?: boolean;
      roles?: string[];
    }) =>
      create.createDoc("User", {
        email: values.email,
        first_name: values.first_name,
        last_name: values.last_name,
        send_welcome_email: values.send_welcome_email ? 1 : 0,
        user_type: "System User",
        roles: (values.roles ?? []).map((role) => ({ role })),
      } as unknown as FrappeUser),
    updateUser: (name: string, values: Partial<FrappeUser>) => update.updateDoc("User", name, values),
    /**
     * Replace a user's role set entirely. Roles are a Frappe child table
     * (`Has Role`), so the safe way to change them via the generic client API
     * is to save the full parent doc with a new `roles` array — the same
     * pattern desk's User form uses under the hood.
     */
    setUserRoles: (userDoc: FrappeUser, roleNames: string[]) =>
      postCall<FrappeUser>("frappe.client.save", {
        doc: JSON.stringify({
          ...userDoc,
          doctype: "User",
          roles: roleNames.map((role) => ({ role })),
        }),
      }),
    loading: create.loading || update.loading,
    error: create.error || update.error,
  };
}
