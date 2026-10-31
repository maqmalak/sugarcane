import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Banknote, Check, FileCheck2, Landmark, Loader2, Send, Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/common/section-card";
import type { ExtraContext } from "@/components/doc/doc-config";
import { useAggregate, getLinkedValues, count, sum } from "@/hooks/useDoc";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError, postCall, postCallForDoc } from "@/services/frappe";
import { formatMoney } from "@/utils/currency";
import { asNumber, cn } from "@/utils/cn";

/** On a new Payroll Entry, fill the company's payroll payable account, cost center and currency (the desk does this on load). */
export function PayrollEntryDefaults({ ctx }: { ctx: ExtraContext }) {
  const filledFor = useRef<string | null>(null);
  const company = ctx.values.company as string | undefined;
  useEffect(() => {
    if (!ctx.isNew || !company || filledFor.current === company) return;
    filledFor.current = company;
    void getLinkedValues("Company", company, ["default_currency", "default_payroll_payable_account", "cost_center"]).then((c) => {
      const patch: Record<string, unknown> = {};
      if (!ctx.values.currency && c.default_currency) patch.currency = c.default_currency;
      if (!ctx.values.payroll_payable_account && c.default_payroll_payable_account) patch.payroll_payable_account = c.default_payroll_payable_account;
      if (!ctx.values.cost_center && c.cost_center) patch.cost_center = c.cost_center;
      if (!ctx.values.exchange_rate) patch.exchange_rate = 1;
      if (Object.keys(patch).length) ctx.patch(patch);
    });
  }, [ctx, company]);
  return null;
}

type StepState = "done" | "current" | "todo";

function Step({ n, title, hint, state, action }: { n: number; title: string; hint: ReactNode; state: StepState; action?: ReactNode }) {
  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-border last:hidden" aria-hidden />
      <span
        className={cn(
          "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
          state === "done" && "border-emerald-500 bg-emerald-500 text-white",
          state === "current" && "border-primary bg-primary/10 text-primary",
          state === "todo" && "border-border bg-background text-muted-foreground",
        )}
      >
        {state === "done" ? <Check className="h-4 w-4" /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className={cn("text-sm font-semibold", state === "todo" && "text-muted-foreground")}>{title}</p>
        <div className="text-xs text-muted-foreground">{hint}</div>
        {action && state === "current" && <div className="mt-2">{action}</div>}
      </div>
    </li>
  );
}

/**
 * The payroll run as a checklist under the Payroll Entry form: fetch employees → submit the entry (creates the
 * salary slips) → submit the slips (books the accrual) → make the bank entry. Each step runs the same
 * whitelisted Payroll Entry method the desk buttons call.
 */
