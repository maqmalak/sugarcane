import { Link } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import { ArrowDownLeft, ArrowDownRight, ArrowUpRight, BookOpen, CalendarCheck, Landmark, Minus, ScanSearch, Scale, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { docUrl } from "@/app/doc-routes";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";

interface Account {
  name: string; account_name: string; bank: string; account: string; account_no?: string; is_default?: number;
  book_balance: number; bank_balance: number; uncleared_out: number; uncleared_in: number;
  in_this: number; out_this: number; in_last: number; out_last: number;
  months: { month: string; in: number; out: number }[];
  recent: { posting_date: string; voucher_type: string; voucher_no: string; party?: string; against?: string; debit: number; credit: number }[];
  cheques: Record<string, number>;
}
interface Data {
  currency: string;
  totals: { book_balance: number; bank_balance: number; uncleared_out: number; uncleared_in: number; in_this: number; out_this: number; in_last: number; out_last: number };
  accounts: Account[];
}

const compact = (v: number) => formatMoney(v, undefined, { compact: true });
const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);
/** A distinct tint per bank (initials chip + card accent). */
const TINTS = [
  "from-sky-500 to-blue-600", "from-emerald-500 to-teal-600", "from-violet-500 to-indigo-600", "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600", "from-cyan-500 to-sky-600",
];
const initials = (s: string) => s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w[0] ?? "")).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function Delta({ v, good }: { v: number | null; good: "up" | "down" }) {
  if (v === null) return <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><Minus className="h-3 w-3" /> no last month</span>;
  const up = v > 0;
  const ok = v === 0 ? null : (up ? good === "up" : good === "down");
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
      ok === null ? "bg-muted text-muted-foreground" : ok ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400")}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : v < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}{Math.abs(v)}%
    </span>
  );
}

