import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Banknote, CalendarRange, Coins, FileSignature, FileSpreadsheet, FileWarning, Percent,
  PlayCircle, PlusCircle, Hourglass, Award, ShieldCheck, ListChecks, Receipt, Sliders, TrendingDown, TrendingUp, Users2, Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ChartCard } from "@/components/charts/chart-card";
import { ComboChart } from "@/components/charts/charts";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { KpiGrid, BarList } from "@/components/doc/dashboard-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAggregate, useDocList, useGroupCounts, count, sum } from "@/hooks/useDoc";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { formatMoney, compactNumber } from "@/utils/currency";
import { formatDate, fiscalYearRange } from "@/utils/dates";
import { asNumber, cn } from "@/utils/cn";
import { entryStatus } from "./payroll-configs";
import { WorkspaceIcons } from "@/components/layout/workspace-icons";

/** "2026-02" → "2026-03-01" (exclusive upper bound for a month). */
const nextMonthStart = (key?: string) => {
  if (!key) return "9999-12-31";
  const [y, mo] = key.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
};

const strip = (d?: string) => (d ? d.replace(/ - [A-Z0-9]{2,6}$/, "") : "Not set");

const SETUP_LINKS = [
  { label: "Salary Components", to: "/payroll/salary-components", icon: Coins, doctype: "Salary Component" },
  { label: "Salary Structures", to: "/payroll/salary-structures", icon: FileSpreadsheet, doctype: "Salary Structure" },
  { label: "Structure Assignments", to: "/payroll/salary-structure-assignments", icon: FileSignature, doctype: "Salary Structure Assignment" },
  { label: "Additional Salary", to: "/payroll/additional-salary", icon: PlusCircle, doctype: "Additional Salary" },
  { label: "Payroll Periods", to: "/payroll/periods", icon: CalendarRange, doctype: "Payroll Period" },
  { label: "Income Tax Slabs", to: "/payroll/income-tax-slabs", icon: Percent, doctype: "Income Tax Slab" },
  { label: "Overtime Types", to: "/payroll/overtime-types", icon: Hourglass, doctype: "Overtime Type" },
  { label: "Gratuity Rules", to: "/payroll/gratuity-rules", icon: Award, doctype: "Gratuity Rule" },
  { label: "Tax Declarations", to: "/payroll/tax-declarations", icon: ShieldCheck, doctype: "Employee Tax Exemption Declaration" },
  { label: "Setup checklist", to: "/hr/setup", icon: ListChecks, doctype: "" },
  { label: "Payroll Settings", to: "/payroll/settings", icon: Sliders, doctype: "" },
];

function Delta({ now, prev, invert }: { now: number; prev: number; invert?: boolean }) {
  if (!prev) return null;
  const pct = ((now - prev) / prev) * 100;
  const up = pct >= 0;
  const good = invert ? !up : up;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good ? "text-emerald-600" : "text-rose-600")}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}% vs prev. month
    </span>
  );
}

