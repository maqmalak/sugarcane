/**
 * DocConfig built from the DocType definition (sugarcane.api.v1.spa.form_meta), so every DocType gets the same
 * React list + form as the hand-written MicroMax modules: tabs, sections, child tables, status tabs, filters,
 * submit / cancel, Connections, Activity, attachments. Per-DocType extras (summary cards, actions) come from
 * ENHANCERS below.
 */
import { money, todayISO } from "@/sc/lib/format";
import { get } from "@/sc/lib/api";
import type { LucideIcon } from "lucide-react";
import { FileText } from "lucide-react";
import type { ChildTableSpec, DocConfig, DocField, DocValues } from "@/components/doc/doc-config";
import { dateCol, moneyCol, nameCol, numCol, percentCol, statusCol, textCol } from "@/components/doc/doc-helpers";
import type { FormFieldMeta } from "@/components/forms/field-primitives";
import type { ColumnDef } from "@/components/tables/data-table";

export interface MetaField {
  fieldname: string;
  fieldtype: string;
  label?: string;
  options?: string;
  reqd?: number;
  read_only?: number;
  hidden?: number;
  depends_on?: string;
  mandatory_depends_on?: string;
  fetch_from?: string;
  fetch_if_empty?: number;
  default?: string;
  precision?: string;
  description?: string;
  in_list_view?: number;
  in_standard_filter?: number;
}

export interface FormMeta {
  doctype: string;
  issingle: number;
  is_submittable: number;
  title_field?: string | null;
  search_fields: string[];
  sort_field?: string;
  sort_order?: string;
  fields: MetaField[];
  children: Record<string, { doctype: string; fields: MetaField[] }>;
  module: string;
  can_create: boolean;
}

export interface Enhancer {
  icon?: LucideIcon;
  subtitle?: string;
  extend?: (config: DocConfig) => DocConfig;
}

type FieldType = FormFieldMeta["fieldtype"];

const TYPE_MAP: Record<string, FieldType> = {
  Data: "Data", Select: "Select", Link: "Link", "Dynamic Link": "Dynamic Link", Date: "Date", Datetime: "Datetime", Time: "Time",
  Percent: "Percent", Currency: "Currency", Float: "Float", Int: "Int", Check: "Check", Text: "Text", "Small Text": "Text",
  "Long Text": "Text", Code: "Text", JSON: "Text", "Markdown Editor": "Text", "Text Editor": "Text Editor", Attach: "Attach",
  "Attach Image": "Attach Image", Table: "Table", "Section Break": "Section Break", "Column Break": "Column Break", "Tab Break": "Tab Break",
  Phone: "Data", "Read Only": "Data", Color: "Data", Autocomplete: "Data", Duration: "Int", Rating: "Float", Password: "Data", Icon: "Data",
};

/** `depends_on` -> predicate: "eval:doc.x=='y'" or a plain fieldname. Bad expressions show the field. */
function predicate(expr: string | undefined): ((v: DocValues) => boolean) | undefined {
  if (!expr) return undefined;
  if (expr.startsWith("eval:")) {
    try {
      const fn = new Function("doc", `return (${expr.slice(5)});`) as (doc: DocValues) => unknown;
      return (v) => {
        try {
          return Boolean(fn(v));
        } catch {
          return true;
        }
      };
    } catch {
      return undefined;
    }
  }
  return (v) => Boolean(v[expr]);
}

function toField(f: MetaField): DocField | null {
  const fieldtype = TYPE_MAP[f.fieldtype];
  if (!fieldtype || f.hidden) return null;
  const field: DocField = {
    fieldname: f.fieldname,
    fieldtype,
    label: f.label,
    options: f.fieldtype === "Phone" ? undefined : f.options,
    reqd: Boolean(f.reqd),
    read_only: Boolean(f.read_only) || f.fieldtype === "Read Only",
    default: f.default,
    precision: f.precision,
    description: f.description,
    fetch_from: f.fetch_from,
    fetch_if_empty: Boolean(f.fetch_if_empty),
    in_list_view: Boolean(f.in_list_view),
  };
  const showIf = predicate(f.depends_on);
  return showIf ? { ...field, showIf } : field;
}

