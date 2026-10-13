import { SC_DOCS, docBase } from "@/sc/registry";
/**
 * Where each DocType's record opens in the React app: `${base}${name}`.
 * Anything not listed opens in the ERPNext desk (`/desk/<doctype-slug>/<name>` — Frappe v16; proxied in dev and nginx).
 */
export const DOC_ROUTES: Record<string, string> = {
  // sugar mill DocTypes — generated forms (src/sc/registry.tsx)
  ...Object.fromEntries(SC_DOCS.map((d) => [d.doctype, `${docBase(d.doctype)}/`])),
};

export const slug = (doctype: string) => doctype.toLowerCase().replace(/ /g, "-");

/** React route for a record, or the desk URL (external) when the app has no screen for it. */
/** Doctypes the app shows as a list or feed rather than one page per record. */
const LIST_ONLY: Record<string, string> = {};

export function docUrl(doctype: string, name: string): { href: string; external: boolean } {
  if (LIST_ONLY[doctype]) return { href: LIST_ONLY[doctype], external: false };
  const base = DOC_ROUTES[doctype];
  return base ? { href: `${base}${encodeURIComponent(name)}`, external: false } : { href: deskUrl(doctype, name), external: true };
}

export const deskUrl = (doctype: string, name?: string) => `/desk/${slug(doctype)}${name ? `/${encodeURIComponent(name)}` : ""}`;
export const printUrl = (doctype: string, name: string, format?: string) =>
  `/printview?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(name)}&trigger_print=1${format ? `&format=${encodeURIComponent(format)}` : ""}`;
