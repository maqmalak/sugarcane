import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BookCheck, CheckCircle2, Landmark, Scale, TrendingDown, TrendingUp, UserMinus, UserPlus, Users2, Wallet,
} from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { BarChart, DonutChart } from "@/components/charts/charts";
import { SectionCard } from "@/components/common/section-card";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeePhoto } from "@/components/hr/employee-photo";
import { useHrInsights } from "@/hooks/useHrInsights";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import { cn } from "@/utils/cn";

interface Person { employee: string; employee_name: string; department?: string; designation?: string; image?: string; net: number; gross?: number; paid?: number; working?: number }
interface Change extends Person { prev_net: number; change: number; pct: number; prev_paid: number }
interface Insights {
  run: { name: string; status: string; docstatus: number; start_date: string; end_date: string; branch?: string; department?: string; designation?: string; currency?: string; payment_account?: string };
  totals: { slips: number; submitted: number; draft: number; employees_in_run: number; gross: number; deductions: number; net: number; payment_days: number; working_days: number; absent: number; lwp: number; income_tax: number; pay_lost: number };
  median_net: number;
  previous: { from: string; to: string; employees: number; gross: number; net: number; deductions: number } | null;
  bridge: { previous: number; leavers: number; joiners: number; existing: number; current: number } | null;
  joined: Person[];
  joined_count: number;
  left: Person[];
  left_count: number;
  biggest_drops: Change[];
  biggest_rises: Change[];
  by_department: { department: string; slips: number; gross: number; net: number; paid: number; working: number; prev_net: number | null }[];
  earnings: { component: string; amount: number; slips: number; lost: number }[];
  deductions: { component: string; amount: number; slips: number; is_income_tax: number }[];
  bands: { band: string; slips: number }[];
  top_earners: Person[];
  pay_modes: Record<string, number>;
  issues: {
    missing_slips: Person[]; missing_count: number; zero_net: { name: string; employee: string; employee_name: string; net_pay: number }[];
    no_payment_days: { name: string; employee: string; employee_name: string }[]; no_bank_account: Person[]; no_bank_count: number;
    no_salary_mode: Person[]; no_salary_mode_count: number; not_active: (Person & { status: string })[]; not_active_count: number; withheld: string[];
  };
  accounting: { accrual: { name: string; voucher_type: string; posting_date: string; total_debit: number; docstatus: number }[]; bank_entries: { name: string; posting_date: string; total_debit: number; docstatus: number }[] };
}

const strip = (d?: string) => (d ? d.replace(/ - [A-Z0-9]{2,6}$/, "").replace(/\s{2,}/g, " ") : "Not set");
const pct = (now: number, before?: number | null) => (before ? ((now - before) / before) * 100 : null);

function Trend({ now, before, invert, label = "vs previous" }: { now: number; before?: number | null; invert?: boolean; label?: string }) {
  const p = pct(now, before);
  if (p === null) return <span className="text-muted-foreground">no previous period</span>;
  const good = invert ? p <= 0 : p >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-emerald-600" : "text-rose-600")}>
      {p >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(p).toFixed(1)}% {label}
    </span>
  );
}

