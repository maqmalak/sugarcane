import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import { ArrowDownRight, ArrowUpRight, BookOpen, CalendarClock, HandCoins, Landmark, ListChecks, Minus, RefreshCw, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { docUrl } from "@/app/doc-routes";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";

interface Loan {
  name: string; employee: string; employee_name: string; department?: string; posting_date: string; advance_amount: number;
  paid_amount: number; claimed_amount: number; return_amount: number; outstanding: number; status: string; purpose?: string;
  mm_is_loan?: number; mm_installment_months?: number; mm_monthly_installment?: number; mm_guarantor_name?: string; mm_first_deduction?: string;
}
interface Row { date: string; employee: string; employee_name: string; loan: string; type: string; voucher_type: string; voucher_no: string; debit: number; credit: number; balance: number }
interface LedgerData {
  currency: string;
  summary: {
    outstanding: number; active: number; loans: number; pending: number; deducted_this: number; deducted_last: number; deducted_pct: number | null;
    deducted_projected?: boolean;
    disbursed_this: number; disbursed_last: number; disbursed_pct: number | null; scheduled_this: number; this_month: string; last_month: string;
  };
  ledger: { from_date: string; to_date: string; opening: number; closing: number; rows: Row[]; debit: number; credit: number };
  loans: Loan[];
}

const TYPE_TONE: Record<string, string> = {
  Disbursed: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  "Salary deduction": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Repaid: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  "Adjusted (expense claim)": "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};
const monthName = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

function Delta({ pct, goodWhenUp }: { pct: number | null; goodWhenUp: boolean }) {
  if (pct === null) return <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"><Minus className="h-3 w-3" /> no prior month</span>;
  const up = pct > 0, flat = pct === 0;
  const good = flat ? null : up === goodWhenUp;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
      good === null ? "bg-muted text-muted-foreground" : good ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400")}>
      {flat ? <Minus className="h-3 w-3" /> : up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct)}%
    </span>
  );
}

function DocLink({ doctype, name, children, className }: { doctype: string; name: string; children: React.ReactNode; className?: string }) {
  const u = docUrl(doctype, name);
  return u.external ? <a href={u.href} className={className}>{children}</a> : <Link to={u.href} className={className}>{children}</Link>;
}

