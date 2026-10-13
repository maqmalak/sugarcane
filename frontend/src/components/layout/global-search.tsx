import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeGetCall, useFrappeGetDocList } from "frappe-react-sdk";
import { Search, CornerDownLeft, ExternalLink } from "lucide-react";
import { APPS } from "@/app/apps";
import { APP_NAVIGATION } from "@/app/navigation";
import { DOC_ROUTES, docUrl, slug } from "@/app/doc-routes";
import { useInstalledApps } from "@/hooks/useInstalledApps";
import { ALL_REPORTS } from "@/pages/Reports/report-catalog";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";

/**
 * Global search (Ctrl/Cmd + K).
 *
 * Queries each doctype below directly (name + title field, `or_filters`)
 * instead of Frappe's generic `global_search.search` RPC. That RPC ranks
 * hits across *every* indexed doctype by raw frequency, so a term that
 * happens to appear inside thousands of unrelated documents (e.g. an Item
 * name quoted inside every Purchase Receipt that ordered it) can crowd the
 * one Item hit that actually matters out of the top N results entirely —
 * confirmed live: searching "BOTTLE" returned 20 Purchase Receipt hits and
 * zero Items, even though "BOTTLE BURSH" is a real Item. Querying each
 * doctype's own table directly guarantees a match there surfaces.
 * Results are permission-filtered by ERPNext on the server either way.
 */

interface SearchHit {
  kind: Kind;
  /** Badge text (doctype, module, app…). */
  doctype: string;
  name: string;
  label: string;
  route: string;
  /** Opens with a full page load (the Frappe desk). */
  external?: boolean;
}

/** DocType -> field to search/display alongside `name`. Hits open the document (docUrl: React page, else desk). */
const SEARCH_DOCTYPES: Record<string, { titleField: string }> = {
  "LC Proforma": { titleField: "proforma_no" },
  "Export Shipment": { titleField: "shipment_no" },
  "Import Shipment": { titleField: "shipment_no" },
  "Import Cost Sheet": { titleField: "name" },
  "Sales Order": { titleField: "customer_name" },
  "Purchase Order": { titleField: "supplier_name" },
  Item: { titleField: "item_name" },
  Customer: { titleField: "customer_name" },
  Supplier: { titleField: "supplier_name" },
  "Work Order": { titleField: "production_item" },
  "Sales Invoice": { titleField: "customer_name" },
  "CRM Lead": { titleField: "lead_name" },
  "CRM Deal": { titleField: "organization" },
};

type Kind = "page" | "doctype" | "report" | "record";
const KIND_LABEL: Record<Kind, string> = { page: "Pages", doctype: "DocTypes", report: "Reports", record: "Records" };
const deskReport = (r: { name: string; type?: string; ref_doctype?: string; module?: string }) =>
  r.module === "Real Estate" ? `/re/reports?r=${encodeURIComponent(r.name)}`
  : r.type === "Report Builder" && r.ref_doctype
    ? `/desk/${slug(r.ref_doctype)}/view/report/${encodeURIComponent(r.name)}`
    : `/desk/query-report/${encodeURIComponent(r.name)}`;
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Registers the Ctrl/Cmd+K shortcut and returns the open state. */
export function useGlobalSearchShortcut() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