function column(f: MetaField): ColumnDef<Record<string, unknown>> {
  const label = f.label ?? f.fieldname;
  if (f.fieldname === "status" || f.fieldname.endsWith("_status")) return statusCol(f.fieldname, label, "—");
  switch (f.fieldtype) {
    case "Currency":
      return moneyCol(f.fieldname, label);
    case "Date":
    case "Datetime":
      return dateCol(f.fieldname, label);
    case "Percent":
      return percentCol(f.fieldname, label);
    case "Int":
    case "Float":
      return numCol(f.fieldname, label, f.fieldtype === "Int" ? 0 : 2);
    default:
      return textCol(f.fieldname, label);
  }
}

const DATA_TYPES = new Set(["Data", "Select", "Link", "Dynamic Link", "Date", "Datetime", "Currency", "Float", "Int", "Percent", "Check"]);

export function slugOf(doctype: string): string {
  return doctype.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function buildConfig(meta: FormMeta, base: string, enhancer: Enhancer = {}): DocConfig {
  const singular = meta.doctype.replace(/^RE /, "");
  const plural = singular.endsWith("y") && !singular.endsWith("ey") ? `${singular.slice(0, -1)}ies` : `${singular}s`;
  const fields: DocField[] = [];
  const children: ChildTableSpec[] = [];
  let tabLabel = "Details";
  let started = false;
  for (const f of meta.fields) {
    if (f.fieldtype === "Tab Break") {
      tabLabel = f.label || tabLabel;
      if (started) fields.push({ fieldname: f.fieldname, fieldtype: "Tab Break", label: tabLabel });
      continue;
    }
    if (f.fieldtype === "Table") {
      const child = meta.children[f.fieldname];
      if (!child || f.hidden) continue;
      const cols = child.fields.map(toField).filter((c): c is DocField => Boolean(c) && !["Section Break", "Column Break", "Tab Break"].includes(c!.fieldtype));
      const listed = cols.filter((c) => c.in_list_view);
      // every money column gets a total under the grid (bill charges, installments, allocations…)
      const moneyCols = cols.filter((c) => c.fieldtype === "Currency");
      children.push({
        key: f.fieldname, label: f.label ?? f.fieldname, doctype: child.doctype, columns: (listed.length ? listed : cols).slice(0, 6),
        dialogColumns: cols, readOnly: Boolean(f.read_only), tab: tabLabel, wide: cols.length > 6,
        totals: moneyCols.length
          ? (rows) => [
            { label: "Rows", value: rows.length, align: "left" as const },
            ...moneyCols.map((c) => ({ label: `Total ${c.label ?? c.fieldname}`, value: money(rows.reduce((a, r) => a + (Number(r[c.fieldname]) || 0), 0)), align: "right" as const })),
          ]
          : undefined,
      });
      continue;
    }
    const field = toField(f);
    if (!field) continue;
    if (!started) fields.push({ fieldname: "__tab_first", fieldtype: "Tab Break", label: tabLabel });
    started = true;
    fields.push(field);
  }

  const visible = meta.fields.filter((f) => !f.hidden && DATA_TYPES.has(f.fieldtype));
  const listed = visible.filter((f) => f.in_list_view && f.fieldname !== meta.title_field).slice(0, 6);
  const title = meta.title_field && meta.title_field !== "name" ? meta.title_field : undefined;
  const statusField = meta.fields.find((f) => f.fieldname === "status" && f.fieldtype === "Select");
  const dateField = meta.fields.find((f) => f.fieldtype === "Date" && (f.in_list_view || f.reqd));

  const config: DocConfig = {
    doctype: meta.doctype,
    base,
    singular,
    plural,
    subtitle: enhancer.subtitle ?? `${plural} — ${meta.module}`,
    icon: enhancer.icon ?? FileText,
    submittable: Boolean(meta.is_submittable),
    single: Boolean(meta.issingle),
    companyScoped: false,
    listFields: Array.from(new Set(["name", ...(title ? [title] : []), ...listed.map((f) => f.fieldname), ...(statusField ? ["status"] : []), "modified", ...(meta.is_submittable ? ["docstatus"] : [])])),
    columns: [nameCol(singular, title ? (r: Record<string, unknown>) => String(r[title] ?? "") : undefined), ...listed.map(column)],
    searchFields: Array.from(new Set(["name", ...(title ? [title] : []), ...meta.search_fields])).filter((f) => f === "name" || meta.fields.some((m) => m.fieldname === f)),
    sort: { key: meta.sort_field && meta.sort_field !== "creation" ? meta.sort_field : "modified", dir: meta.sort_order === "ASC" ? "asc" : "desc" },
    statusField: statusField ? "status" : undefined,
    statuses: statusField?.options?.split("\n").filter(Boolean),
    dateField: dateField?.fieldname,
    dateLabel: dateField?.label,
    filters: meta.fields
      .filter((f) => f.in_standard_filter && f.fieldname !== "status" && (f.fieldtype === "Select" || f.fieldtype === "Link"))
      .slice(0, 3)
      .map((f) => (f.fieldtype === "Select" ? { field: f.fieldname, label: f.label ?? f.fieldname, options: f.options?.split("\n").filter(Boolean) } : { field: f.fieldname, label: f.label ?? f.fieldname, optionsFrom: f.options })),
    fields,
    children,
    titleOf: (v) => (v.name ? `${v.name}${title && v[title] && v[title] !== v.name ? ` · ${String(v[title])}` : ""}` : `New ${singular}`),
    // field defaults, then any ?field=value in the URL (e.g. a "Record payment" button pre-filling the booking)
    defaults: ({ params }) => ({
      ...Object.fromEntries(meta.fields.filter((f) => f.default && !f.default.startsWith("eval") && f.fieldtype !== "Check")
        .map((f) => [f.fieldname, f.default === "Today" ? todayISO() : f.default])),
      ...Object.fromEntries([...params.entries()].filter(([k]) => meta.fields.some((f) => f.fieldname === k))),
    }),
  };
  // fetch_from: picking a Link fills the fields copied from it (a booking's block, plot size, project …) straight away,
  // as the desk does — and follows chains (a cancellation's booking → customer → customer name)
  const effects = fetchEffects(meta.fields);
  if (Object.keys(effects).length) config.linkEffects = { ...effects, ...(config.linkEffects ?? {}) };
  // the same inside child tables (e.g. a merge's plot rows get size, area, status and price)
  config.children = config.children?.map((spec) => {
    const childMeta = meta.children[spec.key];
    const eff = childMeta ? fetchEffects(childMeta.fields) : {};
    if (!Object.keys(eff).length) return spec;
    const rowEffects = Object.fromEntries(Object.entries(eff).map(([k, fn]) => [k, async (value: string) => (await fn(value)) as DocValues]));
    return { ...spec, linkEffects: { ...rowEffects, ...(spec.linkEffects ?? {}) } };
  });
  return enhancer.extend ? enhancer.extend(config) : config;
}


type FetchMeta = { fieldname: string; fieldtype: string; options?: string; fetch_from?: string };
/** fetch_from → one async effect per Link: read the copied values from the linked record (one request), then follow
 * any copied value that is itself a Link with its own fetches (depth-limited). Clearing the Link clears its copies. */
function fetchEffects(fields: FetchMeta[]): Record<string, (value: unknown) => Promise<DocValues>> {
  const byLink = new Map<string, { doctype: string; list: { target: string; source: string }[] }>();
  for (const f of fields) {
    if (!f.fetch_from?.includes(".")) continue;
    const [link, source] = f.fetch_from.split(".");
    const lf = fields.find((m) => m.fieldname === link && m.fieldtype === "Link" && m.options);
    if (!lf?.options) continue;
    const e = byLink.get(link) ?? { doctype: lf.options, list: [] };
    e.list.push({ target: f.fieldname, source });
    byLink.set(link, e);
  }
  const run = async (link: string, value: unknown, depth: number): Promise<DocValues> => {
    const e = byLink.get(link);
    if (!e) return {};
    if (!value) return Object.fromEntries(e.list.map((x) => [x.target, ""]));
    const r = await get<Record<string, unknown> | null>("frappe.client.get_value", { doctype: e.doctype, filters: String(value), fieldname: JSON.stringify(e.list.map((x) => x.source)) });
    let patch: DocValues = Object.fromEntries(e.list.map((x) => [x.target, r?.[x.source] ?? ""]));
    if (depth < 3) {
      for (const x of e.list) {
        if (byLink.has(x.target)) patch = { ...patch, ...(await run(x.target, patch[x.target], depth + 1)) };
      }
    }
    return patch;
  };
  return Object.fromEntries([...byLink.keys()].map((link) => [link, (value: unknown) => run(link, value, 0)]));
}