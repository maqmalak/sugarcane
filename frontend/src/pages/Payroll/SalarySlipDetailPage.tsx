import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowDownRight, ArrowLeft, ArrowUpRight, Banknote, Building2, CalendarDays, ExternalLink, Landmark, Minus, Printer, Trash2, TrendingUp, Users2,
} from "lucide-react";
import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { DocPageTabs } from "@/components/doc/doc-page-tabs";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { AreaChart } from "@/components/charts/charts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeePhoto } from "@/components/hr/employee-photo";
import { useSalarySlip, useSalarySlipDelete } from "@/hooks/usePayroll";
import { useHrInsights } from "@/hooks/useHrInsights";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import { asNumber, cn } from "@/utils/cn";

interface Component { component: string; abbr?: string; amount: number; full_amount: number; additional: number; ytd: number; statistical?: number; depends_on_payment_days?: number; tax_applicable?: number; is_income_tax?: number }
interface IncomeTax {
  this_slip: number;
  components: string[];
  effective_rate: number | null;
  ytd: number;
  slab?: string | null;
  newer_slab?: { name: string; effective_from: string } | null;
  annual_taxable: number;
  annual_tax: number;
  deducted_till_date: number;
  /** annual tax − deducted till date: > 0 still to deduct, < 0 over-deducted. */
  balance: number | null;
}
interface Insights {
  slip: Record<string, any>;
  employee: { image?: string; designation?: string; branch?: string; date_of_joining?: string; salary_mode?: string; bank_name?: string; bank_ac_no?: string };
  earnings: Component[];
  deductions: Component[];
  previous: { name: string; start_date: string; gross_pay: number; net_pay: number; total_deduction: number; payment_days: number; changes: { component: string; kind: "e" | "d"; before: number; now: number }[] } | null;
  attendance: Record<string, number>;
  leave: { leave_type: string; days: number }[];
  pay_lost_to_unpaid_days: number;
  income_tax: IncomeTax;
  department: { department: string; slips: number; avg_net: number; avg_gross: number; percentile: number | null } | null;
  ytd: { from: string; slips: number; gross: number; deductions: number; net: number };
  history: { month: string; gross: number; ded: number; net: number; slips: number }[];
}

const strip = (d?: string) => (d ? d.replace(/ - [A-Z0-9]{2,6}$/, "").replace(/\s{2,}/g, " ") : "—");
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleString(undefined, { month: "short", year: "2-digit" });
};
const mask = (ac?: string) => (ac && ac.length > 4 ? `•••• ${ac.slice(-4)}` : ac || "—");

