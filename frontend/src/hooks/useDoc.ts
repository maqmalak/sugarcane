import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import { postCall, getCall } from "@/services/frappe";

/** Untyped document — the generic list/form pages work from a DocConfig, not from per-DocType TS types. */
export type Doc = Record<string, any>;

export interface DocListArgs {
  fields: string[];
  filters?: unknown[][];
  orFilters?: unknown[][];
  limit?: number;
  limitStart?: number;
  orderBy?: { field: string; order?: "asc" | "desc" };
  enabled?: boolean;
}

/** A page of documents (SWR-cached; previous page stays visible while the next one loads). */
export function useDocList<T extends Doc = Doc>(doctype: string, args: DocListArgs) {
  const { fields, filters = [], orFilters = [], limit = 20, limitStart = 0, orderBy, enabled = true } = args;
  return useFrappeGetDocList<T>(
    doctype,
    {
      fields: fields as any,
      filters: filters as any,
      orFilters: orFilters.length ? (orFilters as any) : undefined,
      limit_start: limitStart,
      limit,
      orderBy,
    },
    enabled ? `micromax.doc.${doctype}.${JSON.stringify({ fields, filters, orFilters, limit, limitStart, orderBy })}` : null,
    { keepPreviousData: true },
  );
}

/**
 * An aggregate column. Frappe v16 rejects SQL functions written as strings ("count(name) as count") and wants
 * the dict form ({ COUNT: "name", as: "count" }) — these helpers build it: `count("name", "n")`, `sum("qty", "total")`.
 */
export interface AggField {
  fn: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX";
  field: string;
  as: string;
}
export const count = (field: string, as: string): AggField => ({ fn: "COUNT", field, as });
export const sum = (field: string, as: string): AggField => ({ fn: "SUM", field, as });
export const avg = (field: string, as: string): AggField => ({ fn: "AVG", field, as });
const toApiField = (f: string | AggField) => (typeof f === "string" ? f : { [f.fn]: f.field, as: f.as });

/** Aggregate query — e.g. `fields: ["status", count("name", "n")], groupBy: "status"`. */
export function useAggregate<T extends Doc = Doc>(
  doctype: string,
  args: { fields: (string | AggField)[]; filters?: unknown[][]; groupBy?: string; orderBy?: { field: string; order?: "asc" | "desc" }; limit?: number; enabled?: boolean },
) {
  const { fields, filters = [], groupBy, orderBy, limit = 0, enabled = true } = args;
  const apiFields = fields.map(toApiField);
  return useFrappeGetDocList<T>(
    doctype,
    // The SDK drops a falsy `limit`, and Frappe then returns only its default 20 rows — so "no limit" (0)
    // must be sent as an explicit large page, or a group-by with more than 20 groups is silently cut off.
    { fields: apiFields as any, filters: filters as any, groupBy: groupBy as any, orderBy, limit: limit || 100000 },
    enabled ? `micromax.agg.${doctype}.${JSON.stringify({ apiFields, filters, groupBy, orderBy, limit })}` : null,
    { keepPreviousData: true },
  );
}

/** { "Open": 12, "Completed": 40 } for a status-like field. */
export function useGroupCounts(doctype: string, field: string | undefined, filters: unknown[][] = []) {
  const { data, ...rest } = useAggregate<Doc>(doctype, {
    fields: [field ?? "name", count("name", "count")],
    filters,
    groupBy: field,
    enabled: Boolean(field),
  });
  const counts: Record<string, number> = {};
  (data ?? []).forEach((r) => {
    counts[String(r[field ?? "name"] ?? "")] = Number(r.count ?? 0);
  });
  return { counts, ...rest };
}

/** One full document (with child tables). */
export function useDocument<T extends Doc = Doc>(doctype: string, name?: string) {
  return useFrappeGetDoc<T>(doctype, name ?? undefined, name ? `micromax.doc.one.${doctype}.${name}` : null);
}

/** create / update / delete + submit / cancel for any DocType. */
export function useDocMutations(doctype: string) {
  const create = useFrappeCreateDoc<Doc>();
  const update = useFrappeUpdateDoc<Doc>();
  const del = useFrappeDeleteDoc();
  return {
    createDoc: (values: Doc) => create.createDoc(doctype, values),
    updateDoc: (name: string, values: Doc) => update.updateDoc(doctype, name, values),
    deleteDoc: (name: string) => del.deleteDoc(doctype, name),
    /** Submit a saved draft — same pattern the Material Request / Journal Entry pages use. */
    submitDoc: async (name: string) => {
      const full = await postCall<Doc>("frappe.client.get", { doctype, name });
      return postCall<Doc>("frappe.client.submit", { doc: full });
    },
    cancelDoc: (name: string) => postCall("frappe.client.cancel", { doctype, name }),
    loading: create.loading || update.loading || del.loading,
  };
}

/** `frappe.client.get_value` — one or more fields of a linked document (for auto-fill on Link change). */
export async function getLinkedValues(doctype: string, name: string, fields: string[]): Promise<Doc> {
  if (!name) return {};
  try {
    const res = await getCall<Doc>("frappe.client.get_value", {
      doctype,
      filters: JSON.stringify({ name }),
      fieldname: JSON.stringify(fields),
    });
    return res ?? {};
  } catch {
    return {};
  }
}
