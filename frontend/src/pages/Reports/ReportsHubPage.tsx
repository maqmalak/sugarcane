import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import { BarChart3, ChevronRight, Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ALL_REPORTS, REPORT_GROUPS } from "./report-catalog";

/**
 * Reports hub: one card per report, grouped by area. A card shows only when its Frappe report exists on this
 * site and the user may run it (mm_core.api.get_available_reports) — so a site without HRMS, or a user without
 * Accounts roles, sees no cards that would only fail.
 */
export function ReportsHubPage() {
  const [query, setQuery] = useState("");
  const names = useMemo(() => ALL_REPORTS.map((r) => r.report), []);
  const { data, isLoading, error } = useFrappeGetCall<{ message: string[] }>(
    "mm_core.api.get_available_reports",
    { names: JSON.stringify(names) },
    "mm_core.reports.available",
    { revalidateOnFocus: false },
  );
  const available = useMemo(() => {
    if (error) return new Set(names); // can't check: show all, the server still enforces permissions
    const raw = (data as unknown as { message?: string[] })?.message ?? (Array.isArray(data) ? (data as string[]) : []);
    return new Set(raw);
  }, [data, error, names]);

  const q = query.trim().toLowerCase();
  const groups = REPORT_GROUPS.map((g) => ({
    ...g,
    reports: g.reports.filter(
      (r) => available.has(r.report) && (!q || `${r.title} ${r.description} ${g.title}`.toLowerCase().includes(q)),
    ),
  })).filter((g) => g.reports.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Financial statements, registers, ageing, stock and payroll reports"
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reports…" className="pl-8" />
          </div>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState icon={BarChart3} title={q ? "No report matches your search" : "No reports available"} description={q ? undefined : "Ask an administrator for access to the modules you report on."} />
      ) : (
        groups.map((g) => (
          <section key={g.title} className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-4 w-1 rounded-full bg-primary" />
              {g.title}
              <span className="text-xs font-normal text-muted-foreground">({g.reports.length})</span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {g.reports.map((r) => (
                <Link key={r.key} to={r.to ?? `/reports/run/${r.key}`} className="group">
                  <Card className="flex h-full items-start gap-3 p-4 transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <r.icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{r.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
