import type { ReactNode } from "react";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { PageHeader } from "@/components/common/page-header";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";

/**
 * Generic, metadata-driven list page for standard ERPNext DocTypes.
 * Uses the SDK's `useFrappeGetDocList` (SWR) so results are cached,
 * revalidated on focus and refreshed by the realtime watcher.
 */
export function SimpleListPage<T extends Record<string, any>>({
  doctype,
  title,
  subtitle,
  fields,
  columns,
  filters,
  actions,
  limit = 200,
  sortBy = "modified",
  onRowClick,
}: {
  doctype: string;
  title: string;
  subtitle?: string;
  fields: string[];
  columns: ColumnDef<T>[];
  filters?: unknown[][];
  actions?: ReactNode;
  limit?: number;
  sortBy?: string;
  onRowClick?: (row: T) => void;
}) {
  const { data, error, isLoading, mutate } = useFrappeGetDocList<T>(doctype, {
    fields: fields as any,
    filters: filters as any,
    limit,
    orderBy: { field: sortBy, order: "desc" },
  });

  return (
    <div className="space-y-4">
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      <FrappeDataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => String(r.name)}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={onRowClick}
        title={title}
        exportFilename={doctype.toLowerCase().replace(/\s+/g, "-")}
      />
    </div>
  );
}
