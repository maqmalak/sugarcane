import { useMemo } from "react";
import { KpiCard } from "@/pages/Dashboard/KpiCard";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { formatMoney, formatNumber } from "@/utils/currency";
import { asNumber } from "@/utils/cn";
import type { QueryReportResult } from "@/types/frappe";

const NUMERIC_TYPES = new Set(["Currency", "Float", "Int"]);

function formatCell(value: unknown, fieldtype: string | undefined, currency?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (fieldtype === "Currency") return formatMoney(asNumber(value), currency);
  if (fieldtype === "Float" || fieldtype === "Int") return formatNumber(asNumber(value), fieldtype === "Int" ? 0 : 2);
  if (fieldtype === "Date") return String(value);
  return String(value);
}

function summaryTone(indicator?: string): "default" | "success" | "destructive" | "warning" | "info" {
  switch (indicator) {
    case "Green":
      return "success";
    case "Red":
      return "destructive";
    case "Orange":
      return "warning";
    case "Blue":
      return "info";
    default:
      return "default";
  }
}

/**
 * Renders the result of `frappe.desk.query_report.run` for any standard
 * ERPNext script report (General Ledger, Trial Balance, Profit and Loss,
 * Balance Sheet, ...) — the server computes everything, this just displays
 * `report_summary` as KPI tiles and `columns`/`result` as a data table.
 */
export function QueryReportView({
  data,
  isLoading,
  error,
  onRetry,
  exportFilename,
  emptyDescription,
}: {
  data?: QueryReportResult;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  exportFilename: string;
  emptyDescription?: string;
}) {
  const reportCurrency = data?.chart?.currency ?? data?.report_summary?.find((s) => s.currency)?.currency;

  const columns: ColumnDef<Record<string, unknown>>[] = useMemo(
    () =>
      (data?.columns ?? [])
        .filter((c) => c.fieldname !== "__key")
        .map((c) => ({
          key: c.fieldname,
          label: c.label,
          align: NUMERIC_TYPES.has(c.fieldtype ?? "") ? "right" : "left",
          getValue: (r) => {
            const v = r[c.fieldname];
            return typeof v === "number" || typeof v === "string" ? v : String(v ?? "");
          },
          render: (r) => formatCell(r[c.fieldname], c.fieldtype, reportCurrency),
        })),
    [data?.columns, reportCurrency],
  );

  const rows = useMemo(() => (data?.result ?? []).map((r, i) => ({ ...r, __key: i })), [data?.result]);

  return (
    <div className="space-y-4">
      {data?.report_summary && data.report_summary.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {data.report_summary.map((s) => (
            <KpiCard
              key={s.label}
              label={s.label}
              value={s.datatype === "Currency" ? formatMoney(asNumber(s.value), s.currency ?? reportCurrency) : String(s.value)}
              tone={summaryTone(s.indicator)}
            />
          ))}
        </div>
      )}

      <FrappeDataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.__key)}
        loading={isLoading}
        error={error}
        onRetry={onRetry}
        title="Report"
        subtitle={`${rows.length} rows`}
        exportFilename={exportFilename}
        emptyTitle="No data for this period"
        emptyDescription={emptyDescription}
        initialPageSize={20}
      />
    </div>
  );
}
