/**
 * Links from the user manuals to the app's own pages. The manuals name screens in bold ("**Sugar Setup**",
 * "**Zones → New**", "**Report Centre → ELP**"); each name that matches an app, a sidebar entry or a DocType list
 * gets a small link icon after it that opens that page (/sugar/...).
 */
import { APPS } from "@/app/apps";
import { APP_NAVIGATION, NAVIGATION } from "@/app/navigation";

export interface RouteLink { label: string; to: string; apps: Set<string> }

/** Words that are buttons or generic headings, never a page of their own. */
const SKIP = new Set([
  "new", "save", "print", "submit", "search", "settings", "preview", "post", "pay", "reject", "reverse", "register", "log",
  "loads", "loading", "templates", "overview", "dashboard", "insights", "inbox", "general", "accounts", "the season", "setup",
  "reports", "pdf", "outside", "short", "stage", "shift", "this shift", "loans", "seasons", "vehicles",
]);

/** Names the manuals use that differ from the menu labels. */
const ALIASES: Record<string, string> = {
  "sugar setup": "/setup", setup: "/setup", desktop: "/", "help": "/help", "guides & videos": "/help/guides",
  "e-survey": "/survey", "eagleeye": "/survey", "area map": "/survey/geo", "report centre": "/reports",
  "approvals inbox": "/approvals/inbox", "season quotas": "/survey/quota",
};

const norm = (s: string) => s.toLowerCase().replace(/&amp;/g, "&").replace(/[:.]+$/, "").replace(/\s+/g, " ").trim();

let INDEX: Map<string, RouteLink> | null = null;
function index() {
  if (INDEX) return INDEX;
  const m = new Map<string, RouteLink>();
  const seg = (to: string) => to.split(/[/?]/).filter(Boolean)[0] ?? "";
  const add = (label: string, to: string, app?: string) => {
    for (const k of [norm(label), norm(label).replace(/s$/, "")]) {
      if (!k) continue;
      if (!m.has(k)) m.set(k, { label, to, apps: new Set([seg(to)]) });
      if (app) m.get(k)!.apps.add(app); // the sidebar areas this name is listed under
    }
  };
  for (const [k, to] of Object.entries(ALIASES)) m.set(k, { label: k, to, apps: new Set([seg(to)]) });
  for (const a of APPS) add(a.label, a.to);
  for (const [app, groups] of Object.entries(APP_NAVIGATION)) if (app !== "home") for (const g of groups) for (const i of g.items) add(i.label, i.to, app);
  // "Report Centre → ELP" style: the report group.
  for (const g of NAVIGATION) for (const i of g.items) {
    const grp = /\/reports\?g=([^&]+)/.exec(i.to)?.[1];
    if (grp) add(`report centre → ${decodeURIComponent(grp)}`, i.to);
  }
  INDEX = m;
  return m;
}

/** The page a bold phrase names, if any: the deepest part of an "A → B → C" path that is a page. */
export function resolve(text: string): RouteLink | null {
  const t = norm(text);
  if (!t || !/^[A-Z/]/.test(text.trim())) return null;
  const ix = index();
  if (ix.has(t) && !SKIP.has(t)) return ix.get(t)!;
  const parts = t.split(/\s*(?:→|›|>|&gt;)\s*/).map(norm).filter(Boolean);
  if (parts.length > 1) {
    const pair = `${parts[0]} → ${parts[1]}`;
    if (ix.has(pair)) return ix.get(pair)!;
  }
  const look = (p: string) => ix.get(p) ?? ix.get(p.replace(/s$/, ""));
  // "Area → … → Screen": the deepest part that is listed under the first part's area.
  const area = parts.length > 1 ? look(parts[0]) : undefined;
  if (area) {
    const ctx = new Set([...area.apps, area.to.split(/[/?]/).filter(Boolean)[0] ?? ""]);
    for (let i = parts.length - 1; i >= 1; i--) {
      const hit = SKIP.has(parts[i]) ? undefined : look(parts[i]);
      if (hit && [...hit.apps].some((a) => ctx.has(a))) return hit;
    }
    if (!SKIP.has(parts[0]) || ALIASES[parts[0]]) return area;
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (SKIP.has(p) && i > 0) continue;
    const hit = ix.get(p) ?? ix.get(p.replace(/s$/, ""));
    if (hit && (!SKIP.has(p) || ALIASES[p])) return hit;
  }
  return null;
}

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';

function anchor(doc: Document, link: RouteLink) {
  const a = doc.createElement("a");
  a.href = `/sugar${link.to}`;
  a.dataset.route = link.to;
  a.className = "route-link";
  a.title = `Open — ${window.location.origin}/sugar${link.to}`;
  a.innerHTML = ICON;
  return a;
}

/** Add a link icon after every bold screen name (and the first cell of "Sugar Setup →" tables). */
export function linkScreens(html: string): string {
  if (!html || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild!;
  root.querySelectorAll("strong").forEach((el) => {
    if (el.closest("a")) return;
    const hit = resolve(el.textContent ?? "");
    if (hit) el.after(anchor(doc, hit));
  });
  root.querySelectorAll("table").forEach((tbl) => {
    const head = tbl.querySelector("th")?.textContent ?? "";
    if (!/[→›]\s*$/.test(head.trim())) return;
    const prefix = head.replace(/[→›]\s*$/, "").trim();
    tbl.querySelectorAll("tbody tr").forEach((tr) => {
      const td = tr.querySelector("td");
      if (!td || td.querySelector("a.route-link")) return;
      const name = td.textContent ?? "";
      const hit = resolve(`${prefix} → ${name}`.replace(/^sugar setup → /i, "")) ?? resolve(name);
      if (hit && hit.to !== "/setup") td.append(anchor(doc, hit));
    });
  });
  return root.innerHTML;
}

/** The app pages each manual is about, shown as buttons at the top of the manual. */
export const MANUAL_PAGES: Record<string, string[]> = {
  "getting-started": ["/", "/help/guides"],
  setup: ["/setup", "/setup/area-map"],
  surveyor: ["/survey", "/survey/map"],
  "circle-officer": ["/survey", "/field-force", "/approvals/inbox"],
  indenting: ["/indenting", "/indenting/generate", "/indenting/lookup"],
  elp: ["/elp", "/elp/gate"],
  gate: ["/procurement/gate", "/procurement/yard"],
  weighbridge: ["/procurement/gross", "/procurement/tare", "/procurement/weighbridge"],
  cashier: ["/procurement/counter", "/procurement/cashier-summary"],
  depot: ["/depot", "/depot/dispatch"],
  laboratory: ["/lab", "/lab/entry", "/lab/dmr"],
  "cane-accountant": ["/accounts", "/accounts/scroll", "/accounts/loans"],
  "cost-accountant": ["/production", "/reports?g=Costing"],
  stores: ["/purchase"],
  sales: ["/sales"],
  finance: ["/finance"],
  hr: ["/hr", "/payroll"],
  management: ["/mis", "/reports", "/analytics/accounts"],
};

/** A readable name for a route (app or sidebar label). */
export function routeLabel(to: string): string {
  if (to === "/") return "Desktop";
  for (const a of APPS) if (a.to === to) return a.label;
  for (const g of NAVIGATION) for (const i of g.items) if (i.to === to) return i.label === "Insights" || i.label === "Overview" || i.label === "Dashboard" ? (g.title ?? i.label) : i.label;
  return to;
}