/** /hr/loans — salary loans: outstanding, deductions and disbursements this month vs last, the loan ledger and each loan's recovery. */
export default function SalaryLoansPage() {
  const { company } = useCompanyContext();
  const [scope, setScope] = useState<"loans" | "all">("loans");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [employee, setEmployee] = useState("");
  const [loan, setLoan] = useState("");
  const [tab, setTab] = useState<"ledger" | "loans">("ledger");

  const params = { company: company ?? "", scope, from_date: from, to_date: to, employee, loan };
  const { data, isLoading, isValidating, mutate } = useFrappeGetCall<{ message: LedgerData }>(
    "mm_core.loans.get_loan_ledger", params, company ? `mm_core.loans.ledger.${JSON.stringify(params)}` : null,
  );
  const d = (data as unknown as { message?: LedgerData })?.message;
  const cur = d?.currency ?? "PKR";
  const money = (v?: number) => formatMoney(v ?? 0, cur);
  const employees = useMemo(() => {
    const m = new Map<string, string>();
    (d?.loans ?? []).forEach((l) => m.set(l.employee, l.employee_name));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [d?.loans]);
  const loanOptions = (d?.loans ?? []).filter((l) => !employee || l.employee === employee);
  const s = d?.summary;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Salary Loans"
        subtitle="Loans to employees, recovered in monthly instalments from salary — ledger, deductions and outstanding balances"
        icon={<HandCoins className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Link to="/hr/advances" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"><Wallet className="h-4 w-4" /> New loan</Link>
            <Button variant="outline" onClick={() => void mutate()} disabled={isValidating}><RefreshCw className={cn("h-4 w-4", isValidating && "animate-spin")} /> Refresh</Button>
          </div>
        }
      />

      {/* summary cards */}
      {!s ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="space-y-1.5 bg-gradient-to-br from-indigo-500/[0.08] to-transparent p-4">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">Outstanding loans <Landmark className="h-4 w-4 text-indigo-500" /></div>
            <div className="text-2xl font-semibold tabular-nums">{money(s.outstanding)}</div>
            <div className="text-[11px] text-muted-foreground">{s.active} active of {s.loans} · {s.pending} request{s.pending === 1 ? "" : "s"} pending</div>
          </Card>
          <Card className="space-y-1.5 bg-gradient-to-br from-emerald-500/[0.08] to-transparent p-4">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">Deducted from salary · {monthName(s.this_month)} <ListChecks className="h-4 w-4 text-emerald-500" /></div>
            <div className="flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums">{money(s.deducted_this)}</span><Delta pct={s.deducted_pct} goodWhenUp /></div>
            <div className="text-[11px] text-muted-foreground">
              {s.deducted_projected ? <span className="text-amber-600 dark:text-amber-400">Scheduled — payroll not run yet · </span> : null}Last month {money(s.deducted_last)}
            </div>
          </Card>
          <Card className="space-y-1.5 bg-gradient-to-br from-violet-500/[0.08] to-transparent p-4">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">Disbursed · {monthName(s.this_month)} <HandCoins className="h-4 w-4 text-violet-500" /></div>
            <div className="flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums">{money(s.disbursed_this)}</span><Delta pct={s.disbursed_pct} goodWhenUp={false} /></div>
            <div className="text-[11px] text-muted-foreground">Last month {money(s.disbursed_last)}</div>
          </Card>
          <Card className="space-y-1.5 bg-gradient-to-br from-amber-500/[0.08] to-transparent p-4">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">Scheduled for this month's payroll <CalendarClock className="h-4 w-4 text-amber-500" /></div>
            <div className="text-2xl font-semibold tabular-nums">{money(s.scheduled_this)}</div>
            <div className="text-[11px] text-muted-foreground">Instalments due in {monthName(s.this_month)} slips</div>
          </Card>
        </div>
      )}

      {/* filters */}
      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div className="flex rounded-lg border border-border p-0.5">
          {([["loans", "Salary loans"], ["all", "All advances"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setScope(k); setLoan(""); }}
              className={cn("rounded-md px-2.5 py-1 text-xs", scope === k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>
        <div className="flex flex-col gap-1"><label htmlFor="loan-from" className="text-[11px] text-muted-foreground">From</label>
          <Input id="loan-from" type="date" value={from || d?.ledger.from_date || ""} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40 text-xs" /></div>
        <div className="flex flex-col gap-1"><label htmlFor="loan-to" className="text-[11px] text-muted-foreground">To</label>
          <Input id="loan-to" type="date" value={to || d?.ledger.to_date || ""} onChange={(e) => setTo(e.target.value)} className="h-8 w-40 text-xs" /></div>
        <div className="flex flex-col gap-1"><label htmlFor="loan-emp" className="text-[11px] text-muted-foreground">Employee</label>
          <Select id="loan-emp" value={employee} onChange={(e) => { setEmployee(e.target.value); setLoan(""); }} className="h-8 w-52 text-xs">
            <option value="">All employees</option>
            {employees.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </Select></div>
        <div className="flex flex-col gap-1"><label htmlFor="loan-loan" className="text-[11px] text-muted-foreground">Loan</label>
          <Select id="loan-loan" value={loan} onChange={(e) => setLoan(e.target.value)} className="h-8 w-56 text-xs">
            <option value="">All loans</option>
            {loanOptions.map((l) => <option key={l.name} value={l.name}>{l.name} · {l.employee_name}</option>)}
          </Select></div>
        <div className="ml-auto flex rounded-lg border border-border p-0.5">
          {([["ledger", "Ledger", BookOpen], ["loans", "Loans", ListChecks]] as const).map(([k, l, I]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs", tab === k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <I className="h-3.5 w-3.5" />{l}</button>
          ))}
        </div>
      </Card>

      {isLoading && !d ? <Skeleton className="h-80 rounded-xl" /> : !d ? null : tab === "ledger" ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Employee</th><th className="px-3 py-2 text-left">Loan</th>
                  <th className="px-3 py-2 text-left">Entry</th><th className="px-3 py-2 text-left">Voucher</th>
                  <th className="px-3 py-2 text-right">Disbursed (Dr)</th><th className="px-3 py-2 text-right">Recovered (Cr)</th><th className="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border bg-muted/20 text-xs font-medium">
                  <td className="px-3 py-2" colSpan={7}>Opening balance · {formatDate(d.ledger.from_date)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(d.ledger.opening)}</td>
                </tr>
                {d.ledger.rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">No loan entries in this period.</td></tr>
                ) : d.ledger.rows.map((r, i) => (
                  <tr key={`${r.voucher_no}|${r.loan}|${i}`} className="border-t border-border hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs">{formatDate(r.date)}</td>
                    <td className="px-3 py-1.5 text-xs"><Link to={`/hr/employees/${encodeURIComponent(r.employee)}`} className="hover:underline">{r.employee_name}</Link></td>
                    <td className="px-3 py-1.5 text-xs"><DocLink doctype="Employee Advance" name={r.loan} className="font-medium hover:underline">{r.loan}</DocLink></td>
                    <td className="px-3 py-1.5"><span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", TYPE_TONE[r.type] ?? "bg-muted text-muted-foreground")}>{r.type}</span></td>
                    <td className="px-3 py-1.5 text-xs"><DocLink doctype={r.voucher_type} name={r.voucher_no} className="text-muted-foreground hover:underline">{r.voucher_no}</DocLink></td>
                    <td className="px-3 py-1.5 text-right text-xs tabular-nums">{r.debit ? money(r.debit) : ""}</td>
                    <td className="px-3 py-1.5 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400">{r.credit ? money(r.credit) : ""}</td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{money(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/30 text-xs font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={5}>Closing balance · {formatDate(d.ledger.to_date)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(d.ledger.debit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(d.ledger.credit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(d.ledger.closing)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Loan</th><th className="px-3 py-2 text-left">Employee</th><th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">Instalments</th><th className="px-3 py-2 text-left">Recovered</th><th className="px-3 py-2 text-right">Outstanding</th>
                  <th className="px-3 py-2 text-left">Guarantor</th><th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {(d.loans ?? []).filter((l) => (!employee || l.employee === employee) && (!loan || l.name === loan)).map((l) => {
                  const pct = l.paid_amount ? Math.min(100, Math.round(((l.return_amount + l.claimed_amount) / l.paid_amount) * 100)) : 0;
                  return (
                    <tr key={l.name} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs"><DocLink doctype="Employee Advance" name={l.name} className="font-medium hover:underline">{l.name}</DocLink>
                        <span className="block text-[10px] text-muted-foreground">{formatDate(l.posting_date)}{l.purpose ? ` · ${l.purpose.replace(/^Salary loan — /, "")}` : ""}</span></td>
                      <td className="px-3 py-2 text-xs">{l.employee_name}<span className="block text-[10px] text-muted-foreground">{l.department?.replace(/ - .*$/, "")}</span></td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">{money(l.advance_amount)}</td>
                      <td className="px-3 py-2 text-xs">{l.mm_installment_months ? `${l.mm_installment_months} × ${money(l.mm_monthly_installment)}` : "—"}
                        {l.mm_first_deduction && <span className="block text-[10px] text-muted-foreground">from {formatDate(l.mm_first_deduction)}</span>}</td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                          <span className="tabular-nums text-muted-foreground">{pct}%</span></div>
                      </td>
                      <td className={cn("px-3 py-2 text-right text-xs font-medium tabular-nums", l.outstanding > 0 && "text-foreground")}>{money(l.outstanding)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{l.mm_guarantor_name || "—"}</td>
                      <td className="px-3 py-2 text-xs">{l.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
