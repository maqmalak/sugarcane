import { useMemo, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { statusDotClass } from "@/components/common/status-color";

export interface KanbanColumnDef {
  /** The raw value stored in `groupField` for rows in this column (e.g. a status name). */
  value: string;
  title?: string;
  count?: number;
  color?: string;
}

export interface KanbanBoardProps<T> {
  columns: KanbanColumnDef[];
  rows: T[];
  /** Field on each row that determines its column (e.g. "status"). */
  groupField: keyof T;
  rowKey: (row: T) => string;
  renderCard: (row: T) => ReactNode;
  /** Called after a card is dropped on a different column — apply the update, the board itself is optimistic. */
  onCardMove: (row: T, newColumnValue: string) => void | Promise<void>;
  onAddCard?: (columnValue: string) => void;
  onCardClick?: (row: T) => void;
  loading?: boolean;
  emptyDescription?: string;
}

/**
 * Generic drag-and-drop kanban board (native HTML5 DnD — no extra npm
 * dependency). Column contents are grouped client-side from `rows` by
 * `groupField`; dropping a card fires `onCardMove` so the caller can persist
 * it (e.g. update CRM Lead/Deal `status`).
 */
export function KanbanBoard<T extends Record<string, any>>({
  columns,
  rows,
  groupField,
  rowKey,
  renderCard,
  onCardMove,
  onAddCard,
  onCardClick,
  loading,
  emptyDescription,
}: KanbanBoardProps<T>) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, T[]>();
    columns.forEach((c) => map.set(c.value, []));
    rows.forEach((row) => {
      const key = String(row[groupField] ?? "");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return map;
  }, [rows, columns, groupField]);

  const rowsByKey = useMemo(() => {
    const m = new Map<string, T>();
    rows.forEach((r) => m.set(rowKey(r), r));
    return m;
  }, [rows, rowKey]);

  const handleDrop = (columnValue: string) => {
    setDragOverColumn(null);
    if (!draggingKey) return;
    const row = rowsByKey.get(draggingKey);
    setDraggingKey(null);
    if (!row) return;
    if (String(row[groupField] ?? "") === columnValue) return;
    void onCardMove(row, columnValue);
  };

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-72 shrink-0 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title="Nothing here yet" description={emptyDescription} />;
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
      {columns.map((col) => {
        const colRows = grouped.get(col.value) ?? [];
        const isOver = dragOverColumn === col.value;
        return (
          <div
            key={col.value}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-xl border border-slate-300/80 bg-slate-100/80 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-900/60",
              isOver && "border-primary bg-primary/5",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverColumn !== col.value) setDragOverColumn(col.value);
            }}
            onDragLeave={() => setDragOverColumn((c) => (c === col.value ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(col.value);
            }}
          >
            <div className="flex items-center justify-between gap-2 rounded-t-xl border-b border-slate-300/80 bg-card px-3 py-2.5 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <span
                  className={cn("h-2 w-2 rounded-full", statusDotClass(col.title || col.value))}
                  style={col.color ? { backgroundColor: col.color } : undefined}
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold">{col.title || col.value}</span>
                <Badge variant="outline">{col.count ?? colRows.length}</Badge>
              </div>
              {onAddCard && (
                <button
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={`Add to ${col.title || col.value}`}
                  onClick={() => onAddCard(col.value)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2" style={{ maxHeight: "70vh" }}>
              {colRows.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">No records</p>
              ) : (
                colRows.map((row) => {
                  const key = rowKey(row);
                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={() => setDraggingKey(key)}
                      onDragEnd={() => setDraggingKey(null)}
                      onClick={() => onCardClick?.(row)}
                      className={cn(
                        "cursor-grab rounded-lg border border-slate-300 bg-card p-3 text-foreground shadow-[0_1px_3px_rgb(15_23_42/0.10)] transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md active:cursor-grabbing dark:border-slate-600",
                        // secondary lines (email, phone, owner) readable rather than faint
                        "[&_.text-muted-foreground]:text-slate-600 dark:[&_.text-muted-foreground]:text-slate-300",
                        onCardClick && "cursor-pointer",
                        draggingKey === key && "opacity-50",
                      )}
                    >
                      {renderCard(row)}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
