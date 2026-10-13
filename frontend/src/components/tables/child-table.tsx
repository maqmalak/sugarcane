import * as React from "react";
import { ArrowDown, ArrowUp, Check, Columns3, Copy, Eye, EyeOff, Pencil, Plus, RotateCcw, Settings2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { getCall, postCall } from "@/services/frappe";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/cn";
import { type FormFieldMeta } from "@/components/forms/field-primitives";
import { FieldRenderer } from "@/components/forms/frappe-form";

export type ChildRow = Record<string, any>;

export interface EditableChildTableProps {
  columns: FormFieldMeta[];
  rows: ChildRow[];
  onChange: (index: number, fieldname: string, value: any) => void;
  onAddRow?: () => void;
  onRemoveRow?: (index: number) => void;
  onDuplicateRow?: (index: number) => void;
  /** Called when a Link column value changes (used to fetch item_name etc.). */
  onLinkChange?: (index: number, fieldname: string, value: string) => void;
  /** Extra derived values per row (e.g. amount) rendered read-only. */
  renderCell?: (row: ChildRow, col: FormFieldMeta) => React.ReactNode | undefined;
  /** Rendered as sticky totals below the table. */
  totals?: { label: string; value: React.ReactNode; align?: "left" | "right" }[];
  readOnly?: boolean;
  emptyMessage?: string;
  className?: string;
  /** Adds a row-selection checkbox column plus a "Delete Selected" bulk action (desktop only). */
  selectable?: boolean;
  /** Adds a per-row edit icon (desktop only) that opens the row's fields in a dialog — handy when there are more columns than fit comfortably in the grid. */
  editableInDialog?: boolean;
  /** Extra fields shown only in the row-edit dialog, on top of `columns` — for less-used fields that don't need a permanent grid column. */
  extraDialogColumns?: FormFieldMeta[];
  /** Adds a "Columns" button to show/hide inline grid columns (desktop only). Hidden columns still appear in the row-edit dialog. */
  columnPicker?: boolean;
  /** Rendered at the left of the toolbar row (e.g. the section title), so title, Columns and Add Row share one line. */
  toolbarStart?: React.ReactNode;
  /** Share the available width between the columns (inputs shrink to fit) instead of sizing every column to its widest input; the grid only scrolls sideways once columns would drop below ~150px. */
  fitColumns?: boolean;
  /**
   * Enables ERPNext's "Configure Columns": choose the fields and their widths (1–10 column units), stored per user in
   * User Settings → GridView[child doctype] of the parent doctype — the same setting the desk grid reads and writes.
   */
  gridSettings?: { parent: string; child: string };
}

type GridCol = { fieldname: string; columns: number };

/** The user's saved GridView columns for one child table (shared with the ERPNext desk). */
function useGridView(key?: { parent: string; child: string }) {
  const [cols, setCols] = React.useState<GridCol[] | null>(null);
  const [all, setAll] = React.useState<Record<string, GridCol[]>>({});
  React.useEffect(() => {
    if (!key) return;
    let live = true;
    getCall<string | Record<string, unknown> | null>("frappe.model.utils.user_settings.get", { doctype: key.parent })
      .then((raw) => {
        const us = (typeof raw === "string" ? JSON.parse(raw || "{}") : raw ?? {}) as { GridView?: Record<string, GridCol[]> };
        if (!live) return;
        setAll(us.GridView ?? {});
        setCols(us.GridView?.[key.child]?.length ? us.GridView[key.child] : null);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [key?.parent, key?.child]);
  const save = async (next: GridCol[] | null) => {
    if (!key) return;
    const grid = { ...all };
    if (next?.length) grid[key.child] = next; else delete grid[key.child];
    await postCall("frappe.model.utils.user_settings.save", { doctype: key.parent, user_settings: JSON.stringify({ GridView: grid }) });
    setAll(grid);
    setCols(next?.length ? next : null);
  };
  return { cols, save };
}

/**
 * Editable child-table grid.
 *
 * Features: inline editing, add/delete/duplicate rows, horizontal scroll, a
 * responsive card layout on small screens, and sticky totals.
 */
export function EditableChildTable({
  columns,
  rows,
  onChange,
  onAddRow,
  onRemoveRow,
  onDuplicateRow,
  onLinkChange,
  renderCell,
  totals,
  readOnly,
  emptyMessage = "No rows yet. Click Add Row to begin.",
  className,
  selectable,
  editableInDialog,
  extraDialogColumns,
  columnPicker,
  toolbarStart,
  fitColumns,
  gridSettings,
}: EditableChildTableProps) {
  const grid = useGridView(gridSettings);
  const [configuring, setConfiguring] = React.useState(false);
  const linkFieldnames = React.useMemo(
    () => columns.filter((c) => c.fieldtype === "Link").map((c) => c.fieldname),
    [columns],
  );
  const [selectedRows, setSelectedRows] = React.useState<Set<number>>(new Set());
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [hiddenFields, setHiddenFields] = React.useState<Set<string>>(new Set());

  // Large tables (e.g. a payroll journal with thousands of lines) render a page at a time — thousands of live
  // inputs would freeze the browser. Rows keep their real index so edits, the dialog and totals are unaffected.
  const PAGE = 50;
  const paginate = rows.length > 100;
  const pageCount = paginate ? Math.ceil(rows.length / PAGE) : 1;
  const [page, setPage] = React.useState(0);
  const prevLen = React.useRef(rows.length);
  React.useEffect(() => {
    if (rows.length > prevLen.current && paginate) setPage(Math.ceil(rows.length / PAGE) - 1); // a new row → show it
    else if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
    prevLen.current = rows.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);
  const start = paginate ? page * PAGE : 0;
  const pageRows = (paginate ? rows.slice(start, start + PAGE) : rows).map((row, k) => ({ row, i: start + k }));

  const dialogColumns = React.useMemo(() => {
    const seen = new Set(columns.map((c) => c.fieldname));
    return [...columns, ...(extraDialogColumns ?? []).filter((c) => !seen.has(c.fieldname))];
  }, [columns, extraDialogColumns]);
  const visibleColumns = React.useMemo(() => {
    if (grid.cols) {
      const byName = new Map(dialogColumns.map((c) => [c.fieldname, c]));
      const chosen = grid.cols.map((g) => byName.get(g.fieldname)).filter((c): c is FormFieldMeta => Boolean(c));
      if (chosen.length) return chosen;
    }
    return columns.filter((c) => !hiddenFields.has(c.fieldname));
  }, [columns, hiddenFields, grid.cols, dialogColumns]);
  // ERPNext column units (1–10): the saved width, else the field's own `columns`, else 2
  const unitsOf = (c: FormFieldMeta) => grid.cols?.find((g) => g.fieldname === c.fieldname)?.columns ?? (Number((c as { columns?: number }).columns) || 2);
  const totalUnits = visibleColumns.reduce((a, c) => a + unitsOf(c), 0) || 1;

  const toggleField = (fieldname: string) =>
    setHiddenFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldname)) next.delete(fieldname);
      else next.add(fieldname);
      return next;
    });

  const toggleRow = (i: number) =>
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const deleteSelected = () => {
    if (!onRemoveRow) return;
    Array.from(selectedRows)
      .sort((a, b) => b - a)
      .forEach((i) => onRemoveRow(i));
    setSelectedRows(new Set());
  };

  return (
    <div className={cn("space-y-3", className)}>
      {(toolbarStart || onAddRow || columnPicker || gridSettings || (!readOnly && selectable && selectedRows.size > 0)) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {toolbarStart && <div className="mr-auto min-w-0">{toolbarStart}</div>}
          {!readOnly && selectable && selectedRows.size > 0 && onRemoveRow && (
            <Button variant="outline" size="sm" onClick={deleteSelected}>
              <Trash2 className="h-4 w-4" /> Delete Selected ({selectedRows.size})
            </Button>
          )}
          {gridSettings && (
            <Button variant="outline" size="sm" onClick={() => setConfiguring(true)} title="Choose the fields shown in this table and their widths">
              <Settings2 className="h-4 w-4" /> Configure columns
            </Button>
          )}
          {columnPicker && !gridSettings && (
            <DropdownMenu
              trigger={
                <Button variant="outline" size="sm">
                  <Columns3 className="h-4 w-4" /> Columns
                </Button>
              }
              items={columns.map((c) => {
                const hidden = hiddenFields.has(c.fieldname);
                return {
                  label: c.label ?? c.fieldname,
                  icon: hidden ? (
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 text-primary" />
                  ),
                  onClick: () => toggleField(c.fieldname),
                  disabled: visibleColumns.length <= 1 && !hidden,
                };
              })}
              width="w-56"
            />
          )}
          {!readOnly && onAddRow && (
            <Button variant="outline" size="sm" onClick={onAddRow}>
              <Plus className="h-4 w-4" /> Add Row
            </Button>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <>
          {/* Desktop grid */}
          <div className="hidden overflow-x-auto rounded-md border border-border md:block scrollbar-thin">
            <table
              className={cn("w-full border-collapse text-sm", fitColumns || grid.cols ? "table-fixed" : "min-w-max")}
              style={grid.cols ? { minWidth: 112 + totalUnits * 70 } : fitColumns ? { minWidth: 112 + visibleColumns.length * 150 } : undefined}
            >
              {grid.cols && (
                <colgroup>
                  <col style={{ width: 112 }} />
                  {visibleColumns.map((c) => <col key={c.fieldname} style={{ width: `${(unitsOf(c) * 100) / totalUnits}%` }} />)}
                </colgroup>
              )}
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left">
                  <th className="sticky left-0 z-10 w-28 bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground">
                    <div className="flex items-center gap-2">
                      {selectable && (
                        <input
                          type="checkbox"
                          className="accent-primary"
                          aria-label="Select all rows"
                          checked={rows.length > 0 && selectedRows.size === rows.length}
                          onChange={(e) =>
                            setSelectedRows(e.target.checked ? new Set(rows.map((_, i) => i)) : new Set())
                          }
                        />
                      )}
                      Actions
                    </div>
                  </th>
                  {visibleColumns.map((col) => (
                    <th
                      key={col.fieldname}
                      className={cn("whitespace-nowrap px-3 py-2 text-xs font-semibold text-muted-foreground", !fitColumns && "min-w-[110px]")}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ row, i }) => (
                  <tr key={row.__uuid ?? i} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="sticky left-0 z-10 bg-card px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        {selectable && (
                          <input
                            type="checkbox"
                            className="accent-primary mr-0.5"
                            aria-label={`Select row ${i + 1}`}
                            checked={selectedRows.has(i)}
                            onChange={() => toggleRow(i)}
                          />
                        )}
                        {editableInDialog && (
                          <button
                            title="Edit row"
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            onClick={() => setEditingIndex(i)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!readOnly && onDuplicateRow && (
                          <button
                            title="Duplicate row"
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            onClick={() => onDuplicateRow(i)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!readOnly && onRemoveRow && (
                          <button
                            title="Delete row"
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => onRemoveRow(i)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    {visibleColumns.map((col) => (
                      <td key={col.fieldname} className="px-1 py-1.5">
                        {renderCell?.(row, col) ?? (
                          <FieldRenderer
                            meta={{ ...col, read_only: col.read_only || readOnly }}
                            values={row}
                            hideLabel
                            onChange={(fieldname, value) => {
                              onChange(i, fieldname, value);
                              if (linkFieldnames.includes(fieldname)) {
                                onLinkChange?.(i, fieldname, value ?? "");
                              }
                            }}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card layout */}
          <div className="space-y-3 md:hidden">
            {pageRows.map(({ row, i }) => (
              <div key={row.__uuid ?? i} className="rounded-md border border-border p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Row {i + 1}</span>
                  <div className="flex gap-1">
                    {!readOnly && onDuplicateRow && (
                      <button
                        className="rounded p-1 text-muted-foreground hover:bg-accent"
                        onClick={() => onDuplicateRow(i)}
                        aria-label="Duplicate row"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    )}
                    {!readOnly && onRemoveRow && (
                      <button
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onRemoveRow(i)}
                        aria-label="Delete row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {columns.map((col) => {
                    const custom = renderCell?.(row, col);
                    return (
                      <div key={col.fieldname}>
                        {custom ? (
                          <>
                            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {col.label}
                            </label>
                            {custom}
                          </>
                        ) : (
                          <FieldRenderer
                            meta={{ ...col, read_only: col.read_only || readOnly }}
                            values={row}
                            onChange={(fieldname, value) => {
                              onChange(i, fieldname, value);
                              if (linkFieldnames.includes(fieldname)) {
                                onLinkChange?.(i, fieldname, value ?? "");
                              }
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {paginate && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            Rows {(start + 1).toLocaleString()}–{Math.min(start + PAGE, rows.length).toLocaleString()} of {rows.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={page === 0} onClick={() => setPage(0)}>First</Button>
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="px-2 tabular-nums">Page {page + 1} / {pageCount}</span>
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= pageCount - 1} onClick={() => setPage(pageCount - 1)}>Last</Button>
          </div>
        </div>
      )}

      {totals && totals.length > 0 && rows.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-muted/30">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-3 py-2 text-sm">
            {totals.map((t) => (
              <div key={t.label} className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t.label}:</span>
                <span className="font-semibold tabular-nums">{t.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {editableInDialog && editingIndex !== null && rows[editingIndex] && (
        <Dialog open onClose={() => setEditingIndex(null)} title={`Row ${editingIndex + 1}`} size="lg">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {dialogColumns.map((col) => {
              const custom = renderCell?.(rows[editingIndex], col);
              return (
                <div key={col.fieldname}>
                  {custom ? (
                    <>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {col.label}
                      </label>
                      {custom}
                    </>
                  ) : (
                    <FieldRenderer
                      meta={{ ...col, read_only: col.read_only || readOnly }}
                      values={rows[editingIndex]}
                      onChange={(fieldname, value) => {
                        onChange(editingIndex, fieldname, value);
                        if (linkFieldnames.includes(fieldname)) {
                          onLinkChange?.(editingIndex, fieldname, value ?? "");
                        }
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between">
            {!readOnly && onRemoveRow ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  onRemoveRow(editingIndex);
                  setEditingIndex(null);
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete Row
              </Button>
            ) : (
              <span />
            )}
            <Button variant="save" size="sm" onClick={() => setEditingIndex(null)}>
              <Check className="h-4 w-4" /> Done
            </Button>
          </div>
        </Dialog>
      )}
      {configuring && gridSettings && (
        <ConfigureColumns
          fields={dialogColumns}
          current={visibleColumns.map((c) => ({ fieldname: c.fieldname, columns: unitsOf(c) }))}
          onClose={() => setConfiguring(false)}
          onSave={async (next) => {
            try { await grid.save(next); toast.success(next ? "Columns saved — also used in the ERPNext desk" : "Columns reset to default"); setConfiguring(false); }
            catch (e) { toast.error(String((e as Error).message ?? e)); }
          }}
        />
      )}
    </div>
  );
}

/** ERPNext-style "Configure Columns": pick fields, order them and give each a width in column units (1–10). */
function ConfigureColumns({ fields, current, onClose, onSave }: {
  fields: FormFieldMeta[]; current: GridCol[]; onClose: () => void; onSave: (cols: GridCol[] | null) => void;
}) {
  const [cols, setCols] = React.useState<GridCol[]>(current);
  const [busy, setBusy] = React.useState(false);
  const labelOf = (fn: string) => fields.find((f) => f.fieldname === fn)?.label ?? fn;
  const unused = fields.filter((f) => !cols.some((c) => c.fieldname === f.fieldname) && !["Section Break", "Column Break", "Tab Break", "Table", "HTML"].includes(String(f.fieldtype)));
  const total = cols.reduce((a, c) => a + c.columns, 0);
  const move = (i: number, d: number) => setCols((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const run = async (v: GridCol[] | null) => { setBusy(true); try { await onSave(v); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={onClose} title="Configure columns" size="lg">
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">Choose the fields shown in this table, their order and width (1–10 column units, as in ERPNext). Saved for you and shared with the ERPNext desk grid.</p>
        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-[1fr_7rem_5rem] gap-2 border-b bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Field</span><span>Width</span><span className="text-right">Order</span>
          </div>
          {cols.map((c, i) => (
            <div key={c.fieldname} className="grid grid-cols-[1fr_7rem_5rem] items-center gap-2 border-b px-3 py-2 last:border-0">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <button type="button" title="Remove" disabled={cols.length <= 1} onClick={() => setCols((p) => p.filter((x) => x.fieldname !== c.fieldname))}
                  className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                <span className="truncate font-medium">{labelOf(c.fieldname)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <input type="range" min={1} max={10} value={c.columns} aria-label={`${labelOf(c.fieldname)} width`}
                  onChange={(e) => setCols((p) => p.map((x) => (x.fieldname === c.fieldname ? { ...x, columns: Number(e.target.value) } : x)))}
                  className="h-1 w-16 accent-[hsl(var(--primary))]" />
                <input type="number" min={1} max={10} value={c.columns} aria-label={`${labelOf(c.fieldname)} columns`}
                  onChange={(e) => setCols((p) => p.map((x) => (x.fieldname === c.fieldname ? { ...x, columns: Math.min(10, Math.max(1, Number(e.target.value) || 1)) } : x)))}
                  className="field h-7 w-11 px-1 text-center text-xs" />
              </span>
              <span className="flex justify-end gap-0.5">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === cols.length - 1} className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className={cn("font-medium", total > 10 ? "text-amber-600" : "text-muted-foreground")}>Total width {total} / 10 units{total > 10 ? " — the table will scroll sideways" : ""}</span>
        </div>
        {unused.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold">Add a field</p>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
              {unused.map((f) => (
                <button key={f.fieldname} type="button" onClick={() => setCols((p) => [...p, { fieldname: f.fieldname, columns: 2 }])}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs hover:border-primary/40 hover:bg-primary/5">
                  <Plus className="h-3 w-3" />{f.label ?? f.fieldname}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <Button variant="neutral" size="sm" disabled={busy} onClick={() => void run(null)}><RotateCcw className="h-3.5 w-3.5" />Reset to default</Button>
          <div className="flex gap-2">
            <Button variant="neutral" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="save" size="sm" disabled={busy || !cols.length} onClick={() => void run(cols)}><Check className="h-4 w-4" />Save</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}