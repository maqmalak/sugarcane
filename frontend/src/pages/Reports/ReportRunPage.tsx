import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Play, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { QueryReportView } from "@/components/common/query-report-view";
import { FrappeForm } from "@/components/forms/frappe-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useQueryReport } from "@/hooks/useAccounting";
import { reportByKey, type ReportFilters } from "./report-catalog";

/**
 * Runs one catalog report (frappe.desk.query_report.run, via useQueryReport — which also waits for reports
 * Frappe prepares in the background, like Stock Balance). Filters are edited in a form and applied with Run,
 * so a slow report doesn't re-run on every keystroke.
 */
export function ReportRunPage() {
  const { key } = useParams();
  const card = reportByKey(key);
  const { company } = useCompanyContext();

  const initial = useMemo(() => (card?.defaults?.({ company }) ?? { company }) as ReportFilters, [card, company]);
  const [draft, setDraft] = useState<ReportFilters>(initial);
  const [applied, setApplied] = useState<ReportFilters>(initial);
  useEffect(() => {
    setDraft(initial);
    setApplied(initial);
  }, [initial]);

  // Drop empty values: Frappe treats "" as a filter value.
  const cleaned = useMemo(
    () => Object.fromEntries(Object.entries(applied).filter(([, v]) => v !== undefined && v !== null && v !== "")),
    [applied],
  );
  const missing = (card?.filters ?? []).filter((f) => f.reqd && (draft[f.fieldname] === undefined || draft[f.fieldname] === ""));
  const { data, isLoading, isPreparing, error, mutate } = useQueryReport(card?.report ?? "", cleaned, Boolean(card) && !!cleaned.company);

  if (!card) return <Navigate to="/reports" replace />;
  if (card.to) return <Navigate to={card.to} replace />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={card.title}
        subtitle={card.description}
        icon={<card.icon className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/reports" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> All reports
          </Link>
        }
        actions={
          <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}>
            <RefreshCw className={isLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh
          </Button>
        }
      />

      {card.filters && card.filters.length > 0 && (
        <Card className="space-y-4 p-5">
          <FrappeForm fields={card.filters} values={draft} onChange={(f, v) => setDraft((d) => ({ ...d, [f]: v }))} />
          <div className="flex items-center justify-end gap-3">
            {missing.length > 0 && <span className="text-xs text-destructive">Fill in: {missing.map((f) => f.label).join(", ")}</span>}
            <Button onClick={() => setApplied({ ...draft })} disabled={missing.length > 0 || isLoading}>
              <Play className="h-4 w-4" /> Run report
            </Button>
          </div>
        </Card>
      )}

      {isPreparing && (
        <Card className="p-4 text-sm text-muted-foreground">This report is being prepared in the background — results appear here when ready.</Card>
      )}

      <QueryReportView
        data={data}
        isLoading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        exportFilename={`${card.key}-${String(cleaned.to_date ?? cleaned.report_date ?? "")}`}
        emptyDescription="No rows for these filters."
      />
    </div>
  );
}
