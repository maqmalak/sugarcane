import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useFrappeGetCall, useFrappeGetDocList } from "frappe-react-sdk";
import { NotebookTabs, RefreshCw, Search, ScanSearch } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { docUrl } from "@/app/doc-routes";
import { companyFilter, useCompanyContext } from "@/hooks/useCompanyContext";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import { ChequeInsights } from "./cheque-insights";

interface Leaf {
  cheque_no: string; sno: number; status: string; issue_date?: string; party_type?: string; party?: string; party_name?: string; amount?: number;
  voucher_type?: string; voucher_no?: string; clearance_date?: string; cancel_reason?: string; book: string; bank_account: string; bank?: string;
}
interface Result { rows: Leaf[]; total: number; counts: Record<string, number>; issued_amount: number }

const STATUSES = ["Unused", "Issued", "Cleared", "Void", "Stopped", "Dishonoured"] as const;
const TONE: Record<string, string> = {
  Unused: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  Issued: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  Cleared: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  Void: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
  Stopped: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  Dishonoured: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
};
const HINT: Record<string, string> = {
  Unused: "blank leaf in the book", Issued: "outstanding — not yet paid by the bank", Cleared: "paid by the bank",
  Void: "spoiled / cancelled by us", Stopped: "stop-payment given to the bank", Dishonoured: "returned unpaid by the bank",
};
const PAGE = 50;

function DocLink({ doctype, name, className, children }: { doctype: string; name: string; className?: string; children: React.ReactNode }) {
  const u = docUrl(doctype, name);
  return u.external ? <a href={u.href} className={className}>{children}</a> : <Link to={u.href} className={className}>{children}</Link>;
}

/** /accounting/cheque-tracking — every cheque leaf across all cheque books: find one cheque, see where it stands. */
export default function ChequeTrackingPage() {
  const { company } = useCompanyContext();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [bankAccount, setBankAccount] = useState(params.get("bank") ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 300); return () => clearTimeout(t); }, [text]);
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (q) next.set("q", q); else next.delete("q");
    if (status) next.set("status", status); else next.delete("status");
    setParams(next, { replace: true });
    setLimit(PAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status]);

  const { data: accounts } = useFrappeGetDocList<{ name: string; account_name: string; bank: string }>("Bank Account", {
    fields: ["name", "account_name", "bank"] as never, filters: [...companyFilter(company), ["is_company_account", "=", 1]] as never, limit: 100,
  });
  const args = { company: company ?? "", q, status, bank_account: bankAccount, from_date: from, to_date: to, start: 0, limit };
  const { data, isLoading, isValidating, mutate } = useFrappeGetCall<{ message: Result }>(
    "mm_core.cheques.search_cheques", args, `mm_core.cheques.search.${JSON.stringify(args)}`, { keepPreviousData: true },
  );
  const r = (data as unknown as { message?: Result })?.message;
  const allCount = Object.values(r?.counts ?? {}).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Cheque Tracking" subtitle="Find any cheque across all cheque books — where it went, how much, and whether the bank has paid it"
        icon={<ScanSearch className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Link to="/accounting/cheque-books" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"><NotebookTabs className="h-4 w-4" /> Cheque books</Link>
            <Button variant="outline" onClick={() => void mutate()} disabled={isValidating}><RefreshCw className={cn("h-4 w-4", isValidating && "animate-spin")} /> Refresh</Button>
          </div>
        } />

      <ChequeInsights company={company} bankAccount={bankAccount} status={status} onStatus={setStatus} onBank={setBankAccount} />

      <Card className="space-y-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="chq-search" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Cheque no, payee, voucher no or amount…"
            className="h-11 pl-9 text-base" aria-label="Search cheques" />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1"><label htmlFor="chq-bank" className="text-[11px] text-muted-foreground">Bank account</label>
            <Select id="chq-bank" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="h-8 w-60 text-xs">
              <option value="">All bank accounts</option>
              {(accounts ?? []).map((a) => <option key={a.name} value={a.name}>{a.account_name} · {a.bank}</option>)}
            </Select></div>
          <div className="flex flex-col gap-1"><label htmlFor="chq-from" className="text-[11px] text-muted-foreground">Issued from</label>
            <Input id="chq-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40 text-xs" /></div>
          <div className="flex flex-col gap-1"><label htmlFor="chq-to" className="text-[11px] text-muted-foreground">To</label>
            <Input id="chq-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40 text-xs" /></div>
          {r ? <div className="ml-auto text-xs text-muted-foreground">Issued / cleared value: <span className="font-semibold text-foreground">{formatMoney(r.issued_amount)}</span></div> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setStatus("")}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium", !status ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            All · {allCount}</button>
          {STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => setStatus(status === s ? "" : s)} title={HINT[s]}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium", status === s ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
              {s} · {r?.counts[s] ?? 0}</button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {isLoading && !r ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9" />)}</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Cheque No</th><th className="px-3 py-2 text-left">Leaf Status</th><th className="px-3 py-2 text-left">Bank / Book</th>
                  <th className="px-3 py-2 text-left">Issued</th><th className="px-3 py-2 text-left">Issued To</th><th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">Voucher</th><th className="px-3 py-2 text-left">Cleared</th><th className="px-3 py-2 text-left">Reason</th>
                </tr>
              </thead>
              <tbody>
                {(r?.rows ?? []).length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-12 text-center text-sm text-muted-foreground">{q ? `No cheque matches “${q}”.` : "No cheques yet — add a cheque book."}</td></tr>
                ) : r!.rows.map((l) => (
                  <tr key={`${l.book}|${l.cheque_no}`} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-sm font-semibold tabular-nums">{l.cheque_no}</td>
                    <td className="px-3 py-2"><span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", TONE[l.status])} title={HINT[l.status]}>{l.status}</span></td>
                    <td className="px-3 py-2 text-xs">{l.bank ?? l.bank_account}
                      <DocLink doctype="Cheque Book" name={l.book} className="block text-[10px] text-muted-foreground hover:underline">{l.book} · leaf {l.sno}</DocLink></td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{l.issue_date ? formatDate(l.issue_date) : "—"}</td>
                    <td className="px-3 py-2 text-xs">{l.party && l.party_type ? <DocLink doctype={l.party_type} name={l.party} className="hover:underline">{l.party_name || l.party}</DocLink> : (l.party_name || "—")}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{l.amount ? formatMoney(l.amount) : ""}</td>
                    <td className="px-3 py-2 text-xs">{l.voucher_no && l.voucher_type ? <DocLink doctype={l.voucher_type} name={l.voucher_no} className="font-medium text-primary hover:underline">{l.voucher_no}</DocLink> : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{l.clearance_date ? formatDate(l.clearance_date) : ""}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground" title={l.cancel_reason ?? ""}>{l.cancel_reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {r && r.total > r.rows.length && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Showing {r.rows.length} of {r.total}
            <Button size="sm" variant="outline" onClick={() => setLimit((n) => n + PAGE)} disabled={isValidating}>Show more</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
