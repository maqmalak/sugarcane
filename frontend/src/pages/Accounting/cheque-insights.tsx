import { Link } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import { BadgeCheck, Hourglass, Landmark, NotebookTabs, TrendingUp, Undo2, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { docUrl } from "@/app/doc-routes";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";

interface Insights {
  summary: { total: number; used: number; unused: number; outstanding: number; cleared: number; dishonoured: number; books: number };
  by_status: { status: string; count: number; amount: number }[];
  by_bank: { bank_account: string; bank?: string; books: number; total: number; unused: number; issued: number; cleared: number; void: number;
    stopped: number; dishonoured: number; issued_amount: number; outstanding_amount: number }[];
  top_payees: { party_type?: string; party?: string; party_name: string; count: number; amount: number }[];
  monthly: { month: string; count: number; amount: number }[];
}

export const STATUS_ORDER = ["Unused", "Issued", "Cleared", "Void", "Stopped", "Dishonoured"];
export const STATUS_COLOR: Record<string, string> = {
  Unused: "#94a3b8", Issued: "#f59e0b", Cleared: "#10b981", Void: "#71717a", Stopped: "#f97316", Dishonoured: "#f43f5e",
};
const compact = (v: number) => formatMoney(v, undefined, { compact: true });

/** Cheque register at a glance: used vs unused, status mix, bank-wise usage, top payees, monthly issues. */
export function ChequeInsights({ company, bankAccount, status, onStatus, onBank }: {
  company?: string; bankAccount?: string; status?: string; onStatus: (s: string) => void; onBank: (b: string) => void;
}) {
  const args = { company: company ?? "", bank_account: bankAccount ?? "" };
  const { data } = useFrappeGetCall<{ message: Insights }>("mm_core.cheques.cheque_insights", args, `mm_core.cheques.insights.${JSON.stringify(args)}`);
  const d = (data as unknown as { message?: Insights })?.message;
  if (!d) return <div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;
  const s = d.summary;
  const usedPct = s.total ? Math.round((s.used / s.total) * 100) : 0;
  const statusMap = Object.fromEntries(d.by_status.map((x) => [x.status, x]));
  const maxPayee = Math.max(...d.top_payees.map((p) => p.amount), 1);
  const maxMonth = Math.max(...d.monthly.map((m) => m.amount), 1);

  return (
    <div className="space-y-3">
      {/* summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="space-y-2 bg-gradient-to-br from-indigo-500/[0.08] to-transparent p-4 lg:col-span-2">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">Leaves used <NotebookTabs className="h-4 w-4 text-indigo-500" /></div>
          <div className="flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums">{s.used}</span>
            <span className="text-xs text-muted-foreground">of {s.total} in {s.books} book{s.books === 1 ? "" : "s"} · {s.unused} unused</span></div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {STATUS_ORDER.filter((k) => statusMap[k]?.count).map((k) => (
              <span key={k} title={`${k}: ${statusMap[k].count}`} style={{ width: `${(statusMap[k].count / Math.max(1, s.total)) * 100}%`, background: STATUS_COLOR[k] }} />
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground">{usedPct}% of leaves used</div>
        </Card>
        <Card className="space-y-1.5 bg-gradient-to-br from-amber-500/[0.08] to-transparent p-4">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">Outstanding <Hourglass className="h-4 w-4 text-amber-500" /></div>
          <div className="text-xl font-semibold tabular-nums">{compact(s.outstanding)}</div>
          <div className="text-[11px] text-muted-foreground">{statusMap.Issued?.count ?? 0} issued, not yet paid by the bank</div>
        </Card>
        <Card className="space-y-1.5 bg-gradient-to-br from-emerald-500/[0.08] to-transparent p-4">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">Cleared <BadgeCheck className="h-4 w-4 text-emerald-500" /></div>
          <div className="text-xl font-semibold tabular-nums">{compact(s.cleared)}</div>
          <div className="text-[11px] text-muted-foreground">{statusMap.Cleared?.count ?? 0} cheques paid by the bank</div>
        </Card>
        <Card className="space-y-1.5 bg-gradient-to-br from-rose-500/[0.08] to-transparent p-4">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">Dishonoured <Undo2 className="h-4 w-4 text-rose-500" /></div>
          <div className="text-xl font-semibold tabular-nums">{compact(s.dishonoured)}</div>
          <div className="text-[11px] text-muted-foreground">{statusMap.Dishonoured?.count ?? 0} returned · {(statusMap.Void?.count ?? 0) + (statusMap.Stopped?.count ?? 0)} void / stopped</div>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {/* status-wise */}
        <Card className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Status-wise</h3>
          {STATUS_ORDER.map((k) => {
            const r = statusMap[k] ?? { count: 0, amount: 0 };
            return (
              <button key={k} type="button" onClick={() => onStatus(status === k ? "" : k)}
                className={cn("flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted/50", status === k && "bg-primary/[0.06] ring-1 ring-primary/30")}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: STATUS_COLOR[k] }} />
                <span className="w-20 shrink-0 font-medium">{k}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${(r.count / Math.max(1, s.total)) * 100}%`, background: STATUS_COLOR[k] }} /></span>
                <span className="w-8 text-right tabular-nums">{r.count}</span>
                <span className="w-20 text-right tabular-nums text-muted-foreground">{r.amount ? compact(r.amount) : "—"}</span>
              </button>
            );
          })}
        </Card>

        {/* bank-wise */}
        <Card className="space-y-2.5 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Landmark className="h-4 w-4 text-muted-foreground" /> Bank-wise</h3>
          {d.by_bank.length === 0 ? <p className="text-xs text-muted-foreground">No cheque books yet.</p> : d.by_bank.map((b) => {
            const used = b.total - b.unused;
            return (
              <button key={b.bank_account} type="button" onClick={() => onBank(bankAccount === b.bank_account ? "" : b.bank_account)}
                className={cn("w-full space-y-1 rounded-md p-1.5 text-left hover:bg-muted/50", bankAccount === b.bank_account && "bg-primary/[0.06] ring-1 ring-primary/30")}>
                <div className="flex items-baseline justify-between gap-2 text-xs"><span className="truncate font-medium">{b.bank ?? b.bank_account}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{compact(b.issued_amount)}</span></div>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted" title={`${used} used · ${b.unused} unused`}>
                  {(["cleared", "issued", "void", "stopped", "dishonoured"] as const).map((k) => b[k] ? (
                    <span key={k} style={{ width: `${(b[k] / Math.max(1, b.total)) * 100}%`, background: STATUS_COLOR[k[0].toUpperCase() + k.slice(1)] }} />
                  ) : null)}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{used} used · {b.unused} unused · {b.books} book{b.books === 1 ? "" : "s"}</span>
                  <span>{b.outstanding_amount ? `${compact(b.outstanding_amount)} outstanding` : b.dishonoured ? `${b.dishonoured} returned` : ""}</span>
                </div>
              </button>
            );
          })}
        </Card>

        {/* top payees + monthly */}
        <Card className="space-y-3 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Users className="h-4 w-4 text-muted-foreground" /> Most issued to</h3>
          <div className="space-y-1.5">
            {d.top_payees.length === 0 ? <p className="text-xs text-muted-foreground">No cheques issued yet.</p> : d.top_payees.map((p, i) => {
              const u = p.party_type && p.party ? docUrl(p.party_type, p.party) : null;
              return (
                <div key={`${p.party_type}|${p.party}`} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5"><span className="w-4 shrink-0 text-[10px] text-muted-foreground">{i + 1}</span>
                      {u && !u.external ? <Link to={u.href} className="truncate font-medium hover:underline">{p.party_name}</Link> : <span className="truncate font-medium">{p.party_name}</span>}</span>
                    <span className="shrink-0 tabular-nums">{compact(p.amount)} <span className="text-muted-foreground">· {p.count}</span></span>
                  </div>
                  <div className="ml-5 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${(p.amount / maxPayee) * 100}%` }} /></div>
                </div>
              );
            })}
          </div>
          {d.monthly.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground"><TrendingUp className="h-3 w-3" /> Issued per month</div>
              <div className="flex h-14 items-end gap-1.5">
                {d.monthly.map((m) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${m.month}: ${m.count} cheques · ${formatMoney(m.amount)}`}>
                    <div className="w-full rounded-sm bg-gradient-to-t from-indigo-500/70 to-violet-400" style={{ height: `${Math.max(6, (m.amount / maxMonth) * 44)}px` }} />
                    <span className="text-[9px] text-muted-foreground">{new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