/** One doctype's live-search results — `doctype` is a fixed literal per call site, never changes across renders. */
function useDoctypeSearch(doctype: string, titleField: string, query: string, enabled: boolean) {
  const q = query.trim();
  const active = enabled && q.length > 0;
  const fields = titleField === "name" ? ["name"] : ["name", titleField];
  const orFilters = [
    ["name", "like", `%${q}%`],
    ...(titleField !== "name" ? [[titleField, "like", `%${q}%`]] : []),
  ];

  const { data, isLoading } = useFrappeGetDocList<Record<string, unknown>>(
    doctype,
    { fields: fields as never, orFilters: orFilters as never, limit: 5 },
    active ? `micromax.search.${doctype}.${q}` : null,
  );

  return { doctype, titleField, data: data ?? [], isLoading: active && isLoading };
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");
  const debounced = useDebounced(query.trim(), 250);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const enabled = open && debounced.length >= 2;

  // Fixed, unconditional set of hook calls — SEARCH_DOCTYPES is a static
  // compile-time map, never varies in size/order across renders, so this
  // doesn't violate the rules of hooks despite being "one call per doctype".
  const groups = [
    useDoctypeSearch("LC Proforma", SEARCH_DOCTYPES["LC Proforma"].titleField, debounced, enabled),
    useDoctypeSearch("Export Shipment", SEARCH_DOCTYPES["Export Shipment"].titleField, debounced, enabled),
    useDoctypeSearch("Import Shipment", SEARCH_DOCTYPES["Import Shipment"].titleField, debounced, enabled),
    useDoctypeSearch("Import Cost Sheet", SEARCH_DOCTYPES["Import Cost Sheet"].titleField, debounced, enabled),
    useDoctypeSearch("Sales Order", SEARCH_DOCTYPES["Sales Order"].titleField, debounced, enabled),
    useDoctypeSearch("Purchase Order", SEARCH_DOCTYPES["Purchase Order"].titleField, debounced, enabled),
    useDoctypeSearch("Item", SEARCH_DOCTYPES["Item"].titleField, debounced, enabled),
    useDoctypeSearch("Customer", SEARCH_DOCTYPES["Customer"].titleField, debounced, enabled),
    useDoctypeSearch("Supplier", SEARCH_DOCTYPES["Supplier"].titleField, debounced, enabled),
    useDoctypeSearch("Work Order", SEARCH_DOCTYPES["Work Order"].titleField, debounced, enabled),
    useDoctypeSearch("Sales Invoice", SEARCH_DOCTYPES["Sales Invoice"].titleField, debounced, enabled),
    useDoctypeSearch("CRM Lead", SEARCH_DOCTYPES["CRM Lead"].titleField, debounced, enabled),
    useDoctypeSearch("CRM Deal", SEARCH_DOCTYPES["CRM Deal"].titleField, debounced, enabled),
  ];

  const { isPathAvailable } = useInstalledApps();
  const { data: meta, isLoading: metaLoading } = useFrappeGetCall<{ message: { doctypes: { name: string; module: string; single: number }[]; reports: { name: string; type: string; ref_doctype?: string; module?: string }[] } }>(
    "mm_core.api.awesome_search", { txt: debounced }, enabled ? `mm_core.awesome.${debounced}` : null,
  );
  const isLoading = metaLoading || groups.some((g) => g.isLoading);

  // Every page in the app: sidebar links of each module + the app tiles (deduplicated, installed apps only).
  const pages = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { label: string; to: string; where: string }[] = [];
    const add = (label: string, to: string, where: string) => {
      if (!to || seen.has(to) || !isPathAvailable(to)) return;
      seen.add(to);
      out.push({ label, to, where });
    };
    APPS.forEach((a) => add(a.label, a.to, "App"));
    Object.entries(APP_NAVIGATION).forEach(([seg, groups]) => {
      const app = APPS.find((a) => a.to.replace(/^\//, "").split("/")[0] === seg)?.label ?? seg;
      groups.forEach((g) => g.items.forEach((i) => add(i.label, i.to, g.title && g.title !== app ? `${app} · ${g.title}` : app)));
    });
    return out;
  }, [isPathAvailable]);

  const results: SearchHit[] = React.useMemo(() => {
    if (!enabled) return [];
    const q = norm(debounced);
    const words = q.split(" ").filter(Boolean);
    const matches = (text: string) => { const t = norm(text); return words.every((w) => t.includes(w)); };
    const rank = (text: string) => (norm(text).startsWith(q) ? 0 : 1);

    const pageHits: SearchHit[] = pages.filter((p) => matches(`${p.label} ${p.where}`))
      .sort((a, b) => rank(a.label) - rank(b.label) || a.label.length - b.label.length).slice(0, 6)
      .map((p) => ({ kind: "page", doctype: p.where, name: p.to, label: p.label, route: p.to }));

    const m = (meta as unknown as { message?: { doctypes: { name: string; module: string; single: number }[]; reports: { name: string; type: string; ref_doctype?: string; module?: string }[] } })?.message;
    const doctypeHits: SearchHit[] = (m?.doctypes ?? []).map((d) => {
      const base = DOC_ROUTES[d.name];
      const re = d.name.startsWith("RE ") ? `/re/d/${slug(d.name)}` : null;  // real-estate doctypes: generated list / form
      const react = base && !d.single ? base.replace(/\/$/, "") : re;
      return { kind: "doctype", doctype: d.module, name: d.name, label: d.single ? `${d.name} (settings)` : `${d.name} list`,
        route: react ?? `/desk/${slug(d.name)}`, external: !react };
    });

    const catalogHits = ALL_REPORTS.filter((r) => matches(`${r.title} ${r.report}`));
    const catalogNames = new Set(catalogHits.map((r) => r.report));
    const reportHits: SearchHit[] = [
      ...catalogHits.slice(0, 6).map((r) => ({ kind: "report" as const, doctype: "Report", name: r.report, label: r.title, route: r.to ?? `/reports/run/${r.key}` })),
      ...(m?.reports ?? []).filter((r) => !catalogNames.has(r.name)).map((r) => ({
        kind: "report" as const, doctype: r.type ?? "Report", name: r.name, label: r.name, route: deskReport(r), external: !deskReport(r).startsWith("/re/") })),
    ].slice(0, 8);

    const recordHits: SearchHit[] = [];
    groups.forEach((g) => {
      g.data.forEach((d) => {
        const name = String(d.name ?? "");
        if (!name) return;
        const title = g.titleField !== "name" ? (d[g.titleField] as string | undefined) : undefined;
        const u = docUrl(g.doctype, name);
        recordHits.push({ kind: "record", doctype: g.doctype, name, label: title && title !== name ? `${title} (${name})` : name, route: u.href, external: u.external });
      });
    });
    // A number (4+ digits) may be a cheque: offer to track it across all cheque books.
    const chequeHit: SearchHit[] = /^\d{4,}$/.test(debounced.trim())
      ? [{ kind: "page", doctype: "Cheque Tracking", name: `chq-${debounced}`, label: `Track cheque ${debounced.trim()}`,
          route: `/accounting/cheque-tracking?q=${encodeURIComponent(debounced.trim())}` }]
      : [];
    return [...chequeHit, ...pageHits, ...doctypeHits, ...reportHits, ...recordHits.slice(0, 15)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, debounced, pages, meta, ...groups.map((g) => g.data)]);

  React.useEffect(() => setActiveIndex(0), [debounced]);

  const go = React.useCallback(
    (hit: SearchHit) => {
      if (hit.external) window.location.assign(hit.route);
      else navigate(hit.route);
      onClose();
      setQuery("");
    },
    [navigate, onClose],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      go(results[activeIndex]);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg" className="p-0">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search pages, doctypes, reports and records…"
          className="h-11 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        {isLoading && <Spinner className="text-muted-foreground" />}
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-1 scrollbar-thin">
        {!enabled ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search across ERPNext.
          </p>
        ) : results.length === 0 && !isLoading ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No results for “{debounced}”.
          </p>
        ) : (
          results.map((hit, i) => (
            <React.Fragment key={`${hit.kind}-${hit.doctype}-${hit.name}`}>
              {(i === 0 || results[i - 1].kind !== hit.kind) && (
                <div className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{KIND_LABEL[hit.kind]}</div>
              )}
              <button
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => go(hit)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  i === activeIndex ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5 truncate font-medium">
                  {hit.label}
                  {hit.external && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />}
                </span>
                <Badge variant="secondary" className="max-w-[45%] shrink-0 truncate">
                  {hit.doctype}
                </Badge>
              </button>
            </React.Fragment>
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <CornerDownLeft className="h-3 w-3" /> to open
        </span>
        <span>↑ ↓ to navigate · Esc to close</span>
      </div>
    </Dialog>
  );
}
