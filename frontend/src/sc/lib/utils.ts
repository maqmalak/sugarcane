import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { DOC_ROUTES, docUrl } from "@/app/doc-routes";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Link into the Frappe desk (proxied through this app, same session). */
export function deskUrl(path: string): string {
  return `/desk/${path.replace(/^\//, "")}`;
}

export function slug(doctype: string): string {
  return doctype.toLowerCase().replace(/ /g, "-");
}

const RE_FIRST: Record<string, string> = { Customer: "/re/customers/", "CRM Lead": "/crm/leads/", "CRM Deal": "/crm/deals/" };

/** A CRM follow-up opens the lead / deal / customer it is about (where its tasks, calls and chat live). */
export function followUpUrl(t: { reference_doctype?: string | null; reference_docname?: string | null }): string {
  return t.reference_doctype && t.reference_docname ? recordUrl(t.reference_doctype, t.reference_docname) : "/crm/tasks";
}

/** Where a record opens inside this app (real-estate pages first, then the ERPNext React pages); the desk only when the
 *  app has no page for that doctype. */
export function recordUrl(doctype: string, name: string): string {
  return RE_FIRST[doctype] ? `${RE_FIRST[doctype]}${encodeURIComponent(name)}` : docUrl(doctype, name).href;
}

/** A list inside this app, filtered by `?field=value`; the desk list when the app has no page for that doctype. */
export function listUrl(doctype: string, filters: Record<string, string | null | undefined> = {}): string {
  const base = DOC_ROUTES[doctype] ?? (doctype.startsWith("RE ") ? `/re/d/${slug(doctype)}/` : null);
  const q = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => Boolean(e[1]))).toString();
  return `${base ? base.replace(/\/$/, "") : deskUrl(slug(doctype))}${q ? `?${q}` : ""}`;
}

/** A new record inside this app, pre-filled with `?field=value`. */
export function newUrl(doctype: string, values: Record<string, string | null | undefined> = {}): string {
  return listUrl(doctype, values).replace(/(\?|$)/, "/new$1");
}
