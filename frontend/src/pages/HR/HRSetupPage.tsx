import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Banknote, Building2, CalendarOff, CheckCircle2, Circle, Clock3, ListChecks, RefreshCw, Sliders } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHrInsights } from "@/hooks/useHrInsights";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { cn } from "@/utils/cn";

interface Step {
  group: string;
  key: string;
  title: string;
  to: string;
  count: number;
  count_label?: string;
  issue: number;
  issue_text?: string;
  issue_to?: string;
  detail?: string;
  optional?: boolean;
  done: boolean;
}

const GROUP_ICONS: Record<string, typeof Building2> = {
  Organisation: Building2,
  "Time & attendance": Clock3,
  Leave: CalendarOff,
  Payroll: Banknote,
  Settings: Sliders,
};

function ProgressRing({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round"
          className={cn("transition-all duration-700", value >= 80 ? "stroke-emerald-500" : value >= 50 ? "stroke-amber-500" : "stroke-rose-500")}
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums">{Math.round(value)}%</span>
        <span className="text-[11px] text-muted-foreground">ready</span>
      </div>
    </div>
  );
}

function StepRow({ s }: { s: Step }) {
  const state = s.done ? "done" : s.issue ? "issue" : s.optional ? "optional" : "todo";
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5 shrink-0">
        {state === "done" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        {state === "issue" && <AlertTriangle className="h-5 w-5 text-amber-500" />}
        {state === "todo" && <Circle className="h-5 w-5 text-rose-400" />}
        {state === "optional" && <Circle className="h-5 w-5 text-muted-foreground/50" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link to={s.to} className="text-sm font-semibold hover:text-primary hover:underline">{s.title}</Link>
          <span className="text-xs text-muted-foreground">
            {s.count.toLocaleString()} {s.count_label ?? (s.count === 1 ? "record" : "records")}
          </span>
          {s.optional && !s.count && <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">optional</span>}
        </div>
        {!!s.issue && (
          <Link to={s.issue_to ?? s.to} className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline dark:text-amber-400">
            {s.issue.toLocaleString()} {s.issue_text} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
        {!s.issue && !s.count && !s.optional && <p className="mt-0.5 text-xs text-rose-600">Not set up yet</p>}
        {s.detail && <p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p>}
      </div>
      <Link to={s.to} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary opacity-70 hover:bg-primary/10 hover:opacity-100">
        Open
      </Link>
    </li>
  );
}

/** HR & Payroll setup: every master the module needs, how many exist, and the gaps that break daily work. */
export default function HRSetupPage() {
  const { company } = useCompanyContext();
  const { data, isLoading, isValidating, mutate } = useHrInsights<{ headcount: number; steps: Step[] }>("setup_status", { company });
  const steps = data?.steps ?? [];
  const required = steps.filter((s) => !s.optional);
  const score = required.length ? (required.filter((s) => s.done).length / required.length) * 100 : 0;
  const issues = steps.filter((s) => s.issue).sort((a, b) => b.issue - a.issue);
  const groups = [...new Set(steps.map((s) => s.group))];

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR & Payroll setup"
        subtitle="Everything the module needs to run attendance, leave and payroll — and what is still missing"
        icon={<ListChecks className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" onClick={() => void mutate()} loading={isValidating}>
            <RefreshCw className="h-4 w-4" /> Re-check
          </Button>
        }
      />

      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-emerald-500/10" />
        <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center">
          {isLoading && !data ? <Skeleton className="h-36 w-36 rounded-full" /> : <ProgressRing value={score} />}
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="text-lg font-semibold">
                {required.filter((s) => s.done).length} of {required.length} essentials ready
              </h2>
              <p className="text-sm text-muted-foreground">{data ? `${data.headcount.toLocaleString()} active employees` : "Checking…"} · {issues.length} item{issues.length === 1 ? "" : "s"} need attention</p>
            </div>
            {!!issues.length && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {issues.slice(0, 6).map((s) => (
                  <li key={s.key}>
                    <Link to={s.issue_to ?? s.to} className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm hover:bg-amber-500/10">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                      <span className="min-w-0 flex-1 truncate">
                        <b className="tabular-nums">{s.issue.toLocaleString()}</b> {s.issue_text}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => {
          const Icon = GROUP_ICONS[g] ?? ListChecks;
          const items = steps.filter((s) => s.group === g);
          const done = items.filter((s) => s.done).length;
          return (
            <Card key={g} className="p-5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                  {g}
                </h3>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", done === items.length ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                  {done}/{items.length}
                </span>
              </div>
              <ul className="divide-y divide-border">{items.map((s) => <StepRow key={s.key} s={s} />)}</ul>
            </Card>
          );
        })}
        {isLoading && !data && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72 w-full" />)}
      </div>
    </div>
  );
}
