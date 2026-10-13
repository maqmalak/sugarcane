import { useEffect, useMemo, useState } from "react";
import { useNavigate , useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Eye, Trash2, Search, X } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DateInput } from "@/components/forms/frappe-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FrappeDataTable } from "@/components/tables/data-table";
import { FilterBar } from "@/components/filters/filter-bar";
import { statusDotClass } from "@/components/common/status-color";
import { cn } from "@/utils/cn";
import { useDocList, useDocMutations, useGroupCounts, type Doc } from "@/hooks/useDoc";
import { useServerTable, useServerDocCount } from "@/hooks/useServerTable";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { DocConfig } from "./doc-config";

/**
 * Generic list screen for a DocType: status tabs with live counts, filters, server-side search,
 * sorting and paging (so it stays fast with tens of thousands of rows), row actions.
 */
/**
 * Keyed by DocType: two routes in one route group (e.g. /projects/list and /projects/tasks) render this component at
 * the same place, and React would otherwise reuse it — carrying one DocType's sort / filters / form state into the
 * other (sorting Tasks by Project's expected_end_date → "You do not have permission to access field").
 */
export function DocListPage({ config }: { config: DocConfig }) {
  return <DocListPageInner key={`${config.doctype}|${config.base}`} config={config} />;
}

function DocListPageInner({ config }: { config: DocConfig }) {
  const navigate = useNavigate();
  const { company } = useCompanyContext();
  const { hasRole } = useAuth();
  const canWrite = hasRole();
  const Icon = config.icon;

  const table = useServerTable({
    searchFields: config.searchFields,
    sort: config.sort ?? { key: "modified", dir: "desc" },
    pageSize: 20,
  });

  // ?status=… and ?<filter field>=… open the list pre-filtered (links from dashboards and profiles)
  const [status, setStatus] = useState(() => new URLSearchParams(window.location.search).get("status") ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>(() => {
    const q = new URLSearchParams(window.location.search);
    // ?field=value for a configured filter, or for any field of the doctype (links such as "Bookings for this plot")
    const keys = new Set([...(config.filters ?? []).map((f) => f.field), ...config.fields.map((f) => f.fieldname)]);
    return Object.fromEntries([...q.entries()].filter(([k, v]) => v && keys.has(k) && k !== "status"));
  });
  const [pendingDelete, setPendingDelete] = useState<Doc | null>(null);

  const scoped = config.companyScoped ?? config.fields.some((f) => f.fieldname === "company");

  // Company-dependent filters from the config (a hook; stable per config since the page is keyed by doctype).
  const scopeFilters = config.useScopeFilters?.(company);
  const scopeKey = JSON.stringify(scopeFilters ?? null);

  // Filters that define "this list" (also used for the status tab counts).
  const baseFilters = useMemo(() => {
    const f: unknown[][] = [...(scoped ? companyFilter(company) : []), ...(config.baseFilters ?? [])];
    if (config.useScopeFilters) f.push(...(scopeFilters ?? [["name", "=", "__loading__"]]));
    if (config.submittable) f.push(["docstatus", "<", 2]);
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, company, config.baseFilters, config.submittable, scopeKey]);

  // URL flags (config.urlFlags, e.g. ?expiring=1 from the home page) — each shows a removable chip.
  const [urlParams, setUrlParams] = useSearchParams();
  const { currentUser } = useAuth();
  const activeFlags = (config.urlFlags ?? []).filter((fl) => urlParams.get(fl.param) === "1");
  const flagKey = activeFlags.map((fl) => fl.param).join(",");
  const clearFlag = (param: string) => {
    const next = new URLSearchParams(urlParams);
    next.delete(param);
    setUrlParams(next, { replace: true });
  };

  // …plus whatever the user picked.
  const filters = useMemo(() => {
    const f = [...baseFilters];
    activeFlags.forEach((fl) => f.push(...fl.filters({ user: currentUser ?? undefined })));
    if (status && config.statusField) f.push([config.statusField, "=", status]);
    if (config.dateField && from) f.push([config.dateField, ">=", from]);
    if (config.dateField && to) f.push([config.dateField, "<=", to]);
    Object.entries(extra).forEach(([field, value]) => value && f.push([field, "=", value]));
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFilters, status, from, to, extra, config.statusField, config.dateField, flagKey, currentUser]);

  const { data, error, isLoading, mutate } = useDocList(config.doctype, {
    fields: config.listFields,
    filters,
    orFilters: table.orFilters,
    limit: table.pageSize,
    limitStart: table.limitStart,
    orderBy: table.orderBy,
  });
  const { data: total } = useServerDocCount(config.doctype, filters, table.orFilters);
  // status cards and chip counts follow the other active filters (not their own)
  const extraFilters = useMemo(() => Object.entries(extra).filter(([, v]) => v).map(([f, v]) => [f, "=", v]), [extra]);
  const { counts } = useGroupCounts(config.doctype, config.statusField, [...baseFilters, ...extraFilters]);
  const { deleteDoc, loading: deleting } = useDocMutations(config.doctype);

  // Status tabs: configured order first, then any status that actually exists.
  const tabs = useMemo(() => {
    if (!config.statusField) return [];
    const known = config.statuses ?? [];
    const extraStatuses = Object.keys(counts).filter((s) => s && !known.includes(s));
    return [...known, ...extraStatuses].filter((s) => (counts[s] ?? 0) > 0 || known.includes(s));
  }, [config.statusField, config.statuses, counts]);
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const rowLink = (r: Doc) => `${config.base}/${encodeURIComponent(String(r.name))}`;
  const canDelete = (r: Doc) => canWrite && (!config.submittable || r.docstatus === 0 || r.docstatus === undefined);

  const confirmDelete = async () => {
    if (!pendingDelete?.name) return;
    try {
      await deleteDoc(String(pendingDelete.name));
      toast.success(`Deleted ${pendingDelete.name}`);
      setPendingDelete(null);
      notifyDataChanged();
      void mutate();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  // Top-filter lists keep status and the chip fields in the URL: shareable views, Back / Forward step through filters,
  // and other panels on the page (e.g. plot insights) can read and set them.
  const topKeys = useMemo(() => (config.topFilters ? ["status", ...config.topFilters.fields.map((f) => f.field)] : []), [config.topFilters]);
  useEffect(() => {
    if (!topKeys.length) return;
    const st = urlParams.get("status") ?? "";
    if (st !== status) setStatus(st);
    const next = { ...extra };
    let changed = false;
    topKeys.slice(1).forEach((k) => {
      const v = urlParams.get(k) ?? "";
      if ((extra[k] ?? "") !== v) { next[k] = v; changed = true; }
    });
    if (changed) setExtra(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParams, topKeys]);
  const setFilter = (key: string, value: string) => {
    if (!topKeys.includes(key)) {
      if (key === "status") setStatus(value);
      else setExtra((p) => ({ ...p, [key]: value }));
      return;
    }
    const next = new URLSearchParams(urlParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setUrlParams(next);
  };
  const clearFilters = () => {
    setStatus("");
    setFrom("");
    setTo("");
    setExtra({});
    if (topKeys.length) {
      const next = new URLSearchParams(urlParams);
      topKeys.forEach((k) => next.delete(k));
      setUrlParams(next);
    }
  };
  const hasFilters = Boolean(status || from || to || Object.values(extra).some(Boolean));

  return (
    <div className="space-y-5">
      <PageHeader
        title={config.plural}
        subtitle={config.subtitle}
        icon={<Icon className="h-5 w-5" />}
        badge={total !== undefined && (
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
            {total.toLocaleString()}
          </span>
        )}
        actions={
          canWrite || config.listActions ? (
            <div className="flex gap-2">
              {config.listActions}
              {canWrite && (
                <Button variant="primary" onClick={() => navigate(`${config.base}/new`)}>
                  <Plus className="h-4 w-4" /> New {config.singular}
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {config.topFilters && (
        <TopFilters
          config={config}
          baseFilters={baseFilters}
          extra={extra}
          setField={setFilter}
          status={status}
          statusCounts={counts}
          statusTabs={tabs}
          query={table.controls(total ?? 0).query}
          onQuery={table.controls(total ?? 0).onQueryChange}
          onClear={clearFilters}
        />
      )}

      {config.listHeaderExtra}

      {tabs.length > 0 && !config.topFilters?.status && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]" role="tablist" aria-label={`${config.plural} by status`}>
          <StatusTab label="All" count={allCount} total={allCount} active={!status} onClick={() => setFilter("status", "")} />
          {tabs.map((s) => (
            <StatusTab key={s} label={s} count={counts[s] ?? 0} total={allCount} dot={statusDotClass(s)} active={status === s} onClick={() => setFilter("status", status === s ? "" : s)} />
          ))}
        </div>
      )}

      <div className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
      <FrappeDataTable
        columns={config.columns}
        rows={data ?? []}
        rowKey={(r) => String(r.name)}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={(r) => navigate(rowLink(r))}
        printTitle={config.plural}
        printSubtitle={`${(total ?? 0).toLocaleString()} ${config.plural.toLowerCase()}`}
        serverSide={table.controls(total ?? 0)}
        pageSizeOptions={[20, 50, 100, 200]}
        searchPlaceholder={`Search ${config.plural.toLowerCase()}…`}
        exportFilename={config.doctype.toLowerCase().replace(/\s+/g, "-")}
        emptyTitle={hasFilters || table.controls(0).query ? `No ${config.plural.toLowerCase()} match` : `No ${config.plural.toLowerCase()} yet`}
        emptyDescription={
          hasFilters || table.controls(0).query
            ? "Try clearing the filters or the search."
            : canWrite
              ? `Click "New ${config.singular}" to create the first one.`
              : undefined
        }
        rowActions={(r) => [
          { label: "Open", icon: <Eye className="h-4 w-4" />, onClick: () => navigate(rowLink(r)) },
          ...(canDelete(r)
            ? [
                { separator: true, label: "" },
                { label: "Delete", icon: <Trash2 className="h-4 w-4" />, destructive: true, onClick: () => setPendingDelete(r) },
              ]
            : []),
        ]}
        filters={
          (config.dateField || (config.filters ?? []).some((f) => !config.topFilters?.fields.some((t) => t.field === f.field)) || (hasFilters && !config.topFilters) || activeFlags.length > 0) && (
            <FilterBar>
              {activeFlags.map((fl) => (
                <div key={fl.param} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Showing</label>
                  <button type="button" onClick={() => clearFlag(fl.param)} title="Remove this filter"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-600 hover:bg-rose-500/20 dark:text-rose-400">
                    {fl.label} <span aria-hidden>✕</span>
                  </button>
                </div>
              ))}
              {config.filters?.filter((f) => !config.topFilters?.fields.some((t) => t.field === f.field)).map((f) => (
                <div key={f.field} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                  <FilterSelect
                    value={extra[f.field] ?? ""}
                    onChange={(v) => setExtra((prev) => ({ ...prev, [f.field]: v }))}
                    options={f.options}
                    optionsFrom={f.optionsFrom}
                  />
                </div>
              ))}
              {config.dateField && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">{config.dateLabel ?? "Date"} from</label>
                    <DateInput type="date" value={from} onValue={setFrom} className="h-8 w-36 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">to</label>
                    <DateInput type="date" value={to} onValue={setTo} className="h-8 w-36 text-xs" />
                  </div>
                </>
              )}
              {hasFilters && !config.topFilters && (
                <Button variant="ghost" size="sm" className="mt-5" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </FilterBar>
          )
        }
      />
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name}?`}
        description={`This permanently removes the ${config.singular.toLowerCase()}.`}
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

function StatusTab({ label, count, total, active, dot, onClick }: { label: string; count: number; total: number; active: boolean; dot?: string; onClick: () => void }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const bar = dot ?? "bg-primary";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card px-3.5 pb-3 pt-2.5 text-left shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active ? "border-primary/60 ring-2 ring-primary/25" : "border-border hover:border-primary/30",
        count === 0 && !active && "opacity-60",
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className={cn("h-2 w-2 rounded-full ring-2 ring-background", bar)} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-1 flex items-baseline justify-between gap-2">
        <span className={cn("text-2xl font-bold tabular-nums tracking-tight", active && "text-primary")}>{count.toLocaleString()}</span>
        {label !== "All" && <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{pct}%</span>}
      </span>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-muted" aria-hidden="true">
        <span className={cn("block h-full rounded-r-full transition-all", bar)} style={{ width: `${label === "All" ? 100 : pct}%` }} />
      </span>
    </button>
  );
}

/** Filter bar at the top of a list: search plus chip groups with live counts; each group's counts follow the other filters. */
function TopFilters({ config, baseFilters, extra, setField, status, statusCounts, statusTabs, query, onQuery, onClear }: {
  config: DocConfig; baseFilters: unknown[][]; extra: Record<string, string>; setField: (key: string, value: string) => void;
  status: string; statusCounts: Record<string, number>; statusTabs: string[];
  query: string; onQuery: (q: string) => void; onClear: () => void;
}) {
  const tf = config.topFilters!;
  const active = Boolean(query) || Boolean(status) || tf.fields.some((f) => extra[f.field]);
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={tf.searchLabel ?? `Search ${config.plural.toLowerCase()}…`}
            aria-label={tf.searchLabel ?? "Search"} className="h-10 w-full rounded-xl border bg-background pl-9 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        {active && (
          <button type="button" onClick={() => { onQuery(""); onClear(); }}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Clear all
          </button>
        )}
      </div>
      {tf.fields.map((f) => (
        <ChipGroup key={f.field} label={f.label} doctype={config.doctype} field={f.field}
          filters={[...baseFilters, ...Object.entries(extra).filter(([k, v]) => v && k !== f.field).map(([k, v]) => [k, "=", v]), ...(status && config.statusField ? [[config.statusField, "=", status]] : [])]}
          value={extra[f.field] ?? ""} onChange={(v) => setField(f.field, v)} />
      ))}
      {tf.status && config.statusField && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
          <Chip on={!status} onClick={() => setField("status", "")} label="All" count={Object.values(statusCounts).reduce((a, b) => a + b, 0)} />
          {statusTabs.map((s) => (
            <Chip key={s} on={status === s} onClick={() => setField("status", status === s ? "" : s)} label={s} count={statusCounts[s] ?? 0} dot={statusDotClass(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChipGroup({ label, doctype, field, filters, value, onChange }: {
  label: string; doctype: string; field: string; filters: unknown[][]; value: string; onChange: (v: string) => void;
}) {
  const { counts } = useGroupCounts(doctype, field, filters);
  const keys = Object.keys(counts).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (value && !keys.includes(value)) keys.push(value);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <Chip on={!value} onClick={() => onChange("")} label="All" count={Object.values(counts).reduce((a, b) => a + b, 0)} />
      {keys.map((k) => <Chip key={k} on={value === k} onClick={() => onChange(value === k ? "" : k)} label={k} count={counts[k] ?? 0} />)}
    </div>
  );
}

function Chip({ on, onClick, label, count, dot }: { on: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
        on ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-background hover:border-primary/40 hover:bg-primary/5",
        !on && count === 0 && "opacity-50")}>
      {dot && <span className={cn("h-2 w-2 rounded-full", dot, on && "ring-2 ring-white/60")} aria-hidden />}
      {label}
      <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", on ? "bg-white/20" : "bg-muted")}>{count.toLocaleString()}</span>
    </button>
  );
}

/** A filter dropdown whose options are fixed, or listed from another DocType's names. */
function FilterSelect({ value, onChange, options, optionsFrom }: { value: string; onChange: (v: string) => void; options?: string[]; optionsFrom?: string }) {
  const { data } = useDocList(optionsFrom ?? "User", { fields: ["name"], limit: 200, orderBy: { field: "name", order: "asc" }, enabled: Boolean(optionsFrom) });
  const list = options ?? (data ?? []).map((r) => String(r.name));
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-44 text-xs">
      <option value="">All</option>
      {list.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </Select>
  );
}
