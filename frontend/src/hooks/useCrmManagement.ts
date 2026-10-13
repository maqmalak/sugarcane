import {
  useFrappeGetDocList,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";

export interface CrmManagementListOptions<T extends Record<string, any>> {
  doctype: string;
  fields: (keyof T)[];
  filters?: unknown[][];
  limit?: number;
  enabled?: boolean;
  orderBy?: { field: string; order: "asc" | "desc" };
}

/**
 * Generic CRM list + CRUD hook backing the shared management pages (Contracts,
 * Organizations, Notes, Tasks, Call Logs, Follow-ups, Calendar). Thin wrapper
 * over the frappe-react-sdk so each page gets rows plus create/update/delete
 * without re-declaring doctype plumbing.
 */
export function useCrmManagement<T extends Record<string, any>>(
  args: CrmManagementListOptions<T>,
): {
  rows: T[] | undefined;
  isLoading: boolean;
  error: unknown;
  mutate: (() => Promise<void>) | undefined;
  createDoc: (values: Partial<T>) => Promise<T>;
  updateDoc: (name: string, values: Partial<T>) => Promise<T>;
  deleteDoc: (name: string) => Promise<unknown>;
  loading: boolean;
} {
  const { doctype, fields, filters = [], limit = 500, enabled = true, orderBy } = args;
  const cacheKey = enabled ? `micromax.crm.mgmt.${doctype}.${JSON.stringify({ filters, limit, orderBy })}` : null;

  const list = useFrappeGetDocList<T>(
    doctype,
    {
      fields: fields as unknown as (keyof T)[],
      filters: filters as any,
      limit,
      orderBy,
    },
    cacheKey,
  );

  const create = useFrappeCreateDoc<T>();
  const update = useFrappeUpdateDoc<T>();
  const del = useFrappeDeleteDoc();

  return {
    rows: list.data as T[] | undefined,
    isLoading: list.isLoading,
    error: list.error,
    mutate: list.mutate as (() => Promise<void>) | undefined,
    createDoc: async (values) => (await create.createDoc(doctype, values as T)) as T,
    updateDoc: async (name, values) => (await update.updateDoc(doctype, name, values as T)) as T,
    deleteDoc: (name) => del.deleteDoc(doctype, name),
    loading: create.loading || update.loading || del.loading,
  };
}