export function PayrollRunPanel({ ctx }: { ctx: ExtraContext }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [bank, setBank] = useState<{ has_bank_entries?: boolean } | null>(null);
  const name = ctx.name!;
  const v = ctx.values;
  const employees = (ctx.rows.employees ?? []).length;
  const currency = v.currency as string | undefined;

  const { data: slips, mutate } = useAggregate("Salary Slip", {
    fields: ["docstatus", count("name", "n"), sum("gross_pay", "gross"), sum("total_deduction", "ded"), sum("net_pay", "net")],
    filters: [["payroll_entry", "=", name]],
    groupBy: "docstatus",
    enabled: !ctx.isNew && ctx.docstatus === 1,
  });
  const by = Object.fromEntries((slips ?? []).map((r) => [String(r.docstatus), r]));
  const draft = asNumber(by["0"]?.n);
  const submitted = asNumber(by["1"]?.n);
  const created = draft + submitted;
  const totals = by["1"] ?? by["0"];

  useEffect(() => {
    if (ctx.docstatus !== 1 || !submitted) return;
    void postCall<{ has_bank_entries?: boolean }>("run_doc_method", { method: "has_bank_entries", dt: "Payroll Entry", dn: name })
      .then((r) => setBank(r ?? null))
      .catch(() => setBank(null));
  }, [ctx.docstatus, submitted, name]);

  const run = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(label);
    try {
      await fn();
      toast.success(done);
      notifyDataChanged();
      void mutate();
      ctx.reload();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(null);
    }
  };

  const getEmployees = () =>
    run(
      "employees",
      async () => {
        const filled = await postCallForDoc<Record<string, unknown>>("fill_employee_details", { ...v, doctype: "Payroll Entry", employees: ctx.rows.employees ?? [] });
        await postCall("frappe.client.save", { doc: filled });
      },
      "Employees fetched",
    );
  const submitSlips = () => run("submit", () => postCall("run_doc_method", { method: "submit_salary_slips", dt: "Payroll Entry", dn: name }), "Salary slips submitted");
  const makeBankEntry = async () => {
    setBusy("bank");
    try {
      const je = await postCall<{ name?: string }>("run_doc_method", { method: "make_bank_entry", dt: "Payroll Entry", dn: name });
      toast.success("Bank entry created");
      notifyDataChanged();
      if (je?.name) navigate(`/accounting/journal-entries/${encodeURIComponent(je.name)}`);
      else ctx.reload();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(null);
    }
  };

  const queued = v.status === "Queued";
  const s1: StepState = employees ? "done" : ctx.docstatus === 0 ? "current" : "todo";
  const s2: StepState = ctx.docstatus === 1 ? "done" : employees ? "current" : "todo";
  const s3: StepState = ctx.docstatus === 1 && created && !draft ? "done" : ctx.docstatus === 1 && draft ? "current" : "todo";
  const s4: StepState = bank?.has_bank_entries ? "done" : s3 === "done" ? "current" : "todo";
  const spin = (k: string) => (busy === k ? <Loader2 className="h-4 w-4 animate-spin" /> : null);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <SectionCard title="Payroll run" description="Work down the steps — each runs the same action as ERPNext's desk buttons." className="lg:col-span-2">
        <ol>
          <Step
            n={1}
            title="Fetch employees"
            state={s1}
            hint={employees ? `${employees} employees match the filters above` : "Pulls every active employee with a salary structure for this company, currency and filters."}
            action={
              <Button size="sm" variant="primary" onClick={() => void getEmployees()} disabled={!!busy}>
                {spin("employees") ?? <Users2 className="h-4 w-4" />} Get employees
              </Button>
            }
          />
          <Step
            n={2}
            title="Submit the payroll entry"
            state={s2}
            hint={queued ? "Salary slips are being created in the background — refresh in a moment." : ctx.docstatus === 1 ? `${created} salary slips created` : "Use Submit at the top of the page — this creates a draft salary slip per employee."}
          />
          <Step
            n={3}
            title="Submit salary slips"
            state={s3}
            hint={created ? `${submitted} of ${created} submitted${draft ? ` · ${draft} still draft` : ""}` : "Review the draft slips, then submit them to book the payroll accrual."}
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => void submitSlips()} disabled={!!busy}>
                  {spin("submit") ?? <Send className="h-4 w-4" />} Submit {draft} slip{draft === 1 ? "" : "s"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`/payroll/salary-slips?payroll_entry=${encodeURIComponent(name)}`)}>
                  <FileCheck2 className="h-4 w-4" /> Review slips
                </Button>
              </div>
            }
          />
          <Step
            n={4}
            title="Pay salaries (bank entry)"
            state={s4}
            hint={bank?.has_bank_entries ? "Bank entry made" : v.payment_account ? `From ${v.payment_account}` : "Set a Payment Account on the entry, then make the bank entry."}
            action={
              <Button size="sm" variant="primary" onClick={() => void makeBankEntry()} disabled={!!busy || !v.payment_account}>
                {spin("bank") ?? <Landmark className="h-4 w-4" />} Make bank entry
              </Button>
            }
          />
        </ol>
      </SectionCard>

      <SectionCard
        title="This run"
        actions={
          created ? (
            <Link to={`/payroll/salary-slips?payroll_entry=${encodeURIComponent(name)}`} className="text-xs font-medium text-primary hover:underline">
              View slips
            </Link>
          ) : undefined
        }
      >
        <dl className="space-y-3 text-sm">
          {[
            ["Employees", employees || "—"],
            ["Salary slips", created ? `${created}` : "—"],
            ["Gross pay", totals ? formatMoney(asNumber(by["0"]?.gross) + asNumber(by["1"]?.gross), currency) : "—"],
            ["Deductions", totals ? formatMoney(asNumber(by["0"]?.ded) + asNumber(by["1"]?.ded), currency) : "—"],
          ].map(([k, val]) => (
            <div key={String(k)} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium tabular-nums">{val}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <dt className="flex items-center gap-1.5 font-semibold">
              <Banknote className="h-4 w-4 text-emerald-600" /> Net pay
            </dt>
            <dd className="text-lg font-semibold tabular-nums">{totals ? formatMoney(asNumber(by["0"]?.net) + asNumber(by["1"]?.net), currency) : "—"}</dd>
          </div>
        </dl>
      </SectionCard>
    </div>
  );
}
