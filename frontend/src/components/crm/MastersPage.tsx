import { useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, Search, X, LayoutGrid } from "lucide-react";
import { type FormFieldMeta } from "@/components/forms/field-primitives";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { SectionCard } from "@/components/common/section-card";
import { EmptyState } from "@/components/common/empty-state";
import { StatCard } from "@/components/common/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { FrappeForm } from "@/components/forms/frappe-form";
import { useCrmManagement } from "@/hooks/useCrmManagement";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";

/**
 * Generic master-data management page (Lead Source, Lead Status, Territory,
 * Industry, Salutation). Simple doctypes, so this is a lighter layout than
 * CrmManagementPage: search + count KPI, an elegant card list, and a
 * create/edit dialog — no pipeline view.
 */
export interface MastersPageConfig<T extends Record<string, any>> {
  title: string;
  subtitle: string;
  icon: ReactNode;
  doctype: string;
  fields: (keyof T)[];
  formFields: FormFieldMeta[];
  primaryField: keyof T;
  primaryLabel: string;
  secondaryFields?: { field: keyof T; label: string }[];
  renderBadge?: (row: T) => ReactNode;
  extraStats?: (rows: T[]) => { label: string; value: number | string; tone?: "sky" | "emerald" | "amber" | "indigo" }[];
  orderBy?: { field: string; order: "asc" | "desc" };
  defaults?: Partial<T>;
  filters?: unknown[][];
  /** Create/edit dialog width — "md" (default) is cramped for a rich-text (Quill) field. */
  dialogSize?: "sm" | "md" | "lg" | "xl";
}

export function MastersPage<T extends Record<string, any>>({ config }: { config: MastersPageConfig<T> }) {
  const { rows, isLoading, error, mutate, createDoc, updateDoc, deleteDoc, loading: saving } = useCrmManagement<T>({
    doctype: config.doctype,
    fields: [...config.fields, "creation", "modified"] as (keyof T)[],
    orderBy: config.orderBy ?? { field: String(config.primaryField), order: "asc" },
    filters: config.filters,
  });

  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [values, setValues] = useState<Partial<T>>({});
  const [confirmDelete, setConfirmDelete] = useState<T | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((r) =>
      config.fields.some((f) => String(r[f] ?? "").toLowerCase().includes(q)),
    );
  }, [rows, query, config.fields]);

  const openCreate = () => {
    setEditing(null);
    setValues(config.defaults ?? {});
    setDialogOpen(true);
  };
  const openEdit = (row: T) => {
    setEditing(row);
    setValues(row);
    setDialogOpen(true);
  };

  const submit = async () => {
    const primary = String(values[config.primaryField] ?? "").trim();
    if (!primary) {
      toast.error(`${config.primaryLabel} is required`);
      return;
    }
    try {
      if (editing) {
        await updateDoc(editing.name!, values);
        toast.success("Record updated");
      } else {
        await createDoc(values);
        toast.success("Record created");
      }
      notifyDataChanged();
      setDialogOpen(false);
      void mutate?.();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await deleteDoc(confirmDelete.name!);
      toast.success("Deleted");
      notifyDataChanged();
      setConfirmDelete(null);
      void mutate?.();
    } catch (err) {
      toast.error(humanizeError(err));
      setConfirmDelete(null);
    }
  };

  const extra = config.extraStats?.(rows ?? []) ?? [];
  const label = (row: T) => String(row[config.primaryField] ?? row.name ?? "");


  return (
    <div className="space-y-6">
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        icon={config.icon}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> New
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={rows?.length ?? 0} icon={<LayoutGrid className="h-4 w-4" />} tone="sky" />
        {extra.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} tone={s.tone ?? "indigo"}
            icon={<LayoutGrid className="h-4 w-4" />} />
        ))}
      </div>

      <SectionCard
        title={`${filtered.length}${query ? ` of ${rows?.length ?? 0}` : ""} records`}
        actions={
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 pr-8"
              placeholder={`Search ${config.title.toLowerCase()}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setQuery("")}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        }
      >

        {error ? (
          <p className="py-6 text-center text-sm text-destructive">{humanizeError(error)}</p>
        ) : isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={query ? Search : Plus}
            title={query ? "No matches" : `No ${config.title.toLowerCase()} yet`}
            description={query ? "Try a different search term." : "Create the first one to get started."}
            actionLabel="New"
            onAction={openCreate}
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((row) => (
              <li
                key={row.name}
                className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <Avatar name={label(row)} className="h-9 w-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{label(row)}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {(config.secondaryFields ?? []).map((s) => {
                      const v = row[s.field];
                      if (v === undefined || v === null || v === "") return null;
                      return (
                        <span key={String(s.field)} className="text-xs text-muted-foreground">
                          {s.label}: <span className="text-foreground">{String(v)}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
                {config.renderBadge?.(row)}
                <div className="ml-auto flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-primary"
                    title="Edit"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Delete"
                    onClick={() => setConfirmDelete(row)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>


      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? `Edit ${config.primaryLabel}` : `New ${config.title.replace(/s$/, "")}`}
        size={config.dialogSize ?? "md"}
      >
        <div className="space-y-4">
          <FrappeForm
            fields={config.formFields}
            values={values}
            onChange={(f, v) => setValues((prev) => ({ ...prev, [f]: v }))}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={saving}>{editing ? "Update" : "Create"}</Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete ? `Delete "${label(confirmDelete)}"?` : ""}
        description="This permanently removes the record."
        confirmLabel="Delete"
        destructive
        loading={saving}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