/** Net-pay bridge: last period's total → leavers out → joiners in → change for everyone paid both times → this run. */
function Bridge({ b, cur }: { b: NonNullable<Insights["bridge"]>; cur?: string }) {
  const steps = [
    { label: "Previous period", value: b.previous, kind: "total" as const },
    { label: "Leavers", value: b.leavers, kind: "delta" as const },
    { label: "Joiners", value: b.joiners, kind: "delta" as const },
    { label: "Existing staff", value: b.existing, kind: "delta" as const },
    { label: "This run", value: b.current, kind: "total" as const },
  ];
  let running = 0;
  const bars = steps.map((s) => {
    const from = s.kind === "total" ? 0 : running;
    const to = s.kind === "total" ? s.value : running + s.value;
    running = s.kind === "total" ? s.value : to;
    return { ...s, lo: Math.min(from, to), hi: Math.max(from, to) };
  });
  const max = Math.max(...bars.map((x) => x.hi), 1);
  const min = Math.min(0, ...bars.map((x) => x.lo));
  // Zoom on the top of the range so the deltas are visible next to two big totals.
  const floor = Math.max(min, Math.min(...bars.map((x) => (x.kind === "total" ? x.hi : x.lo))) * 0.9);
  const span = max - floor || 1;
  const pos = (v: number) => ((Math.max(v, floor) - floor) / span) * 100;
  return (
    <div className="space-y-2.5">
      {bars.map((x) => (
        <div key={x.label} className="grid grid-cols-[110px_1fr_110px] items-center gap-3 text-sm">
          <span className="truncate text-muted-foreground">{x.label}</span>
          <div className="relative h-6 rounded bg-muted/40">
            <span
              className={cn(
                "absolute inset-y-0.5 rounded",
                x.kind === "total" ? "bg-primary/70" : x.value >= 0 ? "bg-emerald-500" : "bg-rose-500",
              )}
              style={{ left: `${pos(x.lo)}%`, width: `${Math.max(0.8, pos(x.hi) - pos(x.lo))}%` }}
            />
          </div>
          <span className={cn("text-right font-semibold tabular-nums", x.kind === "delta" && (x.value >= 0 ? "text-emerald-600" : "text-rose-600"))}>
            {x.kind === "delta" && x.value >= 0 ? "+" : ""}
            {formatMoney(x.value, cur, { compact: true })}
          </span>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">Bars are zoomed to the top of the range so the changes show next to the totals.</p>
    </div>
  );
}

function PersonLine({ p, right }: { p: Person; right: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 py-2">
      <EmployeePhoto name={p.employee_name || p.employee} src={p.image} size="sm" editable={false} className="ring-0" />
      <div className="min-w-0 flex-1">
        <Link to={`/hr/employees/${encodeURIComponent(p.employee)}`} className="block truncate text-sm font-medium hover:text-primary hover:underline">{p.employee_name || p.employee}</Link>
        <p className="truncate text-xs text-muted-foreground">{[p.designation, strip(p.department)].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="shrink-0 text-right text-xs">{right}</div>
    </li>
  );
}

type PeopleTab = "rises" | "drops" | "joined" | "left" | "top";

/** Analysis of one payroll run, shown on the Payroll Entry page under the run checklist. */
export function PayrollRunInsights({ name }: { name: string }) {
  const { data: d, isLoading, error } = useHrInsights<Insights>("payroll_run_insights", { name });
  const [tab, setTab] = useState<PeopleTab>("drops");
  if (error) return <Card className="p-4 text-sm text-destructive">Could not analyse run {name}.</Card>;
  if (isLoading || !d) return <Skeleton className="h-72 w-full" />;
  if (!d.totals.slips) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">No salary slips in this run yet — the analysis appears once slips are created.</Card>;
  }

  const t = d.totals;
  const cur = d.run.currency;
  const paidShare = t.working_days ? (t.payment_days / t.working_days) * 100 : null;
  const scope = [d.run.branch, d.run.department && strip(d.run.department), d.run.designation].filter(Boolean).join(" · ") || "All employees";
  const issues = [
    { key: "not_active", n: d.issues.not_active_count, label: "paid but no longer Active", tone: "bad", list: d.issues.not_active.map((p) => ({ ...p, hint: p.status })) },
    { key: "zero", n: d.issues.zero_net.length, label: "slips with zero or negative net pay", tone: "bad", list: d.issues.zero_net.map((p) => ({ ...p, hint: formatMoney(p.net_pay, cur), slip: p.name })) },
    { key: "nodays", n: d.issues.no_payment_days.length, label: "slips with no paid days", tone: "warn", list: d.issues.no_payment_days.map((p) => ({ ...p, slip: p.name })) },
    { key: "missing", n: d.issues.missing_count, label: "employees in the run without a slip", tone: "bad", list: d.issues.missing_slips },
    { key: "nobank", n: d.issues.no_bank_count, label: "paid by bank but no account number", tone: "bad", list: d.issues.no_bank_account },
    { key: "nomode", n: d.issues.no_salary_mode_count, label: "employees with no salary mode (bank / cash)", tone: "warn", list: d.issues.no_salary_mode },
    { key: "withheld", n: d.issues.withheld.length, label: "salaries withheld", tone: "info", list: [] },
  ].filter((x) => x.n > 0);
  return <RunInsightsBody d={d} t={t} cur={cur} paidShare={paidShare} scope={scope} issues={issues} tab={tab} setTab={setTab} />;
}

function RunInsightsBody({
  d, t, cur, paidShare, scope, issues, tab, setTab,
}: {
  d: Insights; t: Insights["totals"]; cur?: string; paidShare: number | null; scope: string;
  issues: { key: string; n: number; label: string; tone: string; list: { employee: string; employee_name: string; hint?: string; slip?: string }[] }[];
  tab: PeopleTab; setTab: (t: PeopleTab) => void;
}) {
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const accrual = d.accounting.accrual[0];
  const bank = d.accounting.bank_entries[0];
  const modes = Object.entries(d.pay_modes).map(([label, value]) => ({ label, value }));
  const people: Record<PeopleTab, { title: string; rows: (Person & Partial<Change>)[]; right: (p: Person & Partial<Change>) => React.ReactNode }> = {
    drops: { title: `Biggest drops`, rows: d.biggest_drops, right: (p) => <><b className="text-rose-600">{formatMoney(p.change ?? 0, cur, { compact: true })}</b><br /><span className="text-muted-foreground">{p.prev_paid} → {p.paid} paid days</span></> },
    rises: { title: `Biggest rises`, rows: d.biggest_rises, right: (p) => <><b className="text-emerald-600">+{formatMoney(p.change ?? 0, cur, { compact: true })}</b><br /><span className="text-muted-foreground">{p.prev_paid} → {p.paid} paid days</span></> },
    joined: { title: `Joined (${d.joined_count})`, rows: d.joined, right: (p) => <b>{formatMoney(p.net, cur, { compact: true })}</b> },
    left: { title: `Dropped out (${d.left_count})`, rows: d.left, right: (p) => <span className="text-muted-foreground">was {formatMoney(p.net, cur, { compact: true })}</span> },
    top: { title: "Highest paid", rows: d.top_earners, right: (p) => <b>{formatMoney(p.net, cur, { compact: true })}</b> },
  };

  return (
    <div className="space-y-4">
      {/* Hero */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-indigo-500/10" />
        <div className="relative space-y-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">This run · {formatDate(d.run.start_date)} – {formatDate(d.run.end_date)}</h3>
            <span className="text-xs text-muted-foreground">{scope}{d.previous ? ` · compared with ${formatDate(d.previous.from)} – ${formatDate(d.previous.to)}, same scope` : ""}</span>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Net pay</p>
              <p className="text-3xl font-bold tabular-nums">{formatMoney(t.net, cur, { compact: true })}</p>
              <p className="text-xs"><Trend now={t.net} before={d.previous?.net} /></p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gross pay</p>
              <p className="text-2xl font-bold tabular-nums">{formatMoney(t.gross, cur, { compact: true })}</p>
              <p className="text-xs"><Trend now={t.gross} before={d.previous?.gross} /></p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Deductions</p>
              <p className="text-2xl font-bold tabular-nums">{formatMoney(t.deductions, cur, { compact: true })}</p>
              <p className="text-xs text-muted-foreground">{t.gross ? `${((t.deductions / t.gross) * 100).toFixed(1)}% of gross` : ""}{t.income_tax ? ` · tax ${formatMoney(t.income_tax, cur, { compact: true })}` : ""}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Employees paid</p>
              <p className="text-2xl font-bold tabular-nums">{t.slips.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                {d.previous ? <><span className="text-emerald-600">+{d.joined_count}</span> joined · <span className="text-rose-600">−{d.left_count}</span> left</> : `${t.employees_in_run} in the run`}
              </p>
            </div>
          </div>
          <div className="grid gap-3 border-t border-border/60 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Median net", formatMoney(d.median_net, cur), "half earn less"],
              ["Average net", t.slips ? formatMoney(t.net / t.slips, cur) : "—", "per slip"],
              ["Paid days", paidShare !== null ? `${paidShare.toFixed(1)}%` : "—", `${t.payment_days.toLocaleString()} of ${t.working_days.toLocaleString()} working days`],
              ["Absent / unpaid leave", `${t.absent.toLocaleString()} / ${t.lwp.toLocaleString()} d`, t.pay_lost ? `${formatMoney(t.pay_lost, cur, { compact: true })} not paid` : "days not paid"],
            ].map(([k, v, h]) => (
              <div key={k}>
                <p className="text-[11px] text-muted-foreground">{k}</p>
                <p className="font-semibold tabular-nums">{v}</p>
                <p className="text-[11px] text-muted-foreground">{h}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Before you pay */}
        <SectionCard title="Before you pay" description={issues.length ? `${issues.length} thing${issues.length === 1 ? "" : "s"} to check` : "Nothing to fix"}>
          <ul className="space-y-2">
            {issues.map((x) => (
              <li key={x.key}>
                <button
                  type="button"
                  onClick={() => setOpenIssue(openIssue === x.key ? null : x.key)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                    x.tone === "bad" ? "border-rose-500/30 bg-rose-500/5" : x.tone === "warn" ? "border-amber-500/30 bg-amber-500/5" : "border-sky-500/30 bg-sky-500/5",
                  )}
                >
                  <AlertTriangle className={cn("h-4 w-4 shrink-0", x.tone === "bad" ? "text-rose-500" : x.tone === "warn" ? "text-amber-500" : "text-sky-500")} />
                  <span className="min-w-0 flex-1"><b className="tabular-nums">{x.n}</b> {x.label}</span>
                </button>
                {openIssue === x.key && !!x.list.length && (
                  <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto pl-8 text-xs">
                    {x.list.map((p, i) => (
                      <li key={`${p.employee}-${i}`} className="flex justify-between gap-2">
                        {p.slip ? (
                          <Link to={`/payroll/salary-slips/${encodeURIComponent(p.slip)}`} className="truncate hover:text-primary hover:underline">{p.employee_name || p.employee}</Link>
                        ) : (
                          <Link to={`/hr/employees/${encodeURIComponent(p.employee)}`} className="truncate hover:text-primary hover:underline">{p.employee_name || p.employee}</Link>
                        )}
                        {p.hint && <span className="shrink-0 text-muted-foreground">{p.hint}</span>}
                      </li>
                    ))}
                    {x.n > x.list.length && <li className="text-muted-foreground">…and {x.n - x.list.length} more</li>}
                  </ul>
                )}
              </li>
            ))}
            {!issues.length && (
              <li className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Every slip looks ready to pay.
              </li>
            )}
          </ul>
          <div className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground">Accounting</p>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5"><BookCheck className={cn("h-4 w-4", accrual ? "text-emerald-500" : "text-muted-foreground")} /> Payroll accrual</span>
              {accrual ? <Link to={`/accounting/journal-entries/${encodeURIComponent(accrual.name)}`} className="text-xs text-primary hover:underline">{accrual.name}</Link> : <span className="text-xs text-muted-foreground">on submitting slips</span>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5"><Landmark className={cn("h-4 w-4", bank ? "text-emerald-500" : "text-amber-500")} /> Bank payment</span>
              {bank ? <Link to={`/accounting/journal-entries/${encodeURIComponent(bank.name)}`} className="text-xs text-primary hover:underline">{bank.name}</Link> : <span className="text-xs text-amber-600">not made yet</span>}
            </div>
          </div>
        </SectionCard>

        {/* Bridge */}
        <SectionCard title="Why net pay changed" description={d.previous ? "From the previous period's total to this run" : "No previous period in the same scope to compare with"} className="lg:col-span-2">
          {d.bridge ? <Bridge b={d.bridge} cur={cur} /> : <p className="py-10 text-center text-sm text-muted-foreground">This is the first run for this scope.</p>}
        </SectionCard>
      </div>

      {/* Departments */}
      <SectionCard title="By department" description="Net pay against the previous period, and how many working days were paid">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Department</th>
                <th className="py-2 pr-3 text-right font-medium">Slips</th>
                <th className="py-2 pr-3 text-right font-medium">Gross</th>
                <th className="py-2 pr-3 text-right font-medium">Net</th>
                <th className="py-2 pr-3 text-right font-medium">vs previous</th>
                <th className="py-2 pr-3 font-medium">Paid days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.by_department.map((r) => {
                const share = r.working ? (r.paid / r.working) * 100 : 0;
                const ch = pct(r.net, r.prev_net);
                return (
                  <tr key={r.department || "none"} className="hover:bg-accent/30">
                    <td className="py-2 pr-3 font-medium">{strip(r.department)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.slips}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(r.gross, cur, { compact: true })}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{formatMoney(r.net, cur, { compact: true })}</td>
                    <td className={cn("py-2 pr-3 text-right text-xs tabular-nums", ch === null ? "text-muted-foreground" : ch >= 0 ? "text-emerald-600" : "text-rose-600")}>
                      {ch === null ? "new" : <span className="inline-flex items-center gap-0.5">{ch >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(ch).toFixed(1)}%</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full rounded-full", share >= 90 ? "bg-emerald-500" : share >= 75 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${share}%` }} /></span>
                        <span className="text-xs tabular-nums text-muted-foreground">{share.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Earnings" description="Paid in this run, by component">
          <ComponentBars rows={d.earnings.map((r) => ({ label: r.component, value: r.amount, hint: `${r.slips} slips${r.lost ? ` · ${formatMoney(r.lost, cur, { compact: true })} lost to unpaid days` : ""}` }))} cur={cur} tone="bg-emerald-500" />
        </SectionCard>
        <SectionCard title="Deductions" description="Taken out in this run, by component">
          <ComponentBars rows={d.deductions.map((r) => ({ label: r.component + (r.is_income_tax ? " · tax" : ""), value: r.amount, hint: `${r.slips} slips` }))} cur={cur} tone="bg-rose-500" />
        </SectionCard>
        <div className="space-y-4">
          <ChartCard title="Net pay bands" subtitle="Slips per band">
            <BarChart data={d.bands} xKey="band" height={170} series={[{ key: "slips", label: "Slips", color: "hsl(199 89% 48%)" }]} />
          </ChartCard>
          <ChartCard title="How they're paid" subtitle="Employees by salary mode">
            {modes.length ? <DonutChart data={modes} height={170} innerRadius="58%" /> : <p className="py-8 text-center text-sm text-muted-foreground">—</p>}
          </ChartCard>
        </div>
      </div>

      {/* People */}
      <SectionCard title="People in this run" description="Who moved most, who joined, who dropped out, and the highest paid">
        <div className="mb-3 flex flex-wrap gap-1">
          {(Object.keys(people) as PeopleTab[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", tab === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}
            >
              {k === "drops" ? <TrendingDown className="h-3.5 w-3.5" /> : k === "rises" ? <TrendingUp className="h-3.5 w-3.5" /> : k === "joined" ? <UserPlus className="h-3.5 w-3.5" /> : k === "left" ? <UserMinus className="h-3.5 w-3.5" /> : <Wallet className="h-3.5 w-3.5" />}
              {people[k].title}
            </button>
          ))}
        </div>
        <ul className="grid divide-y divide-border md:grid-cols-2 md:gap-x-6 md:divide-y-0">
          {people[tab].rows.map((p) => <PersonLine key={p.employee} p={p} right={people[tab].right(p)} />)}
          {!people[tab].rows.length && <li className="py-6 text-center text-sm text-muted-foreground md:col-span-2">Nobody here.</li>}
        </ul>
        {(tab === "joined" && d.joined_count > d.joined.length) || (tab === "left" && d.left_count > d.left.length) ? (
          <p className="mt-2 text-xs text-muted-foreground"><Users2 className="mr-1 inline h-3 w-3" />Showing the first 20.</p>
        ) : null}
        {tab === "drops" && !!d.biggest_drops.length && (
          <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Scale className="h-3 w-3" /> Compare paid days before and after — most drops come from absence, not pay changes.</p>
        )}
      </SectionCard>
    </div>
  );
}

function ComponentBars({ rows, cur, tone }: { rows: { label: string; value: number; hint?: string }[]; cur?: string; tone: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">None.</p>;
  return (
    <ul className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
      {rows.map((r) => (
        <li key={r.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{formatMoney(r.value, cur, { compact: true })}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", tone)} style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} /></div>
          {r.hint && <p className="text-[11px] text-muted-foreground">{r.hint}</p>}
        </li>
      ))}
    </ul>
  );
}
