import useSWR from "swr";
import { getCrmKanbanData, getCrmViews, type CrmKanbanColumnGroup } from "@/services/api";

export interface KanbanBoardData<T> {
  columns: { value: string; title: string; count: number }[];
  rowsByColumn: Map<string, T[]>;
}

/**
 * Kanban board data for a doctype (CRM Lead/CRM Deal), grouped by
 * `columnField` (usually `status`). Backed by the CRM app's own
 * `crm.api.doc.get_data` — the same endpoint its own frontend uses — reshaped
 * from its per-column-group response into a flat column list + row map that's
 * easy to hand to <KanbanBoard/>.
 */
export function useCrmKanban<T extends Record<string, any>>(args: {
  doctype: string;
  columnField: string;
  filters?: Record<string, unknown>;
  /** Extra fields each card needs beyond name/title/std fields — see getCrmKanbanData. */
  kanbanFields?: string[];
  enabled?: boolean;
}) {
  const { doctype, columnField, filters = {}, kanbanFields, enabled = true } = args;
  const key = enabled ? `micromax.crm.kanban.${doctype}.${columnField}.${JSON.stringify(filters)}.${JSON.stringify(kanbanFields ?? [])}` : null;

  const { data, error, isLoading, mutate } = useSWR<CrmKanbanColumnGroup[]>(key, async () => {
    const res = await getCrmKanbanData({ doctype, columnField, filters, kanbanFields });
    return res.data;
  });

  const board: KanbanBoardData<T> = {
    columns: (data ?? []).map((g) => ({ value: g.column.name, title: g.column.name, count: g.column.count ?? g.data.length })),
    rowsByColumn: new Map((data ?? []).map((g) => [g.column.name, g.data as unknown as T[]])),
  };

  return { board, isLoading, error, mutate };
}

/** Saved per-user list/kanban view configs (`CRM View Settings`) for a doctype. */
export function useCrmSavedViews(doctype: string, enabled = true) {
  const key = enabled ? `micromax.crm.views.${doctype}` : null;
  const { data, error, isLoading, mutate } = useSWR(key, () => getCrmViews(doctype));
  return { data, isLoading, error, mutate };
}
