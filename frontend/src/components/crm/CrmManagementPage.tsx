import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  List,
  LayoutGrid,
  Plus,
  Eye,
  Pencil,
  Trash2,
  Printer,
  Search,
  X,

} from "lucide-react";
import { type FormFieldMeta } from "@/components/forms/field-primitives";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { StatCard, type StatCardProps } from "@/components/common/stat-card";
import { avatarTone } from "@/components/common/avatar-tone";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { FilterBar } from "@/components/filters/filter-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { KanbanBoard, type KanbanColumnDef } from "@/components/crm/KanbanBoard";
import { RecordId } from "@/components/crm/RecordId";
import { FrappeForm } from "@/components/forms/frappe-form";
import { useCrmManagement } from "@/hooks/useCrmManagement";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { DateRangeFilterControls, useDateRangeFilter } from "@/components/filters/date-range-filter";

type ViewMode = "list" | "kanban";

export interface CrmStatSpec<T = any> extends Omit<StatCardProps, "onClick" | "active"> {
  /**
   * Makes the card clickable: clicking it narrows the list/pipeline to the rows this returns true
   * for (click again to release). Use the SAME predicate that produces `value`, so the number on the
   * card always matches the rows you get after clicking it (see `countStat`).
   */
  predicate?: (row: T) => boolean;
  /** Clickable card that CLEARS any active card filter instead of applying one (e.g. a "Total" card). */
  clear?: boolean;
}

/** Builds a stat whose `value` is the number of `rows` matching its own `predicate` (or all rows). */
export function countStat<T>(rows: T[], spec: Omit<CrmStatSpec<T>, "value">): CrmStatSpec<T> {
  return { ...spec, value: spec.predicate ? rows.filter(spec.predicate).length : rows.length };
}

export interface CrmManagementConfig<T extends Record<string, any>> {
  title: string;
  subtitle: string;
  icon: ReactNode;
  doctype: string;
  /** List fields fetched for every row. */
  fields: (keyof T)[];
  /** Extra server-side filters (e.g. company scoping) applied to the list query. */
  filters?: unknown[][];
  /** Create / edit form definition. */
  formFields: FormFieldMeta[];
  /** Defaults applied when creating. */
  defaults?: Partial<T>;
  /** Escape hatch forwarded to the create/edit form's FrappeForm — see FrappeFormProps.renderField. */
  renderField?: (
    meta: FormFieldMeta,
    ctx: { values: Record<string, any>; onChange: (fieldname: string, value: any) => void },
  ) => ReactNode | undefined;
  /** Create/edit dialog width — "lg" (default) is cramped for a rich-text (Quill) field. */
  dialogSize?: "sm" | "md" | "lg" | "xl";
  /** Field rows are grouped by on the Pipeline (kanban) view. */
  kanbanField: keyof T;
  /** Ordered pipeline column defs; if omitted, columns are derived from data. */
  kanbanColumns?: KanbanColumnDef[];
  /** Field the search box filters on. */
  searchField: string;
  /** Field driving the status filter dropdown. */
  statusField: keyof T;
  /** Fallback status options to seed the filter when data is sparse. */
  statusOptions?: string[];
  /** List table columns. */
  columns: ColumnDef<T>[];
  /** Enables the list view's Export (CSV/Excel) and Print-preview (→ browser "Save as PDF") actions — filename base, no extension. Omit to hide both. */
  exportFilename?: string;
  /**
   * Optional KPI strip; defaults to a single Total card. Receives the rows after the search/status/date
   * filters (but BEFORE a clicked card narrows them), so every card keeps showing its own count while
   * one of them is selected. Give a card a `predicate` to make it click-to-filter.
   */
  stats?: (rows: T[]) => CrmStatSpec<T>[];
  /**
   * Show each record's ID (its Frappe `name`) as an "ID" column in the list and as a small label on every
   * pipeline card. Opt-in because this page is shared with non-CRM screens, and pointless where the
   * name IS the display name (e.g. an Organization).
   */
  showId?: boolean;
  /** Field the date filter applies to (an ERPNext Date/Datetime). Omit to hide the date filter. */
  dateField?: keyof T;
  /** Human name of `dateField` for the filter's labels, e.g. "Due date" / "Updated". */
  dateLabel?: string;
  /** Display name (used for avatar initials + titles). */
  rowName: (r: T) => string;
  rowImage?: (r: T) => string | undefined;
  rowSubtitle?: (r: T) => string | undefined;
  /** Navigate to a detail page on row click / eye action. */
  onOpen?: (r: T) => void;
  /** Adds a per-row Print action (formatted single-document print preview → browser "Save as PDF"), distinct from the list-level table export/print. */
  onPrintRow?: (r: T) => void;
  renderCard?: (r: T) => ReactNode;
  /** Charts / insight cards shown between the KPI strip and the filter bar. */
  insights?: ReactNode;
  emptyTitle: string;
  emptyDescription: string;
  newLabel: string;
}

