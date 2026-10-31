import { useEffect, useState } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";
import { BadgeCheck, CheckCircle2, History, ShieldCheck, UserCheck, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";

interface Check { key: string; label: string; ok: boolean; detail: string; blocking: boolean }
interface Eligibility {
  employee: { employee_name: string; designation?: string; employment_type?: string; service_months: number; date_of_joining?: string; currency: string };
  pay: { gross: number; net: number; basis: string };
  limits: { max_by_salary: number; max_installment: number; max_by_installment: number; max_months: number; eligible_amount: number };
  requested: { amount: number; months: number; installment: number };
  checks: Check[]; eligible: boolean; failed: string[]; outstanding: number; guarantor_required: boolean;
  guarantor: { employee_name: string; service_months: number; outstanding: number; backing: number } | null;
  history: { name: string; posting_date: string; advance_amount: number; return_amount: number; outstanding: number; status: string; purpose?: string; defaulted: boolean }[];
}

function useDebounced<T>(v: T, ms = 450) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/**
 * Live salary-loan eligibility for the Employee Advance form (mm_core.loans.check_eligibility): every policy check,
 * the amount the employee may borrow, the guarantor's standing and the loan history. Same checks block submit.
 */
export function LoanEligibilityPanel({ values, name }: { values: Record<string, any>; name?: string }) {
  const params = useDebounced({
    employee: values.employee ?? "", amount: Number(values.advance_amount) || 0, months: Number(values.mm_installment_months) || 0,
    guarantor: values.mm_guarantor ?? "", exclude: name && name !== "new" ? name : "",
  });
  const active = Boolean(values.mm_is_loan) && Boolean(params.employee);
  const { data, isLoading, error } = useFrappeGetCall<{ message: Eligibility }>(
    "mm_core.loans.check_eligibility", params, active ? `mm_core.loans.elig.${JSON.stringify(params)}` : null,
  );
  const r = (data as unknown as { message?: Eligibility })?.message;
  if (!values.mm_is_loan) return null;
  if (!values.employee) return <Card className="p-4 text-sm text-muted-foreground">Choose the employee to check loan eligibility.</Card>;
  if (error) return <Card className="p-4 text-sm text-destructive">{String((error as { message?: string }).message ?? error)}</Card>;
  if (isLoading || !r) return <Skeleton className="h-64 rounded-xl" />;
  const cur = r.employee.currency;
  const money = (v: number) => formatMoney(v, cur);
  const groups = [
    { title: "Employee", icon: BadgeCheck, keys: ["active", "type", "service", "salary"] },
    { title: "This loan", icon: ShieldCheck, keys: ["amount", "tenure", "installment", "open_loans", "history"] },
    { title: "Guarantor", icon: UserCheck, keys: ["guarantor", "g_self", "g_active", "g_type", "g_service", "g_loans", "g_backing"] },
  ];

  return (
    <Card className="space-y-4 p-5">
      <div className={cn("flex flex-wrap items-center gap-3 rounded-xl p-3", r.eligible ? "bg-emerald-500/10" : "bg-rose-500/10")}>
        {r.eligible ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <XCircle className="h-6 w-6 text-rose-600" />}
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm font-semibold", r.eligible ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
            {r.eligible ? "Eligible for this loan" : "Not eligible"}
          </div>
          <div className="text-xs text-muted-foreground">
            {r.eligible ? "Meets the salary loan policy." : `Fails: ${r.failed.join(", ")}. An HR Manager can still approve it with an override reason.`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { l: "Eligible up to", v: money(r.limits.eligible_amount), strong: true },
          { l: "Max instalment", v: `${money(r.limits.max_installment)} / mo` },
          { l: "Max tenure", v: `${r.limits.max_months} months` },
          { l: "Outstanding now", v: money(r.outstanding) },
        ].map((t) => (
          <div key={t.l} className="rounded-lg bg-muted/50 p-2.5">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t.l}</div>
            <div className={cn("text-sm tabular-nums", t.strong ? "font-semibold text-primary" : "font-medium")}>{t.v}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {r.employee.employee_name} · {r.employee.employment_type ?? "—"} · {r.employee.service_months} months' service · average gross {money(r.pay.gross)},
        net {money(r.pay.net)} ({r.pay.basis}).
        {r.requested.installment ? ` Requested: ${money(r.requested.amount)} over ${r.requested.months} months = ${money(r.requested.installment)} / month.` : ""}
      </p>

      <div className="grid gap-3 md:grid-cols-3">
        {groups.map((g) => {
          const items = r.checks.filter((c) => g.keys.includes(c.key));
          if (!items.length && g.title !== "Guarantor") return null;
          return (
            <div key={g.title} className="rounded-xl border border-border p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><g.icon className="h-3.5 w-3.5 text-muted-foreground" />{g.title}</div>
              {items.length === 0 ? <p className="text-xs text-muted-foreground">No guarantor needed under the policy.</p> : (
                <ul className="space-y-2">
                  {items.map((c) => (
                    <li key={c.key} className="flex gap-2 text-xs">
                      {c.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />}
                      <span className="min-w-0"><span className="font-medium">{c.label}</span><span className="block text-[11px] text-muted-foreground">{c.detail}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><History className="h-3.5 w-3.5 text-muted-foreground" /> Previous loans and advances</div>
        {r.history.length === 0 ? <p className="text-xs text-muted-foreground">No previous loans or advances.</p> : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-3 py-2 text-left">Advance</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Repaid</th><th className="px-3 py-2 text-right">Outstanding</th><th className="px-3 py-2 text-left">Status</th></tr>
              </thead>
              <tbody>
                {r.history.map((h) => (
                  <tr key={h.name} className="border-t border-border">
                    <td className="px-3 py-1.5 font-medium">{h.name}<span className="block text-[10px] font-normal text-muted-foreground">{h.purpose}</span></td>
                    <td className="px-3 py-1.5">{formatDate(h.posting_date)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(h.advance_amount)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(h.return_amount)}</td>
                    <td className={cn("px-3 py-1.5 text-right tabular-nums", h.outstanding > 0 && "font-medium")}>{money(h.outstanding)}</td>
                    <td className="px-3 py-1.5">{h.defaulted ? <span className="rounded bg-rose-500/10 px-1.5 text-rose-600">Default</span> : h.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