/** Payroll landing page: the latest run, cost trend, who is not set up for payroll, and the path to the next run. */
export default function PayrollHomePage() {
  const { company, companyCurrency } = useCompanyContext();
  const currency = companyCurrency ?? "PKR";
  const co = useMemo(() => companyFilter(company), [company]);
  const fy = fiscalYearRange();

  // Submitted slips, last ~13 months, grouped by period start.
  const since = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - 12, 1).toISOString().slice(0, 10);
  }, []);
  const { data: byMonth } = useAggregate("Salary Slip", {
    fields: ["start_date", sum("base_gross_pay", "gross"), sum("base_net_pay", "net"), sum("base_total_deduction", "ded"), count("name", "n")],
    filters: [...co, ["docstatus", "=", 1], ["start_date", ">=", since]],
    groupBy: "start_date",
    orderBy: { field: "start_date", order: "asc" },
  });
  const { data: ytd } = useAggregate("Salary Slip", {
    fields: [sum("base_gross_pay", "gross"), sum("base_net_pay", "net")],
    filters: [...co, ["docstatus", "=", 1], ["start_date", ">=", fy.from], ["start_date", "<=", fy.to]],
  });
  const { counts: slipStates } = useGroupCounts("Salary Slip", "docstatus", co);
  const { data: entries } = useDocList("Payroll Entry", {
    fields: ["name", "start_date", "end_date", "payroll_frequency", "number_of_employees", "status", "docstatus", "branch", "department"],
    filters: [...co, ["docstatus", "<", 2]],
    orderBy: { field: "posting_date", order: "desc" },
    limit: 6,
  });
  const { data: active } = useDocList("Employee", { fields: ["name", "employee_name", "department", "designation"], filters: [...co, ["status", "=", "Active"]], limit: 10000 });
  const { data: assigned } = useDocList("Salary Structure Assignment", { fields: ["employee"], filters: [...co, ["docstatus", "=", 1]], limit: 20000 });
  const { data: setupCounts } = useAggregate("Salary Structure", { fields: [count("name", "n")], filters: [...co, ["docstatus", "=", 1], ["is_active", "=", "Yes"]] });

  const m = useMemo(() => {
    const buckets = new Map<string, { gross: number; net: number; ded: number; n: number }>();
    (byMonth ?? []).forEach((r) => {
      const k = String(r.start_date).slice(0, 7);
      const b = buckets.get(k) ?? { gross: 0, net: 0, ded: 0, n: 0 };
      b.gross += asNumber(r.gross);
      b.net += asNumber(r.net);
      b.ded += asNumber(r.ded);
      b.n += asNumber(r.n);
      buckets.set(k, b);
    });
    const rows = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => {
      const [y, mo] = k.split("-").map(Number);
      return { key: k, month: new Date(y, mo - 1, 1).toLocaleString(undefined, { month: "short", year: "2-digit" }), ...v };
    });
    return { rows, last: rows[rows.length - 1], prev: rows[rows.length - 2] };
  }, [byMonth]);

  // Department split for the latest payroll month.
  const { data: deptLatest } = useAggregate("Salary Slip", {
    fields: ["department", sum("base_gross_pay", "gross"), count("name", "n")],
    filters: [...co, ["docstatus", "=", 1], ["start_date", ">=", `${m.last?.key ?? "9999-12"}-01`], ["start_date", "<", nextMonthStart(m.last?.key)]],
    groupBy: "department",
    enabled: Boolean(m.last),
  });

  const covered = new Set((assigned ?? []).map((a) => a.employee));
  const notCovered = (active ?? []).filter((e) => !covered.has(e.name));
  const last = m.last;
  const draftSlips = slipStates["0"] ?? 0;
  const hasStructures = asNumber(setupCounts?.[0]?.n) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        subtitle={last ? `Latest payroll: ${last.month} · ${last.n} salary slips` : "Set up salary structures, then run your first payroll"}
        icon={<Banknote className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/payroll/salary-slips">
              <Button variant="outline" size="sm"><Receipt className="h-4 w-4" /> Salary slips</Button>
            </Link>
            <Link to="/payroll/entries/new">
              <Button variant="primary" size="sm"><PlayCircle className="h-4 w-4" /> Run payroll</Button>
            </Link>
          </div>
        }
      />

      <WorkspaceIcons segment="payroll" title="Payroll workspace" />

      {/* Hero: latest month */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-sky-500/10" />
        <div className="relative grid gap-6 p-6 md:grid-cols-4">
          <div className="md:col-span-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Net pay · {last?.month ?? "—"}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{last ? formatMoney(last.net, currency, { compact: true }) : "—"}</p>
            {last && m.prev && <Delta now={last.net} prev={m.prev.net} />}
          </div>
          {[
            { k: "Gross pay", v: last ? formatMoney(last.gross, currency, { compact: true }) : "—", d: last && m.prev ? <Delta now={last.gross} prev={m.prev.gross} /> : null },
            { k: "Deductions", v: last ? formatMoney(last.ded, currency, { compact: true }) : "—", d: last?.gross ? <span className="text-xs text-muted-foreground">{((last.ded / last.gross) * 100).toFixed(1)}% of gross</span> : null },
            { k: "Average net / employee", v: last?.n ? formatMoney(last.net / last.n, currency, { compact: true }) : "—", d: last ? <span className="text-xs text-muted-foreground">{last.n} employees paid</span> : null },
          ].map((x) => (
            <div key={x.k} className="border-t border-border/60 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{x.k}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{x.v}</p>
              {x.d}
            </div>
          ))}
        </div>
      </Card>

      <KpiGrid
        className="xl:grid-cols-4"
        items={[
          { label: "Gross pay, fiscal YTD", value: compactNumber(asNumber(ytd?.[0]?.gross)), icon: <Coins className="h-4 w-4" />, tone: "indigo", valueSuffix: currency },
          { label: "Net pay, fiscal YTD", value: compactNumber(asNumber(ytd?.[0]?.net)), icon: <Wallet className="h-4 w-4" />, tone: "emerald", valueSuffix: currency },
          { label: "Draft salary slips", value: draftSlips, icon: <FileWarning className="h-4 w-4" />, tone: draftSlips ? "amber" : "slate" },
          { label: "Active without salary structure", value: notCovered.length, icon: <AlertTriangle className="h-4 w-4" />, tone: notCovered.length ? "rose" : "emerald", valueSuffix: active ? `of ${active.length}` : undefined },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Payroll cost trend" subtitle="Gross and net pay per month, with employees paid" className="lg:col-span-2">
          {m.rows.length ? (
            <ComboChart
              data={m.rows}
              xKey="month"
              money
              currency={currency}
              legend
              dualAxis
              height={290}
              series={[
                { key: "gross", label: "Gross" },
                { key: "net", label: "Net", color: "hsl(160 84% 39%)" },
                { key: "n", label: "Employees", type: "line", axis: "right", format: "number", color: "hsl(35 92% 50%)" },
              ]}
            />
          ) : (
            <p className="py-20 text-center text-sm text-muted-foreground">No submitted salary slips yet — run payroll to see the trend.</p>
          )}
        </ChartCard>
        <SectionCard title="Cost by department" description={last ? `Gross pay, ${last.month}` : "After your first payroll"}>
          <BarList
            rows={[...(deptLatest ?? [])]
              .sort((a, b) => asNumber(b.gross) - asNumber(a.gross))
              .slice(0, 8)
              .map((r) => ({ label: strip(r.department), value: asNumber(r.gross), hint: `${asNumber(r.n)} employees` }))}
            format={(v) => formatMoney(v, currency, { compact: true })}
            tone="bg-indigo-500"
            empty="No payroll processed yet."
          />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Recent payroll runs"
          actions={<Link to="/payroll/entries" className="text-xs font-medium text-primary hover:underline">All runs</Link>}
          className="lg:col-span-2"
        >
          <ul className="divide-y divide-border">
            {(entries ?? []).map((e) => (
              <li key={e.name}>
                <Link to={`/payroll/entries/${encodeURIComponent(e.name)}`} className="group flex items-center gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                    <PlayCircle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium group-hover:text-primary">
                      {formatDate(e.start_date)} – {formatDate(e.end_date)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {e.name} · {e.payroll_frequency || "—"} · {asNumber(e.number_of_employees)} employees{e.branch ? ` · ${e.branch}` : ""}{e.department ? ` · ${strip(e.department)}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={entryStatus(e)} />
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
            {!(entries ?? []).length && (
              <li className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
                No payroll runs yet.
                <Link to="/payroll/entries/new"><Button size="sm" variant="primary"><PlayCircle className="h-4 w-4" /> Start the first run</Button></Link>
              </li>
            )}
          </ul>
        </SectionCard>

        <SectionCard
          title="Not on payroll"
          description="Active employees with no submitted salary structure assignment — they will be skipped by a payroll run"
          actions={notCovered.length ? <Link to="/payroll/salary-structure-assignments" className="text-xs font-medium text-primary hover:underline">Assign</Link> : undefined}
        >
          <ul className="max-h-72 divide-y divide-border overflow-y-auto">
            {notCovered.slice(0, 50).map((e) => (
              <li key={e.name} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <Link to={`/hr/employees/${encodeURIComponent(e.name)}`} className="block truncate text-sm font-medium hover:text-primary hover:underline">{e.employee_name || e.name}</Link>
                  <p className="truncate text-xs text-muted-foreground">{[e.designation, strip(e.department)].filter(Boolean).join(" · ")}</p>
                </div>
                <Link to={`/payroll/salary-structure-assignments?employee=${encodeURIComponent(e.name)}`} className="shrink-0 text-xs text-primary hover:underline">Assign</Link>
              </li>
            ))}
            {!notCovered.length && (
              <li className="flex flex-col items-center gap-1 py-8 text-center text-sm text-muted-foreground">
                <Users2 className="h-5 w-5 text-emerald-500" /> Every active employee has a salary structure.
              </li>
            )}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Payroll setup" description={hasStructures ? "Masters behind every payroll run" : "Start here: components → structures → assign them to employees → run payroll"}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11">
          {SETUP_LINKS.map((q, i) => (
            <Link key={q.to} to={q.to} className="group relative flex flex-col items-center gap-2 rounded-lg border border-transparent p-3 text-center transition-colors hover:border-border hover:bg-accent/50">
              {!hasStructures && i < 3 && <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{i + 1}</span>}
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 transition-transform group-hover:scale-110 dark:text-emerald-400">
                <q.icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-medium">{q.label}</span>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