function deriveColumns<T extends Record<string, any>>(
  rows: T[] | undefined,
  field: keyof T,
  fallback: KanbanColumnDef[] | undefined,
): KanbanColumnDef[] {
  if (fallback && fallback.length > 0) return fallback;
  const seen = new Map<string, number>();
  (rows ?? []).forEach((r) => {
    const v = String(r[field] ?? "");
    seen.set(v, (seen.get(v) ?? 0) + 1);
  });
  return [...seen.entries()].map(([value, count]) => ({ value, title: value || "Uncategorized", count }));
}

export function CrmManagementPage<T extends Record<string, any>>({ config }: { config: CrmManagementConfig<T> }) {
  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeStat, setActiveStat] = useState<string | null>(null);
  const dateFilter = useDateRangeFilter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  const { rows, isLoading, error, mutate, createDoc, updateDoc, deleteDoc, loading } =
    useCrmManagement<T>({
      doctype: config.doctype,
      fields: config.fields,
      filters: config.filters,
      orderBy: { field: "modified", order: "desc" },
    });

  // Deep-link support: other pages (e.g. a Lead/Deal's Connections panel)
  // link here as `?open=<name>` since Task/Note/Call Log have no detail
  // route of their own — auto-open that row's edit dialog once it loads,
  // then drop the param so Cancel/closing doesn't reopen it.
  const [searchParams, setSearchParams] = useSearchParams();
  const openedRef = useRef<string | null>(null);
  useEffect(() => {
    const openName = searchParams.get("open");
    if (!openName || openName === openedRef.current) return;
    const row = (rows ?? []).find((r) => String(r.name) === openName);
    if (!row) return;
    openedRef.current = openName;
    setEditing(row);
    setFormValues({ ...row });
    setFormErrors({});
    setDialogOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("open");
      return next;
    }, { replace: true });
  }, [searchParams, rows, setSearchParams]);

  // Search + status + date, i.e. everything EXCEPT a clicked KPI card — the cards' own counts are
  // computed from this so selecting one doesn't zero out the others.
  const baseFiltered = useMemo(() => {
    let out = rows ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        config.fields.some((f) => String(r[f] ?? "").toLowerCase().includes(q)),
      );
    }
    if (statusFilter !== "all") {
      out = out.filter((r) => String(r[config.statusField] ?? "") === statusFilter);
    }
    if (config.dateField && dateFilter.active) {
      const field = config.dateField;
      // Rows with no date are hidden while a date filter is active.
      out = out.filter((r) => dateFilter.matches(r[field]));
    }
    return out;
  }, [rows, search, statusFilter, dateFilter, config]);

  const statusOptions = useMemo(() => {
    const fromData = [...new Set((rows ?? []).map((r) => String(r[config.statusField] ?? "")).filter(Boolean))];
    const merged = [...new Set([...(config.statusOptions ?? []), ...fromData])];
    return merged.sort((a, b) => a.localeCompare(b));
  }, [rows, config]);

  const kanbanColumns = useMemo(
    () => deriveColumns(rows, config.kanbanField, config.kanbanColumns),
    [rows, config.kanbanField, config.kanbanColumns],
  );

  const stats: CrmStatSpec<T>[] = useMemo(
    () =>
      config.stats?.(baseFiltered) ?? [
        { label: "Total", value: baseFiltered.length, icon: <List className="h-4 w-4" />, tone: "sky" as const },
      ],
    [config, baseFiltered],
  );

  const activeStatSpec = useMemo(
    () => stats.find((s) => s.predicate && s.label === activeStat),
    [stats, activeStat],
  );
  const cardsClickable = stats.some((s) => s.predicate || s.clear);

  // What both the list and the pipeline actually render.
  const filtered = useMemo(
    () => (activeStatSpec?.predicate ? baseFiltered.filter(activeStatSpec.predicate) : baseFiltered),
    [baseFiltered, activeStatSpec],
  );

  const listColumns: ColumnDef<T>[] = useMemo(
    () => [
      {
        key: "__name",
        label: "Name",
        sortable: false,
        render: (r) => (
          <div className="flex items-center gap-3">
            <Avatar
              name={config.rowName(r)}
              src={config.rowImage?.(r)}
              className={`h-8 w-8 shrink-0 text-xs font-semibold ${avatarTone(config.rowName(r))}`}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{config.rowName(r)}</p>
              {config.rowSubtitle?.(r) && (
                <p className="truncate text-xs text-muted-foreground">{config.rowSubtitle(r)}</p>
              )}
            </div>
          </div>
        ),
      },
      ...(config.showId
        ? [
            {
              key: "__id",
              label: "ID",
              render: (r: T) => <RecordId name={r.name} />,
              getValue: (r: T) => (r.name === undefined || r.name === null ? "" : String(r.name)),
            } as ColumnDef<T>,
          ]
        : []),
      ...config.columns,
      {
        key: "__actions",
        label: "",
        sortable: false,
        align: "right" as const,
        render: (r) => (
          <div className="flex items-center justify-end gap-1">
            {config.onOpen && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => config.onOpen!(r)}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
            )}
            {config.onPrintRow && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => config.onPrintRow!(r)}>
                <Printer className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setEditing(r);
                setFormValues({ ...r });
                setFormErrors({});
                setDialogOpen(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => setDeleteTarget(r)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [config],
  );


  const openCreate = () => {
    setEditing(null);
    setFormValues({ ...(config.defaults ?? {}) } as Record<string, any>);
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    config.formFields.forEach((f) => {
      if (f.reqd && (formValues[f.fieldname] === undefined || formValues[f.fieldname] === "")) {
        errors[f.fieldname] = `${f.label ?? f.fieldname} is required`;
      }
    });
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(String(editing.name), formValues as Partial<T>);
        toast.success(`${config.newLabel.replace(/^New /, "")} updated`);
      } else {
        await createDoc(formValues as Partial<T>);
        toast.success(`${config.newLabel.replace(/^New /, "")} created`);
      }
      setDialogOpen(false);
      await mutate?.();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(String(deleteTarget.name));
      toast.success("Deleted");
      setDeleteTarget(null);
      await mutate?.();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const handleCardMove = async (row: T, newColumnValue: string) => {
    try {
      await updateDoc(String(row.name), { [config.kanbanField]: newColumnValue } as Partial<T>);
      toast.success("Updated");
      await mutate?.();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const activeFilters = [
    ...(search ? [{ id: "search", label: "Search", value: search, display: search }] : []),
    ...(statusFilter !== "all"
      ? [{ id: "status", label: "Status", value: statusFilter, display: statusFilter }]
      : []),
    ...(dateFilter.active
      ? [{ id: "date", label: config.dateLabel ?? "Date", value: dateFilter.display, display: dateFilter.display }]
      : []),
    ...(activeStatSpec ? [{ id: "stat", label: "Card", value: activeStatSpec.label, display: activeStatSpec.label }] : []),
  ];

  const removeFilter = (id: string) => {
    if (id === "search") setSearch("");
    else if (id === "status") setStatusFilter("all");
    else if (id === "date") dateFilter.reset();
    else if (id === "stat") setActiveStat(null);
  };

  const handleStatClick = (s: CrmStatSpec<T>) => {
    if (s.clear) setActiveStat(null);
    else if (s.predicate) setActiveStat((cur) => (cur === s.label ? null : s.label));
  };


  return (
    <div className="space-y-6">
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        icon={config.icon}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-input bg-popover p-0.5 shadow-sm">
              <button
                onClick={() => setView("list")}
                className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  view === "list" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="h-3.5 w-3.5" /> List
              </button>
              <button
                onClick={() => setView("kanban")}
                className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  view === "kanban" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Pipeline
              </button>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> {config.newLabel}
            </Button>
          </div>
        }
      />



      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {stats.map((s, i) => {
          const { predicate, clear, ...card } = s;
          return (
            <StatCard
              key={i}
              {...card}
              onClick={cardsClickable && (predicate || clear) ? () => handleStatClick(s) : undefined}
              active={!!predicate && activeStat === s.label}
            />
          );
        })}
      </div>

      {config.insights}

      <FilterBar
        activeFilters={activeFilters}
        onRemove={removeFilter}
      >
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${config.title.toLowerCase()}…`}
            className="pl-8"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="w-full sm:w-48">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        {config.dateField && <DateRangeFilterControls filter={dateFilter} label={config.dateLabel ?? "Date"} />}
      </FilterBar>

      {view === "list" ? (
        <FrappeDataTable
          columns={listColumns}
          rows={filtered}
          rowKey={(r) => String(r.name)}
          loading={isLoading}
          error={error}
          onRetry={() => mutate?.()}
          searchable={false}
          striped
          onRowClick={config.onOpen}
          emptyTitle={config.emptyTitle}
          emptyDescription={config.emptyDescription}
          printTitle={config.title}
          printSubtitle={config.subtitle}
          exportFilename={config.exportFilename}
        />
      ) : (
        <KanbanBoard
          columns={kanbanColumns}
          rows={filtered}
          groupField={config.kanbanField}
          rowKey={(r) => String(r.name)}
          renderCard={(r) => {
            const card = config.renderCard?.(r) ?? (
              <div className="flex items-center gap-2.5">
                <Avatar
                  name={config.rowName(r)}
                  src={config.rowImage?.(r)}
                  className={`h-7 w-7 shrink-0 text-[10px] font-semibold ${avatarTone(config.rowName(r))}`}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{config.rowName(r)}</p>
                  {config.rowSubtitle?.(r) && (
                    <p className="truncate text-xs text-muted-foreground">{config.rowSubtitle(r)}</p>
                  )}
                </div>
              </div>
            );
            return config.showId ? (
              <div className="space-y-1.5">
                <RecordId name={r.name} className="block text-[10px]" />
                {card}
              </div>
            ) : (
              card
            );
          }}
          onCardMove={handleCardMove}
          onCardClick={(r) => {
            setEditing(r);
            setFormValues({ ...r });
            setFormErrors({});
            setDialogOpen(true);
          }}
          loading={isLoading}
          emptyDescription={config.emptyDescription}
        />
      )}


      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        size={config.dialogSize ?? "lg"}
        title={editing ? `Edit ${config.title.replace(/s$/, "")}` : config.newLabel}
      >
        <div className="space-y-5">
          <FrappeForm
            fields={config.formFields}
            values={formValues}
            onChange={(fieldname, value) => setFormValues((v) => ({ ...v, [fieldname]: value }))}
            errors={formErrors}
            renderField={config.renderField}
          />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={saving}>
              {editing ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete this ${config.title.toLowerCase().replace(/s$/, "")}?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={loading}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

