/**
 * Navigation trail (per browser tab): where the user came from, so every page can offer "Back to <that page>" — the exact
 * page with its filters / query — instead of a fixed parent.
 *
 * - A move to another page pushes the page left; changing only the query of the same page (filters, tabs, a day picker)
 *   updates the current step instead of adding one.
 * - Going to the previous step (the Back bar, the browser's back button) pops the trail.
 * - The Desktop (/home) and the login page start a new trail.
 */
import { useEffect, useState } from "react";
import { titleForSegment } from "@/app/navigation";

export interface Step { path: string; label: string }
const KEY = "nav.trail";
const MAX = 12;
const RESET = new Set(["/", "/home", "/login"]);

function read(): Step[] {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "[]") as Step[]; } catch { return []; }
}
function write(t: Step[]) {
  try { sessionStorage.setItem(KEY, JSON.stringify(t.slice(-MAX))); } catch { /* private mode: no trail */ }
}
const pathOnly = (p: string) => p.split("?")[0].replace(/\/+$/, "") || "/";
/** Old paths that only redirect: never a step of the trail. */
const REDIRECT = /^\/(mill\/|survey\/dashboard$|geo$|growers$|approvals$)/;

/** A readable name for a page: its record name or ?name=, else the last path segments as titled in the menus. */
export function labelFor(path: string): string {
  const [pathname, search = ""] = path.split("?");
  const segs = pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  const q = new URLSearchParams(search);
  const rec = q.get("name") || q.get("no") || q.get("loan") || q.get("g") || q.get("q");
  const d = segs.indexOf("d");
  if (d >= 0 && segs[d + 2]) return segs[d + 2];  // /app/d/<slug>/<record>
  if (d >= 0 && segs[d + 1]) return titleForSegment(segs[d + 1]);  // a list
  const base = segs.length ? titleForSegment(segs[segs.length - 1]) : "Desktop";
  const day = q.get("day");
  return [base, rec, day].filter(Boolean).join(" · ");
}

/** Record a location; returns the trail (oldest first, the current page last). */
export function track(path: string): Step[] {
  const t = read();
  if (REDIRECT.test(pathOnly(path))) return t;
  if (RESET.has(pathOnly(path))) {
    write([{ path, label: "Desktop" }]);
    return read();
  }
  const cur = t[t.length - 1];
  const prev = t[t.length - 2];
  if (cur && cur.path === path) return t;
  if (prev && prev.path === path) {  // went back one step
    write(t.slice(0, -1));
  } else if (cur && (pathOnly(cur.path) === pathOnly(path)
      || (pathOnly(cur.path).endsWith("/new") && pathOnly(path).startsWith(pathOnly(cur.path).slice(0, -3))))) {
    // same page with other filters, or a new record that has just been saved under its name
    write([...t.slice(0, -1), { path, label: labelFor(path) }]);
  } else {
    const at = t.findIndex((s) => s.path === path);  // jumped back further along the trail
    write(at >= 0 ? t.slice(0, at + 1) : [...t, { path, label: labelFor(path) }]);
  }
  return read();
}

/** The page the user came from (null on the first page of the trail). */
export function origin(): Step | null {
  const t = read();
  return t.length >= 2 ? t[t.length - 2] : null;
}

/** Where a Back / Cancel button should go: the origin when there is one, else the fallback (e.g. the list). */
export function backTarget(fallback: string): string {
  const o = origin();
  return o && !RESET.has(pathOnly(o.path)) ? o.path : fallback;
}

export function useTrail(path: string): Step[] {
  const [trail, setTrail] = useState<Step[]>(() => read());
  useEffect(() => { setTrail(track(path)); }, [path]);
  return trail;
}