/** Earnings or deductions, payslip style: each component's paid amount, and its full-month amount when prorated. */
function Ledger({ title, rows, currency, tone, total }: { title: string; rows: Component[]; currency?: string; tone: "earn" | "ded"; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div className="min-w-0">
      <div className={cn("mb-2 flex items-center justify-between rounded-lg px-3 py-2", tone === "earn" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-rose-500/10 text-rose-800 dark:text-rose-300")}>
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
        <span className="text-xs">{rows.length} component{rows.length === 1 ? "" : "s"}</span>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((r) => {
          const prorated = r.depends_on_payment_days && r.full_amount > r.amount + 0.5;
          return (
            <li key={r.component} className={cn("px-1 py-2", r.statistical && "opacity-60")}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm">
                  {r.component}
                  {r.abbr && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{r.abbr}</span>}
                  {!!r.statistical && <span className="ml-1.5 text-[10px] text-muted-foreground">(statistical)</span>}
                  {!!r.is_income_tax && <span className="ml-1.5 rounded bg-indigo-500/10 px-1 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">income tax</span>}
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">{formatMoney(r.amount, currency)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className={cn("block h-full rounded-full", tone === "earn" ? "bg-emerald-500" : "bg-rose-500")} style={{ width: `${(r.amount / max) * 100}%` }} />
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {prorated ? `of ${formatMoney(r.full_amount, currency, { compact: true })} full month` : r.additional ? `incl. ${formatMoney(r.additional, currency, { compact: true })} additional` : ""}
                  {r.ytd ? `${prorated || r.additional ? " · " : ""}YTD ${formatMoney(r.ytd, currency, { compact: true })}` : ""}
                </span>
              </div>
            </li>
          );
        })}
        {!rows.length && <li className="py-4 text-center text-sm text-muted-foreground">None</li>}
      </ul>
      <div className="mt-1 flex items-baseline justify-between border-t-2 border-border px-1 pt-2">
        <span className="text-sm font-semibold">Total {title.toLowerCase()}</span>
        <span className="text-sm font-bold tabular-nums">{formatMoney(total, currency)}</span>
      </div>
    </div>
  );
}

/** Pay days: working days split into paid / absent / leave-without-pay / unmarked. */
function DaysBar({ s }: { s: Record<string, any> }) {
  const work = asNumber(s.total_working_days);
  const parts = [
    { label: "Paid", v: asNumber(s.payment_days), c: "bg-emerald-500" },
    { label: "Absent", v: asNumber(s.absent_days), c: "bg-rose-500" },
    { label: "Leave without pay", v: asNumber(s.leave_without_pay), c: "bg-amber-500" },
    { label: "Unmarked", v: asNumber(s.unmarked_days), c: "bg-slate-400" },
  ];
  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {parts.map((p) => p.v > 0 && <span key={p.label} className={cn("h-full", p.c)} style={{ width: `${work ? (p.v / work) * 100 : 0}%` }} title={`${p.label}: ${p.v}`} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-muted-foreground">{work} working days</span>
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1"><span className={cn("h-2 w-2 rounded-full", p.c)} />{p.label} <b className="tabular-nums">{p.v}</b></span>
        ))}
      </div>
    </div>
  );
}

function Delta({ now, before, invert }: { now: number; before: number; invert?: boolean }) {
  const diff = now - before;
  if (Math.abs(diff) < 0.5) return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" /> same</span>;
  const good = invert ? diff < 0 : diff > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good ? "text-emerald-600" : "text-rose-600")}>
      {diff > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {before ? `${Math.abs((diff / before) * 100).toFixed(1)}%` : "new"}
    </span>
  );
}

/**
 * Income tax for the year: tax due on the annual taxable income under the assigned slab, what has been deducted,
 * and the balance — flagged when more has been deducted than the year's total, or a newer slab is in effect.
 */
function IncomeTaxSummary({ it, cur }: { it: IncomeTax; cur?: string }) {
  if (!it.this_slip && !it.annual_tax && !it.deducted_till_date && !it.ytd) {
    return <p className="border-t border-border pt-3 text-xs text-muted-foreground">No income tax on this employee's slips.</p>;
  }
  const over = it.balance !== null && it.balance < -0.5;
  const share = it.annual_tax ? Math.min(100, (it.deducted_till_date / it.annual_tax) * 100) : 0;
  return (
    <div className="space-y-2 border-t border-border pt-3 text-xs">
      <p className="flex items-center justify-between gap-2 font-medium">
        <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Income tax</span>
        {it.slab && <Link to={`/payroll/income-tax-slabs/${encodeURIComponent(it.slab)}`} className="font-normal text-primary hover:underline">slab {it.slab}</Link>}
      </p>
      {[
        ["Deducted on this slip", it.this_slip],
        ["Deducted this year (from slips)", it.ytd],
      ].map(([k, v]) => (
        <div key={String(k)} className="flex justify-between"><span className="text-muted-foreground">{String(k)}</span><span className="font-medium tabular-nums">{formatMoney(Number(v), cur)}</span></div>
      ))}
      {!!(it.annual_tax || it.deducted_till_date) && (
        <div className="space-y-1.5 rounded-lg bg-muted/40 p-2.5">
          <p className="text-[11px] text-muted-foreground">Payroll-period figures from HRMS</p>
          {[
            ["Annual taxable income", it.annual_taxable],
            ["Tax for the year (slab)", it.annual_tax],
            ["Deducted till date", it.deducted_till_date],
          ].map(([k, v]) => (
            <div key={String(k)} className="flex justify-between"><span className="text-muted-foreground">{String(k)}</span><span className="tabular-nums">{formatMoney(Number(v), cur)}</span></div>
          ))}
          {!!it.annual_tax && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", over ? "bg-rose-500" : "bg-indigo-500")} style={{ width: `${share}%` }} />
            </div>
          )}
          {it.balance !== null && (
            <div className={cn("flex justify-between font-semibold", over ? "text-rose-600" : "")}>
              <span>{over ? "Over-deducted" : "Still to deduct"}</span>
              <span className="tabular-nums">{formatMoney(Math.abs(it.balance), cur)}</span>
            </div>
          )}
        </div>
      )}
      {over && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/5 px-2.5 py-1.5 text-rose-700 dark:text-rose-300">
          More tax has been deducted than the slab's total for the year — check the slab, the annual taxable income, or refund the excess.
        </p>
      )}
      {it.newer_slab && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-amber-800 dark:text-amber-300">
          A newer slab, <b>{it.newer_slab.name}</b>, is in effect from {formatDate(it.newer_slab.effective_from)} — the salary structure assignment still uses {it.slab}.
        </p>
      )}
    </div>
  );
}

