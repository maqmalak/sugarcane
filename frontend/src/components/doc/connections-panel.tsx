import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetCall, useFrappeGetDocList } from "frappe-react-sdk";
import { Check, ChevronDown, ChevronUp, Columns3, Eye, EyeOff, Link2, Search, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/status-badge";
import { cn } from "@/utils/cn";
import { docUrl } from "@/app/doc-routes";
import { SC_DOCS as RE_DOCS, docBase } from "@/sc/registry";

interface ConnRow { name: string; status?: string; date?: string | null; detail?: string | null }
interface ConnGroup { group: string; doctype: string; label: string; count: number; rows: ConnRow[] }

/** @deprecated kept for older imports — use docUrl() from "@/app/doc-routes". */
export { DOC_ROUTES as DOC_FORM_ROUTES } from "@/app/doc-routes";

const SHOW = 6;
const RE_SET = new Set(RE_DOCS.map((d) => d.doctype));
const short = (dt: string) => dt.replace(/^RE /, "");

/** React form for RE DocTypes, else the shared route table (or the desk). */
function urlFor(doctype: string, name: string) {
  return RE_SET.has(doctype) ? { href: `${docBase(doctype)}/${encodeURIComponent(name)}`, external: false } : docUrl(doctype, name);
}

/** Which connection types are hidden on this DocType's form, remembered per browser. */
function usePrefs(doctype: string) {
  const key = `conn-prefs:${doctype}`;
  const read = (): { hidden: string[]; empty: boolean } => {
    try {
      return { hidden: [], empty: false, ...JSON.parse(localStorage.getItem(key) ?? "{}") };
    } catch {
      return { hidden: [], empty: false };
    }
  };
  const [prefs, setPrefs] = useState(read);
  const save = (next: { hidden: string[]; empty: boolean }) => {
    setPrefs(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* storage blocked — the choice just isn't remembered */
    }
  };
  return { prefs, save };
}

/** The desk's "Connections" dashboard: linked documents grouped by area, with counts and the latest rows — choose which to show. */
export function ConnectionsPanel({ doctype, name }: { doctype: string; name: string }) {
  const { data, isLoading, error } = useFrappeGetCall<{ message: ConnGroup[] }>(
    "mm_core.connections.get_connections",
    { doctype, name },
    `micromax.connections.${doctype}.${name}`,
    { revalidateOnFocus: false },
  );
  const { prefs, save } = usePrefs(doctype);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const groups = data?.message ?? [];
  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const withRows = groups.filter((g) => g.count > 0);
  const pool = prefs.empty ? groups : withRows;
  const shown = pool.filter((g) => !hidden.has(g.doctype));
  const byGroup = shown.reduce<Record<string, ConnGroup[]>>((acc, g) => ((acc[g.group] ??= []).push(g), acc), {});
  const toggle = (dt: string) => save({ ...prefs, hidden: hidden.has(dt) ? prefs.hidden.filter((x) => x !== dt) : [...prefs.hidden, dt] });
  const chips = pool.filter((g) => !q || `${g.label} ${g.group}`.toLowerCase().includes(q.toLowerCase()));

  if (isLoading) return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />)}</div>;
  if (error) return <p className="text-sm text-destructive">Could not load connections.</p>;
  if (!groups.length) return <Card className="p-8 text-center text-sm text-muted-foreground">No linked document types are defined for {short(doctype)}.</Card>;

  const total = withRows.reduce((a, g) => a + g.count, 0);
  return (
    <div className="space-y-5">
      {/* selector */}
      <Card className="space-y-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{num(total)} linked documents in {withRows.length} types</p>
            <p className="text-xs text-muted-foreground">
              Showing {shown.length} of {pool.length} types{groups.length - withRows.length > 0 && !prefs.empty ? ` · ${groups.length - withRows.length} empty types hidden` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => save({ ...prefs, empty: !prefs.empty })}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition",
                prefs.empty ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {prefs.empty ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} Empty types
            </button>
            <button type="button" onClick={() => setPicking((p) => !p)} aria-expanded={picking}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition",
                picking ? "border-primary bg-primary text-primary-foreground shadow" : "hover:bg-muted")}>
              <SlidersHorizontal className="h-3.5 w-3.5" /> Choose connections
            </button>
          </div>
        </div>
        {/* quick chips: click to show / hide */}
        <div className={cn("flex flex-wrap gap-1.5", !picking && "max-h-[4.5rem] overflow-hidden")}>
          {(picking ? chips : pool).map((g) => {
            const on = !hidden.has(g.doctype);
            return (
              <button key={g.doctype} type="button" onClick={() => toggle(g.doctype)} aria-pressed={on} title={`${g.group} · ${on ? "click to hide" : "click to show"}`}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  on ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15" : "border-dashed text-muted-foreground hover:border-solid hover:text-foreground")}>
                {on ? <Check className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border" />}
                {short(g.label)}
                <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", on ? "bg-primary/15" : "bg-muted")}>{g.count}</span>
              </button>
            );
          })}
        </div>
        {picking && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a type…" aria-label="Find a connection type"
                className="h-8 w-52 rounded-lg border bg-background pl-8 pr-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <button type="button" className="h-8 rounded-lg px-2.5 text-xs font-medium text-primary hover:bg-primary/10" onClick={() => save({ ...prefs, hidden: [] })}>Show all</button>
            <button type="button" className="h-8 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted" onClick={() => save({ ...prefs, hidden: pool.map((g) => g.doctype) })}>Hide all</button>
            <button type="button" className="h-8 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              onClick={() => save({ ...prefs, hidden: groups.filter((g) => !g.doctype.startsWith("RE ")).map((g) => g.doctype) })}>Real-estate only</button>
          </div>
        )}
      </Card>

      {shown.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {withRows.length ? "All connection types are hidden — choose some above." : `Nothing is linked to this ${short(doctype).toLowerCase()} yet.`}
        </Card>
      ) : (
        Object.entries(byGroup).map(([group, list]) => (
          <section key={group} className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-4 w-1 rounded-full bg-primary" /> {group}
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{list.length}</span>
            </h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {list.map((g) => <ConnCard key={g.doctype} g={g} onHide={() => toggle(g.doctype)} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

const num = (n: number) => n.toLocaleString();

interface MetaField { fieldname: string; fieldtype: string; label?: string; hidden?: number; options?: string }
const SHOWABLE = new Set(["Data", "Link", "Select", "Currency", "Float", "Int", "Percent", "Date", "Datetime", "Check", "Phone", "Small Text", "Dynamic Link"]);

/** Fields chosen to show on a connection card's rows, remembered per DocType. */
function useCardFields(doctype: string) {
  const key = `conn-fields:${doctype}`;
  const [fields, setFields] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(key) ?? "[]") as string[]; } catch { return []; } });
  const save = (next: string[]) => { setFields(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* not remembered */ } };
  return [fields, save] as const;
}

const fmtCell = (v: unknown, type?: string) => {
  if (v === null || v === undefined || v === "") return "—";
  if (type === "Currency" || type === "Float") return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (type === "Check") return Number(v) ? "Yes" : "No";
  return String(v);
};

function ConnCard({ g, onHide }: { g: ConnGroup; onHide: () => void }) {
  const [all, setAll] = useState(false);
  const rows = all ? g.rows : g.rows.slice(0, SHOW);
  const [chosen, setChosen] = useCardFields(g.doctype);
  const [picking, setPicking] = useState(false);
  const { data: meta } = useFrappeGetCall<{ message: { fields: MetaField[] } }>(
    "sugarcane.api.v1.spa.form_meta", { doctype: g.doctype }, picking || chosen.length ? `conn-meta.${g.doctype}` : null, { revalidateOnFocus: false, dedupingInterval: 600_000 });
  const metaFields = (meta?.message.fields ?? []).filter((f) => SHOWABLE.has(f.fieldtype) && !f.hidden && f.fieldname !== "naming_series");
  const typeOf = (fn: string) => metaFields.find((f) => f.fieldname === fn)?.fieldtype;
  const labelOf = (fn: string) => metaFields.find((f) => f.fieldname === fn)?.label ?? fn.replace(/_/g, " ");
  const names = rows.map((r) => r.name);
  const { data: extra } = useFrappeGetDocList<Record<string, unknown>>(g.doctype, {
    fields: ["name", ...chosen] as any, filters: [["name", "in", names]] as any, limit: names.length || 1,
  }, chosen.length && names.length ? `conn-extra.${g.doctype}.${chosen.join(",")}.${names.join(",")}` : null);
  const extraBy = new Map((extra ?? []).map((r) => [String(r.name), r]));
  const toggleField = (fn: string) => setChosen(chosen.includes(fn) ? chosen.filter((x) => x !== fn) : [...chosen, fn].slice(0, 6));
  return (
    <Card className={cn("group flex flex-col overflow-hidden rounded-2xl p-0", !g.count && "opacity-70")}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Link2 className="h-3.5 w-3.5" /></span>
          <span className="truncate">{short(g.label)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", g.count ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
            {g.count > g.rows.length ? `${g.count} · latest ${g.rows.length}` : g.count}
          </span>
          {g.count > 0 && (
            <button type="button" onClick={() => setPicking((p) => !p)} title="Choose fields to show" aria-label={`Choose ${g.label} fields`} aria-expanded={picking}
              className={cn("rounded-md p-1 transition hover:bg-muted hover:text-foreground", picking || chosen.length ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}>
              <Columns3 className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={onHide} title="Hide this connection" aria-label={`Hide ${g.label}`}
            className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100">
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      {picking && (
        <div className="border-b border-border bg-muted/30 px-4 py-2.5">
          <div className="mb-1.5 flex items-center justify-between text-[11px]">
            <span className="font-semibold">Fields on each row <span className="font-normal text-muted-foreground">({chosen.length}/6)</span></span>
            {chosen.length > 0 && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setChosen([])}>Clear</button>}
          </div>
          <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
            {metaFields.map((f) => {
              const on = chosen.includes(f.fieldname);
              return (
                <button key={f.fieldname} type="button" onClick={() => toggleField(f.fieldname)} aria-pressed={on}
                  className={cn("rounded-full border px-2 py-0.5 text-[11px] transition", on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/40")}>
                  {on && <Check className="mr-0.5 inline h-3 w-3" />}{f.label ?? f.fieldname}
                </button>
              );
            })}
            {!metaFields.length && <span className="text-[11px] text-muted-foreground">Loading fields…</span>}
          </div>
        </div>
      )}
      {g.count === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">None linked</p>
      ) : (
        <ul className="max-h-80 divide-y divide-border/60 overflow-y-auto scrollbar-thin">
          {rows.map((r) => {
            const u = urlFor(g.doctype, r.name);
            return (
              <li key={r.name} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  {u.external ? (
                    <a href={u.href} target="_blank" rel="noreferrer" className="block truncate font-medium text-primary hover:underline" title="Opens in ERPNext desk">{r.name} ↗</a>
                  ) : (
                    <Link to={u.href} className="block truncate font-medium text-primary hover:underline">{r.name}</Link>
                  )}
                  <span className="block truncate text-muted-foreground">{[r.date, r.detail].filter(Boolean).join(" · ")}</span>
                  {chosen.length > 0 && (
                    <span className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px]">
                      {chosen.map((fn) => (
                        <span key={fn} className="whitespace-nowrap"><span className="text-muted-foreground">{labelOf(fn)}:</span> <b className="font-medium text-foreground">{fmtCell(extraBy.get(r.name)?.[fn], typeOf(fn))}</b></span>
                      ))}
                    </span>
                  )}
                </div>
                {r.status && <StatusBadge status={r.status} className="shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
      {g.rows.length > SHOW && (
        <button type="button" onClick={() => setAll((a) => !a)} className="flex items-center justify-center gap-1 border-t border-border py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          {all ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</> : <><ChevronDown className="h-3.5 w-3.5" /> Show {g.rows.length - SHOW} more</>}
        </button>
      )}
    </Card>
  );
}