function FlowBars({ months }: { months: Account["months"] }) {
  const max = Math.max(...months.flatMap((m) => [m.in, m.out]), 1);
  return (
    <div className="flex h-16 items-end gap-1.5">
      {months.map((m) => (
        <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${m.month} · in ${formatMoney(m.in)} · out ${formatMoney(m.out)}`}>
          <div className="flex h-12 w-full items-end justify-center gap-0.5">
            <span className="w-1/2 rounded-t-sm bg-emerald-500/80" style={{ height: `${Math.max(3, (m.in / max) * 100)}%` }} />
            <span className="w-1/2 rounded-t-sm bg-rose-500/70" style={{ height: `${Math.max(3, (m.out / max) * 100)}%` }} />
          </div>
          <span className="text-[9px] text-muted-foreground">{new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" })}</span>
        </div>
      ))}
    </div>
  );
}

function VLink({ doctype, name, children }: { doctype: string; name: string; children: React.ReactNode }) {
  const u = docUrl(doctype, name);
  return u.external ? <a href={u.href} className="hover:underline">{children}</a> : <Link to={u.href} className="hover:underline">{children}</Link>;
}

/** Banking dashboard above the Banks list: totals, then one card per company bank account. */
export function BankInsights() {
  const { company } = useCompanyContext();
  const { data } = useFrappeGetCall<{ message: Data }>("mm_core.banking.bank_insights", { company: company ?? "" },
    company ? `mm_core.banking.${company}` : null);
  const d = (data as unknown as { message?: Data })?.message;
  if (!d) return <div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>;
  const t = d.totals;
  const diff = t.book_balance - t.bank_balance;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card className="relative overflow-hidden p-4 xl:col-span-1">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-sky-500/10 blur-2xl" />
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">Balance as per books <BookOpen className="h-4 w-4 text-sky-500" /></div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{compact(t.book_balance)}</div>
          <div className="text-[11px] text-muted-foreground">{d.accounts.length} bank account{d.accounts.length === 1 ? "" : "s"}</div>
        </Card>
        <Card className="relative overflow-hidden p-4">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-indigo-500/10 blur-2xl" />
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">Balance as per bank <Landmark className="h-4 w-4 text-indigo-500" /></div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{compact(t.bank_balance)}</div>
          <div className="text-[11px] text-muted-foreground">Difference {compact(diff)} — uncleared items</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">Uncleared <Scale className="h-4 w-4 text-amber-500" /></div>
          <div className="mt-1 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Cheques not presented</span><span className="font-semibold tabular-nums">{compact(t.uncleared_out)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Deposits not credited</span><span className="font-semibold tabular-nums">{compact(t.uncleared_in)}</span></div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">This month</div>
          <div className="mt-1 space-y-1 text-sm">
            <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><ArrowDownLeft className="h-3.5 w-3.5" /> In</span>
              <span className="flex items-center gap-1.5"><span className="font-semibold tabular-nums">{compact(t.in_this)}</span><Delta v={pct(t.in_this, t.in_last)} good="up" /></span></div>
            <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1 text-rose-600 dark:text-rose-400"><ArrowUpRight className="h-3.5 w-3.5" /> Out</span>
              <span className="flex items-center gap-1.5"><span className="font-semibold tabular-nums">{compact(t.out_this)}</span><Delta v={pct(t.out_this, t.out_last)} good="down" /></span></div>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {d.accounts.map((a, i) => {
          const used = Object.entries(a.cheques).filter(([k]) => k !== "Unused").reduce((s, [, v]) => s + v, 0);
          const unused = a.cheques.Unused ?? 0;
          const leaves = used + unused;
          const gap = a.book_balance - a.bank_balance;
          return (
            <Card key={a.name} className="overflow-hidden p-0">
              <div className={cn("h-1 bg-gradient-to-r", TINTS[i % TINTS.length])} />
              <div className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-sm", TINTS[i % TINTS.length])}>
                    {initials(a.bank || a.account_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{a.bank}</span>
                      {a.is_default ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Default" /> : null}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{a.account_name}{a.account_no ? ` · ${a.account_no}` : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className={cn("text-lg font-semibold tabular-nums", a.book_balance < 0 && "text-rose-600")}>{compact(a.book_balance)}</div>
                    <div className="text-[10px] text-muted-foreground">per books · bank {compact(a.bank_balance)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-lg bg-muted/50 p-2"><div className="text-muted-foreground">In this month</div>
                    <div className="flex items-center gap-1 font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{compact(a.in_this)} <Delta v={pct(a.in_this, a.in_last)} good="up" /></div></div>
                  <div className="rounded-lg bg-muted/50 p-2"><div className="text-muted-foreground">Out this month</div>
                    <div className="flex items-center gap-1 font-semibold tabular-nums text-rose-600 dark:text-rose-400">{compact(a.out_this)} <Delta v={pct(a.out_this, a.out_last)} good="down" /></div></div>
                  <div className="rounded-lg bg-muted/50 p-2"><div className="text-muted-foreground">Book vs bank</div>
                    <div className={cn("font-semibold tabular-nums", gap ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>{gap ? compact(gap) : "Reconciled"}</div></div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
                  <div>
                    <div className="mb-1 flex items-center gap-3 text-[10px] text-muted-foreground">Last 6 months
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />in</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-500" />out</span></div>
                    <FlowBars months={a.months} />
                  </div>
                  <div className="space-y-2 text-[11px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">Cheques not presented</span><span className="tabular-nums">{compact(a.uncleared_out)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Deposits not credited</span><span className="tabular-nums">{compact(a.uncleared_in)}</span></div>
                    {leaves > 0 && (
                      <div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Cheque leaves</span><span className="tabular-nums">{used} used · {unused} unused</span></div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${(used / leaves) * 100}%` }} /></div>
                      </div>
                    )}
                  </div>
                </div>

                {a.recent.length > 0 && (
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {a.recent.map((r) => (
                      <div key={`${r.voucher_no}|${r.debit}|${r.credit}`} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
                        {r.debit ? <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-rose-500" />}
                        <span className="w-16 shrink-0 text-muted-foreground">{formatDate(r.posting_date)}</span>
                        <span className="min-w-0 flex-1 truncate"><VLink doctype={r.voucher_type} name={r.voucher_no}>{r.party || r.against || r.voucher_no}</VLink></span>
                        <span className={cn("shrink-0 tabular-nums", r.debit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                          {r.debit ? "+" : "−"}{compact(r.debit || r.credit)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  <Link to={`/accounting/bank-clearance?bank_account=${encodeURIComponent(a.name)}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"><CalendarCheck className="h-3 w-3" /> Clearance</Link>
                  <Link to={`/accounting/reports/general-ledger?account=${encodeURIComponent(a.account)}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"><BookOpen className="h-3 w-3" /> Ledger</Link>
                  <Link to={`/accounting/cheque-tracking?bank=${encodeURIComponent(a.name)}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"><ScanSearch className="h-3 w-3" /> Cheques</Link>
                  <Link to={`/accounting/bank-accounts/${encodeURIComponent(a.name)}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"><Landmark className="h-3 w-3" /> Account</Link>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