export default function SalarySlipDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { data: doc, mutate } = useSalarySlip(name);
  const { data: d, error, isLoading } = useHrInsights<Insights>("salary_slip_insights", { name });
  const { deleteDoc, loading: deleteLoading } = useSalarySlipDelete();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!name) return;
    try {
      await deleteDoc(name);
      toast.success("Salary Slip deleted");
      notifyDataChanged();
      navigate("/payroll/salary-slips");
    } catch (err) {
      toast.error(humanizeError(err));
      setConfirmDelete(false);
    }
  };

  if (isLoading && !d) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error || !d) {
    return (
      <div className="space-y-4">
        <PageHeader title="Salary Slip" />
        <Card className="p-4">
          <p className="text-sm text-destructive">Failed to load salary slip {name}.</p>
        </Card>
      </div>
    );
  }

  const s = d.slip;
  const cur = s.currency as string | undefined;
  const totalEarn = d.earnings.filter((r) => !r.statistical).reduce((a, r) => a + r.amount, 0);
  const totalDed = d.deductions.filter((r) => !r.statistical).reduce((a, r) => a + r.amount, 0);
  const deptGap = d.department?.avg_net ? ((asNumber(s.net_pay) - d.department.avg_net) / d.department.avg_net) * 100 : null;
  const takeHome = asNumber(s.gross_pay) ? (asNumber(s.net_pay) / asNumber(s.gross_pay)) * 100 : null;
  // Tax actually deducted on this slip (its income-tax lines) — not HRMS's projected current_month_income_tax,
  // which goes negative once the year's slab total has been exceeded.
  const it = d.income_tax;
  const tax = it.this_slip;
  const changes = (d.previous?.changes ?? []).sort((a, b) => Math.abs(b.now - b.before) - Math.abs(a.now - a.before));

  return (
    <div className="space-y-6">
      <PageHeader
        title={s.employee_name || s.employee}
        subtitle={`Payslip · ${formatDate(s.start_date, { month: "long", year: "numeric", day: undefined })}`}
        icon={<Banknote className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/payroll/salary-slips" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Salary Slips
          </Link>
        }
        actions={
          <>
            {doc && <DocActionsMenu doctype="Salary Slip" doc={doc as any} onChanged={() => void mutate()} />}
            <StatusBadge status={s.status} />
            <Button variant="outline" size="sm" onClick={() => window.open(`/printview?doctype=Salary%20Slip&name=${encodeURIComponent(s.name)}&trigger_print=1`, "_blank")}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            {s.docstatus === 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => window.open(`/desk/salary-slip/${encodeURIComponent(s.name)}`, "_blank")}>
                  <ExternalLink className="h-4 w-4" /> Edit in ERPNext
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={deleteLoading}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </>
        }
      />
      <DocPageTabs doctype="Salary Slip" name={s.name} />

      <div className="grid gap-4 xl:grid-cols-3">
        {/* The payslip */}
        <Card className="overflow-hidden xl:col-span-2">
          <div className="relative bg-gradient-to-br from-primary/15 via-sky-500/10 to-emerald-500/15 p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-4">
                <EmployeePhoto name={s.employee_name || s.employee} src={d.employee.image} size="lg" editable={false} />
                <div className="min-w-0">
                  <Link to={`/hr/employees/${encodeURIComponent(s.employee)}`} className="text-lg font-semibold hover:text-primary hover:underline">{s.employee_name || s.employee}</Link>
                  <p className="text-sm text-muted-foreground">{[s.designation || d.employee.designation, strip(s.department)].filter(Boolean).join(" · ")}</p>
                  <p className="font-mono text-xs text-muted-foreground">{s.employee} · {s.name}</p>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Net pay</p>
                <p className="text-3xl font-bold tabular-nums">{formatMoney(s.net_pay, cur)}</p>
                {d.previous && <Delta now={asNumber(s.net_pay)} before={d.previous.net_pay} />}
              </div>
            </div>
            {s.total_in_words && <p className="mt-4 rounded-lg bg-background/60 px-3 py-2 text-xs italic text-muted-foreground">{s.total_in_words}</p>}
          </div>

          <div className="grid gap-x-6 gap-y-2 border-b border-border px-6 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              [CalendarDays, "Period", `${formatDate(s.start_date)} – ${formatDate(s.end_date)}`],
              [Building2, "Company", s.company],
              [Users2, "Structure", s.salary_structure],
              [Landmark, "Paid via", s.bank_name || d.employee.bank_name ? `${s.bank_name || d.employee.bank_name} ${mask(s.bank_account_no || d.employee.bank_ac_no)}` : s.mode_of_payment || d.employee.salary_mode || "—"],
            ].map(([Icon, k, v]) => {
              const I = Icon as typeof CalendarDays;
              return (
                <div key={String(k)} className="min-w-0">
                  <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground"><I className="h-3 w-3" /> {String(k)}</p>
                  <p className="truncate font-medium" title={String(v ?? "")}>{String(v ?? "—")}</p>
                </div>
              );
            })}
          </div>

          <div className="space-y-4 px-6 py-4">
            <DaysBar s={s} />
            {d.pay_lost_to_unpaid_days > 0 && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                {formatMoney(d.pay_lost_to_unpaid_days, cur)} less than the full-month amount because of unpaid days.
              </p>
            )}
          </div>

          <div className="grid gap-6 px-6 pb-6 md:grid-cols-2">
            <Ledger title="Earnings" rows={d.earnings} currency={cur} tone="earn" total={totalEarn} />
            <Ledger title="Deductions" rows={d.deductions} currency={cur} tone="ded" total={totalDed} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 px-6 py-4">
            <div className="flex gap-6 text-sm">
              <span>Gross <b className="tabular-nums">{formatMoney(s.gross_pay, cur)}</b></span>
              <span className="text-rose-600">Deductions <b className="tabular-nums">− {formatMoney(s.total_deduction, cur)}</b></span>
            </div>
            <span className="text-lg font-bold">Net pay <span className="tabular-nums">{formatMoney(s.net_pay, cur)}</span></span>
          </div>
        </Card>

        {/* Insights */}
        <div className="space-y-4">
          <SectionCard title="At a glance">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Take-home", takeHome !== null ? `${takeHome.toFixed(1)}% of gross` : "—"],
                ["Income tax", tax ? `${formatMoney(tax, cur)}${it.effective_rate ? ` · ${it.effective_rate}%` : ""}` : "None this month"],
                ["vs department", deptGap !== null ? `${deptGap >= 0 ? "+" : ""}${deptGap.toFixed(0)}% of avg net` : "—"],
                ["Rank in dept.", d.department?.percentile != null ? `top ${Math.max(1, 100 - d.department.percentile)}%` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-muted/40 px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground">{k}</dt>
                  <dd className="font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            {d.department && <p className="mt-2 text-[11px] text-muted-foreground">{strip(d.department.department)}: {d.department.slips} slips this month, average net {formatMoney(d.department.avg_net, cur)}.</p>}
          </SectionCard>

          <SectionCard
            title="Since the previous slip"
            description={d.previous ? `${formatDate(d.previous.start_date, { month: "long", year: "numeric", day: undefined })} · ${d.previous.payment_days} paid days then` : "First salary slip"}
            actions={d.previous ? <Link to={`/payroll/salary-slips/${encodeURIComponent(d.previous.name)}`} className="text-xs font-medium text-primary hover:underline">Open</Link> : undefined}
          >
            {d.previous ? (
              <div className="space-y-3">
                {[
                  ["Gross", asNumber(s.gross_pay), d.previous.gross_pay, false],
                  ["Deductions", asNumber(s.total_deduction), d.previous.total_deduction, true],
                  ["Net", asNumber(s.net_pay), d.previous.net_pay, false],
                ].map(([k, now, before, inv]) => (
                  <div key={String(k)} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{String(k)}</span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-xs text-muted-foreground line-through decoration-muted-foreground/40">{formatMoney(Number(before), cur, { compact: true })}</span>
                      <span className="font-semibold tabular-nums">{formatMoney(Number(now), cur, { compact: true })}</span>
                      <Delta now={Number(now)} before={Number(before)} invert={Boolean(inv)} />
                    </span>
                  </div>
                ))}
                {!!changes.length && (
                  <div className="border-t border-border pt-3">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">What changed</p>
                    <ul className="space-y-1.5">
                      {changes.slice(0, 6).map((c) => (
                        <li key={`${c.kind}-${c.component}`} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate">
                            <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full", c.kind === "e" ? "bg-emerald-500" : "bg-rose-500")} />
                            {c.component}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {c.before ? formatMoney(c.before, cur, { compact: true }) : "new"} → {c.now ? formatMoney(c.now, cur, { compact: true }) : "removed"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">Nothing to compare with yet.</p>
            )}
          </SectionCard>

          <SectionCard title="Attendance behind this slip" description={`${formatDate(s.start_date)} – ${formatDate(s.end_date)}`}>
            {Object.keys(d.attendance).length ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(d.attendance).map(([st, n]) => (
                  <span key={st} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"><StatusBadge status={st} /> <b className="tabular-nums">{n}</b></span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No attendance marked in this period.</p>
            )}
            {!!d.leave.length && <p className="mt-2 text-xs text-muted-foreground">Approved leave: {d.leave.map((l) => `${l.days} d ${l.leave_type}`).join(", ")}</p>}
            <Link to={`/hr/attendance?employee=${encodeURIComponent(s.employee)}`} className="mt-2 inline-flex text-xs font-medium text-primary hover:underline">Open attendance →</Link>
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Pay over the last 12 months" description="Gross and net per payroll month" className="lg:col-span-2">
          {d.history.length > 1 ? (
            <AreaChart
              data={d.history.map((h) => ({ month: monthLabel(h.month), gross: asNumber(h.gross), net: asNumber(h.net) }))}
              xKey="month"
              money
              currency={cur}
              legend
              height={240}
              series={[{ key: "gross", label: "Gross" }, { key: "net", label: "Net", color: "hsl(160 84% 39%)" }]}
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">Not enough history yet.</p>
          )}
        </SectionCard>
        <SectionCard title="Year to date" description={`Since ${formatDate(d.ytd.from)} · ${d.ytd.slips} slips`}>
          <div className="space-y-3 text-sm">
            {[
              ["Gross", d.ytd.gross, "bg-sky-500"],
              ["Deductions", d.ytd.deductions, "bg-rose-500"],
              ["Net", d.ytd.net, "bg-emerald-500"],
            ].map(([k, v, c]) => (
              <div key={String(k)} className="space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">{String(k)}</span><b className="tabular-nums">{formatMoney(Number(v), cur)}</b></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", String(c))} style={{ width: `${d.ytd.gross ? (Number(v) / d.ytd.gross) * 100 : 0}%` }} /></div>
              </div>
            ))}
            <IncomeTaxSummary it={it} cur={cur} />
            {s.payroll_entry && (
              <Link to={`/payroll/entries/${encodeURIComponent(s.payroll_entry)}`} className="block border-t border-border pt-3 text-xs font-medium text-primary hover:underline">
                Payroll run {s.payroll_entry} →
              </Link>
            )}
          </div>
        </SectionCard>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this salary slip?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
