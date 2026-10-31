import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Banknote, CalendarX2, Coins, Landmark, ExternalLink, FileWarning, PlayCircle, TrendingDown, TrendingUp, Users2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ChartCard } from "@/components/charts/chart-card";
import { BarChart, ComboChart, DonutChart } from "@/components/charts/charts";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { KpiGrid, BarList } from "@/components/doc/dashboard-kit";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmployeePhoto } from "@/components/hr/employee-photo";
import { HrFilterBar, usePeriod, useHrDimensions } from "@/components/hr/period-filter";
import { useHrInsights, useDebounced } from "@/hooks/useHrInsights";
import { useDocList } from "@/hooks/useDoc";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { formatMoney, compactNumber } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import { asNumber, cn } from "@/utils/cn";

interface Overview {
  totals: { slips: number; employees: number; gross: number; deductions: number; net: number; payment_days: number; working_days: number; lwp: number; absent: number; pay_lost: number; income_tax: number; taxed_slips: number };
  previous: { slips: number; gross: number; net: number; deductions: number; from: string; to: string };
  status: Record<string, { count: number; net: number }>;
  by_department: { department: string; n: number; gross: number; net: number; avg_net: number }[];
  bands: { band: string; slips: number }[];
  earnings: { component: string; amount: number; slips: number }[];
  deductions: { component: string; amount: number; slips: number }[];
  top_earners: { employee: string; employee_name: string; department: string; designation?: string; image?: string; net: number; gross: number; slips: number }[];
  trend: { month: string; gross: number; net: number; ded: number; n: number }[];
}
interface Rec {
  name: string; employee: string; employee_name: string; department?: string; designation?: string; image?: string; start_date: string; end_date: string;
  status: string; docstatus: number; currency?: string; gross_pay: number; total_deduction: number; net_pay: number; payment_days: number;
  total_working_days: number; leave_without_pay: number; absent_days: number; payroll_entry?: string;
}

const STATUSES = ["Draft", "Submitted", "Withheld", "Cancelled"];
const strip = (d?: string) => (d ? d.replace(/ - [A-Z0-9]{2,6}$/, "").replace(/\s{2,}/g, " ") : "Not set");
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleString(undefined, { month: "short", year: "2-digit" });
};

function Change({ now, before, invert }: { now: number; before: number; invert?: boolean }) {
  if (!before) return <span className="text-muted-foreground">no earlier period</span>;
  const pct = ((now - before) / before) * 100;
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-emerald-600" : "text-rose-600")}>
      {pct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}% vs previous
    </span>
  );
}

export default function SalarySlipsPage() {
  const { company, companyCurrency } = useCompanyContext();
  const currency = companyCurrency ?? "PKR";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const employee = params.get("employee");
  const payrollEntry = params.get("payroll_entry");
  const period = usePeriod("month");
  const dims = useHrDimensions();
  const search = useDebounced(dims.search);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "net_pay", dir: "desc" });

  // Open on the latest payroll month that has slips (not necessarily this calendar month).
  const { data: latest } = useDocList("Salary Slip", {
    fields: ["start_date"],
    filters: [...companyFilter(company), ["docstatus", "<", 2], ...(employee ? [["employee", "=", employee]] : []), ...(payrollEntry ? [["payroll_entry", "=", payrollEntry]] : [])],
    orderBy: { field: "start_date", order: "desc" },
    limit: 1,
  });
  const jumped = useRef(false);
  useEffect(() => {
    const d = latest?.[0]?.start_date as string | undefined;
    if (!jumped.current && d) {
      jumped.current = true;
      if (employee) period.setRange(`${d.slice(0, 4)}-01-01`, `${d.slice(0, 4)}-12-31`);
      else period.setMonth(d.slice(0, 7));
    }
  }, [latest, employee, period]);

  const filters = { from_date: period.from, to_date: period.to, company, department: dims.department, branch: dims.branch, employee, search, payroll_entry: payrollEntry };
  const { data: ov, isLoading: ovLoading } = useHrInsights<Overview>("salary_slips_overview", filters);
  const { data: recs, isLoading, error, mutate } = useHrInsights<{ rows: Rec[]; total: number }>("salary_slip_records", {
    ...filters, status, start: page * pageSize, page_length: pageSize, sort_by: sort.key, sort_order: sort.dir,
  });
  const filterKey = JSON.stringify({ ...filters, status });
  const [lastKey, setLastKey] = useState(filterKey);
  if (filterKey !== lastKey) {
    setLastKey(filterKey);
    setPage(0);
  }

  const t = ov?.totals;
  const prev = ov?.previous;
  const paidShare = t?.working_days ? (t.payment_days / t.working_days) * 100 : null;
  const draft = ov?.status["Draft"]?.count ?? 0;

  const mix = useMemo(() => {
    const top = (rows: { component: string; amount: number }[], n: number) => {
      const head = rows.slice(0, n).map((r) => ({ label: r.component, value: r.amount }));
      const rest = rows.slice(n).reduce((a, r) => a + r.amount, 0);
      return rest ? [...head, { label: "Other", value: rest }] : head;
    };
    return { earnings: top(ov?.earnings ?? [], 5), deductions: top(ov?.deductions ?? [], 5) };
  }, [ov]);

  const columns: ColumnDef<Rec>[] = [
    {
      key: "employee_name",
      label: "Employee",
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <EmployeePhoto name={r.employee_name || r.employee} src={r.image} size="sm" editable={false} className="ring-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{r.employee_name || r.employee}</p>
            <p className="truncate text-xs text-muted-foreground">{[r.designation, strip(r.department)].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
      ),
    },
    { key: "start_date", label: "Period", sortable: true, render: (r) => <span className="text-sm">{formatDate(r.start_date, { month: "short", year: "numeric", day: undefined })}</span> },
    {
      key: "payment_days",
      label: "Paid days",
      sortable: true,
      align: "right",
      getValue: (r) => asNumber(r.payment_days),
      render: (r) => {
        const share = r.total_working_days ? asNumber(r.payment_days) / asNumber(r.total_working_days) : 1;
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-sm tabular-nums">{asNumber(r.payment_days)} / {asNumber(r.total_working_days)}</span>
            <span className="h-1 w-14 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full rounded-full", share >= 0.9 ? "bg-emerald-500" : share >= 0.7 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${share * 100}%` }} /></span>
          </div>
        );
      },
    },
    { key: "gross_pay", label: "Gross", sortable: true, align: "right", getValue: (r) => asNumber(r.gross_pay), render: (r) => <span className="text-sm tabular-nums">{formatMoney(r.gross_pay, r.currency)}</span> },
    { key: "total_deduction", label: "Deductions", align: "right", getValue: (r) => asNumber(r.total_deduction), render: (r) => <span className="text-sm tabular-nums text-rose-600">{asNumber(r.total_deduction) ? `− ${formatMoney(r.total_deduction, r.currency)}` : "—"}</span> },
    { key: "net_pay", label: "Net pay", sortable: true, align: "right", getValue: (r) => asNumber(r.net_pay), render: (r) => <span className="text-sm font-semibold tabular-nums">{formatMoney(r.net_pay, r.currency)}</span> },
    { key: "status", label: "Status", sortable: true, render: (r) => <StatusBadge status={r.status} /> },
  ];

  const tabs = [
    { value: "", label: "All", n: Object.values(ov?.status ?? {}).reduce((a, s) => a + s.count, 0) },
    ...STATUSES.map((x) => ({ value: x, label: x, n: ov?.status[x]?.count ?? 0 })),
  ].filter((x) => x.value === "" || x.n);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salary Slips"
        subtitle={`${period.label}${employee ? ` · ${employee}` : ""}${payrollEntry ? ` · run ${payrollEntry}` : ""} — what was paid, to whom, and why it changed`}
        icon={<Banknote className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Link to="/payroll/entries/new"><Button variant="primary" size="sm"><PlayCircle className="h-4 w-4" /> Run payroll</Button></Link>
          </div>
        }
      />

      <HrFilterBar period={period} dims={dims} company={company} />

      {/* Hero */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-sky-500/10" />
        <div className="relative grid gap-6 p-6 md:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Net pay · {period.label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{ovLoading && !ov ? "…" : formatMoney(t?.net ?? 0, currency, { compact: true })}</p>
            <div className="text-xs">{t && prev ? <Change now={t.net} before={prev.net} /> : null}</div>
          </div>
          {[
            { k: "Gross pay", v: formatMoney(t?.gross ?? 0, currency, { compact: true }), d: t && prev ? <Change now={t.gross} before={prev.gross} /> : null },
            { k: "Deductions", v: formatMoney(t?.deductions ?? 0, currency, { compact: true }), d: t?.gross ? <span className="text-muted-foreground">{((t.deductions / t.gross) * 100).toFixed(1)}% of gross</span> : null },
            { k: "Average net / slip", v: t?.slips ? formatMoney(t.net / t.slips, currency, { compact: true }) : "—", d: <span className="text-muted-foreground">{(t?.slips ?? 0).toLocaleString()} slips · {(t?.employees ?? 0).toLocaleString()} employees</span> },
          ].map((x) => (
            <div key={x.k} className="border-t border-border/60 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{x.k}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{x.v}</p>
              <div className="text-xs">{x.d}</div>
            </div>
          ))}
        </div>
      </Card>

      <KpiGrid
        className="xl:grid-cols-5"
        items={[
          { label: "Income tax deducted", value: formatMoney(t?.income_tax ?? 0, currency, { compact: true }), icon: <Landmark className="h-4 w-4" />, tone: "indigo", valueSuffix: t?.taxed_slips ? `${t.taxed_slips} slips` : undefined },
          { label: "Paid days share", value: paidShare !== null ? `${paidShare.toFixed(1)}%` : "—", icon: <Users2 className="h-4 w-4" />, tone: paidShare !== null && paidShare < 85 ? "amber" : "emerald", valueSuffix: t ? `${compactNumber(t.payment_days)} of ${compactNumber(t.working_days)}` : undefined },
          { label: "Absent / LWP days", value: `${compactNumber(t?.absent ?? 0)} / ${compactNumber(t?.lwp ?? 0)}`, icon: <CalendarX2 className="h-4 w-4" />, tone: "rose" },
          { label: "Pay lost to unpaid days", value: formatMoney(t?.pay_lost ?? 0, currency, { compact: true }), icon: <Coins className="h-4 w-4" />, tone: "amber" },
          { label: "Draft slips", value: draft, icon: <FileWarning className="h-4 w-4" />, tone: draft ? "amber" : "slate", valueSuffix: draft ? formatMoney(ov?.status["Draft"]?.net ?? 0, currency, { compact: true }) : undefined },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Last 12 months" subtitle="Gross and net pay per payroll month, with slips" className="lg:col-span-2">
          {(ov?.trend ?? []).length ? (
            <ComboChart
              data={(ov?.trend ?? []).map((r) => ({ ...r, month: monthLabel(r.month) }))}
              xKey="month"
              money
              currency={currency}
              legend
              dualAxis
              height={270}
              series={[
                { key: "gross", label: "Gross" },
                { key: "net", label: "Net", color: "hsl(160 84% 39%)" },
                { key: "n", label: "Slips", type: "line", axis: "right", format: "number", color: "hsl(35 92% 50%)" },
              ]}
            />
          ) : (
            <p className="py-20 text-center text-sm text-muted-foreground">No submitted salary slips yet.</p>
          )}
        </ChartCard>
        <ChartCard title="Net pay distribution" subtitle="Slips by net pay band">
          <BarChart data={ov?.bands ?? []} xKey="band" height={270} series={[{ key: "slips", label: "Slips", color: "hsl(199 89% 48%)" }]} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Earnings mix" subtitle="Where the gross goes">
          {mix.earnings.length ? <DonutChart data={mix.earnings} money currency={currency} height={250} innerRadius="60%" /> : <p className="py-16 text-center text-sm text-muted-foreground">—</p>}
        </ChartCard>
        <ChartCard title="Deductions mix" subtitle="What is taken out">
          {mix.deductions.length ? <DonutChart data={mix.deductions} money currency={currency} height={250} innerRadius="60%" /> : <p className="py-16 text-center text-sm text-muted-foreground">No deductions.</p>}
        </ChartCard>
        <SectionCard title="Cost by department" description="Gross pay — click to filter">
          <BarList
            rows={(ov?.by_department ?? []).slice(0, 8).map((d) => ({
              label: strip(d.department),
              value: asNumber(d.gross),
              hint: (
                <button type="button" onClick={() => d.department && dims.setDepartment(d.department)} className="hover:text-primary">
                  {d.n} slips · avg net {formatMoney(d.avg_net, currency, { compact: true })} · filter
                </button>
              ),
            }))}
            format={(v) => formatMoney(v, currency, { compact: true })}
            tone="bg-indigo-500"
            empty="No slips in this period."
          />
        </SectionCard>
      </div>

      <SectionCard title="Highest paid" description="Net pay in the period">
        <div className="grid gap-x-6 md:grid-cols-2">
          {(ov?.top_earners ?? []).map((p, i) => (
            <Link key={p.employee} to={`/hr/employees/${encodeURIComponent(p.employee)}`} className="flex items-center gap-3 border-b border-border/60 py-2.5 hover:bg-accent/30">
              <span className="w-5 text-center text-xs font-semibold text-muted-foreground">{i + 1}</span>
              <EmployeePhoto name={p.employee_name || p.employee} src={p.image} size="sm" editable={false} className="ring-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.employee_name || p.employee}</p>
                <p className="truncate text-xs text-muted-foreground">{[p.designation, strip(p.department)].filter(Boolean).join(" · ")}{p.slips > 1 ? ` · ${p.slips} slips` : ""}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(p.net, currency, { compact: true })}</span>
            </Link>
          ))}
          {!(ov?.top_earners ?? []).length && <p className="py-6 text-center text-sm text-muted-foreground md:col-span-2">No slips in this period.</p>}
        </div>
      </SectionCard>

      <Card className="p-0">
        <div className="flex flex-wrap gap-1 border-b border-border px-3 pt-3">
          {tabs.map((x) => (
            <button
              key={x.value}
              type="button"
              onClick={() => setStatus(x.value)}
              className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors", status === x.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {x.label}
              <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", x.value === "Draft" && x.n ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground")}>{(x.n ?? 0).toLocaleString()}</span>
            </button>
          ))}
        </div>
        <div className="p-3">
          <FrappeDataTable
            columns={columns}
            rows={recs?.rows ?? []}
            rowKey={(r) => r.name}
            loading={isLoading}
            error={error}
            onRetry={() => void mutate()}
            onRowClick={(r) => navigate(`/payroll/salary-slips/${encodeURIComponent(r.name)}`)}
            searchable={false}
            title="Slips"
            subtitle={`${(recs?.total ?? 0).toLocaleString()} slips · ${period.label}`}
            exportFilename={`salary-slips-${period.from}-to-${period.to}`}
            printTitle="Salary Slips"
            printSubtitle={period.label}
            pageSizeOptions={[25, 50, 100, 200]}
            rowActions={(r) => [
              { label: "Open payslip", icon: <Wallet className="h-4 w-4" />, onClick: () => navigate(`/payroll/salary-slips/${encodeURIComponent(r.name)}`) },
              { label: "Open in ERPNext", icon: <ExternalLink className="h-4 w-4" />, onClick: () => window.open(`/desk/salary-slip/${encodeURIComponent(r.name)}`, "_blank") },
            ]}
            emptyTitle="No salary slips"
            emptyDescription="Nothing matches this period and these filters."
            serverSide={{
              total: recs?.total ?? 0,
              page,
              pageSize,
              onPageChange: setPage,
              onPageSizeChange: (n) => {
                setPageSize(n);
                setPage(0);
              },
              query: dims.search,
              onQueryChange: dims.setSearch,
              sort,
              onSortChange: setSort,
            }}
          />
        </div>
      </Card>
    </div>
  );
}
