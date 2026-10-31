import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useFrappeGetDocList } from "frappe-react-sdk";
import toast from "react-hot-toast";
import { CalendarCheck, CheckCheck, Landmark, RefreshCw, Save, Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { docUrl } from "@/app/doc-routes";
import { companyFilter, useCompanyContext } from "@/hooks/useCompanyContext";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";
import { formatDate, todayISO } from "@/utils/dates";

interface Entry {
  payment_document: string; payment_entry: string; against_account?: string; amount: string; posting_date: string;
  cheque_number?: string; cheque_date?: string; clearance_date?: string | null;
}

const monthStart = () => `${todayISO().slice(0, 8)}01`;

/** /accounting/bank-clearance — set the date each payment / journal entry cleared the bank (ERPNext's Bank Clearance). */
export default function BankClearancePage() {
  const { company } = useCompanyContext();
  const { data: accounts } = useFrappeGetDocList<{ name: string; account_name: string; bank: string; account: string; is_default?: number }>("Bank Account", {
    fields: ["name", "account_name", "bank", "account", "is_default"] as never,
    filters: [...companyFilter(company), ["is_company_account", "=", 1], ["disabled", "=", 0]] as never, limit: 200,
  });
  const [params] = useSearchParams();
  const [bankAccount, setBankAccount] = useState(params.get("bank_account") ?? "");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const [includeCleared, setIncludeCleared] = useState(false);
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const key = (e: Entry) => `${e.payment_document}|${e.payment_entry}`;
  // Preselect the default (else first) bank account, then load on every change — no extra click needed.
  useEffect(() => {
    if (!bankAccount && accounts?.length) setBankAccount((accounts.find((a) => a.is_default) ?? accounts[0]).name);
  }, [accounts, bankAccount]);
  useEffect(() => {
    if (!bankAccount) return;
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankAccount, from, to, includeCleared]);
  const load = async () => {
    if (!bankAccount) return toast.error("Choose a bank account");
    setBusy(true);
    try {
      const r = await getCall<{ message: Entry[] }>("mm_core.cheques.get_clearance_entries", { bank_account: bankAccount, from_date: from, to_date: to, include_reconciled: includeCleared ? 1 : 0 });
      const list = (r as unknown as { message?: Entry[] })?.message ?? [];
      setRows(list);
      setOriginal(Object.fromEntries(list.map((e) => [key(e), e.clearance_date ?? ""])));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };
  const changed = useMemo(() => (rows ?? []).filter((e) => (e.clearance_date ?? "") !== (original[key(e)] ?? "")), [rows, original]);
  const save = async () => {
    setBusy(true);
    try {
      const r = await postCall<{ message: { updated: number } }>("mm_core.cheques.update_clearance", {
        bank_account: bankAccount, from_date: from, to_date: to,
        rows: JSON.stringify(changed.map((e) => ({ payment_document: e.payment_document, payment_entry: e.payment_entry, clearance_date: e.clearance_date || null }))),
      });
      toast.success(`Clearance saved for ${(r as unknown as { message?: { updated: number } })?.message?.updated ?? changed.length} entr${changed.length === 1 ? "y" : "ies"}`);
      await load();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };
  const setDate = (k: string, v: string) => setRows((rs) => (rs ?? []).map((e) => (key(e) === k ? { ...e, clearance_date: v } : e)));
  const amount = (e: Entry) => Number(String(e.amount ?? "").replace(/[^0-9.-]/g, "")) || 0;
  const uncleared = (rows ?? []).filter((e) => !e.clearance_date);

  return (
    <div className="space-y-5">
      <PageHeader title="Bank Clearance" subtitle="Record the date each cheque or transfer cleared the bank — this drives the bank reconciliation statement"
        icon={<CalendarCheck className="h-5 w-5" />}
        actions={<Link to="/reports/run/bank-reconciliation-statement" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"><Landmark className="h-4 w-4" /> Reconciliation statement</Link>} />

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex min-w-60 flex-1 flex-col gap-1"><label htmlFor="bc-acc" className="text-xs text-muted-foreground">Bank account</label>
          <Select id="bc-acc" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="h-9 text-sm">
            <option value="">Choose…</option>
            {(accounts ?? []).map((a) => <option key={a.name} value={a.name}>{a.account_name} · {a.bank}</option>)}
          </Select></div>
        <div className="flex flex-col gap-1"><label htmlFor="bc-from" className="text-xs text-muted-foreground">From</label><Input id="bc-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" /></div>
        <div className="flex flex-col gap-1"><label htmlFor="bc-to" className="text-xs text-muted-foreground">To</label><Input id="bc-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" /></div>
        <label className="flex h-9 items-center gap-2 text-sm"><input id="bc-inc" type="checkbox" checked={includeCleared} onChange={(e) => setIncludeCleared(e.target.checked)} /> Include cleared</label>
        <Button variant="outline" onClick={() => void load()} disabled={busy || !bankAccount}><Search className="h-4 w-4" /> Refresh</Button>
      </Card>

      {rows && (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="text-sm"><span className="font-semibold">{rows.length}</span> entries · <span className="text-amber-600 dark:text-amber-400">{uncleared.length} not cleared</span>
              {changed.length > 0 && <span className="ml-2 rounded bg-primary/10 px-1.5 text-xs text-primary">{changed.length} changed</span>}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={!uncleared.length} onClick={() => setRows((rs) => (rs ?? []).map((e) => (e.clearance_date ? e : { ...e, clearance_date: e.cheque_date && e.cheque_date > todayISO() ? e.cheque_date : todayISO() })))}>
                <CheckCheck className="h-3.5 w-3.5" /> Clear all today</Button>
              <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy}><RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} /> Reload</Button>
              <Button size="sm" onClick={() => void save()} disabled={busy || !changed.length}><Save className="h-3.5 w-3.5" /> Save clearance</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-3 py-2 text-left">Voucher</th><th className="px-3 py-2 text-left">Posted</th><th className="px-3 py-2 text-left">Against</th>
                  <th className="px-3 py-2 text-left">Cheque / Ref</th><th className="px-3 py-2 text-left">Cheque date</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-left">Clearance date</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    {includeCleared ? "No bank entries for this account in this period." : (
                      <>Nothing waiting to be cleared for this account between {formatDate(from)} and {formatDate(to)}.
                        <span className="mt-2 flex justify-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => setIncludeCleared(true)}>Show cleared entries</Button>
                          <Button size="sm" variant="outline" onClick={() => setFrom(`${new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0)}-07-01`)}>From start of fiscal year</Button>
                        </span></>
                    )}
                  </td></tr>
                ) : rows.map((e) => {
                  const u = docUrl(e.payment_document, e.payment_entry);
                  const k = key(e);
                  return (
                    <tr key={k} className={cn("border-t border-border", (e.clearance_date ?? "") !== (original[k] ?? "") && "bg-primary/[0.04]")}>
                      <td className="px-3 py-1.5 text-xs">{u.external ? <a href={u.href} className="font-medium hover:underline">{e.payment_entry}</a> : <Link to={u.href} className="font-medium hover:underline">{e.payment_entry}</Link>}
                        <span className="block text-[10px] text-muted-foreground">{e.payment_document}</span></td>
                      <td className="px-3 py-1.5 text-xs">{formatDate(e.posting_date)}</td>
                      <td className="max-w-[220px] truncate px-3 py-1.5 text-xs text-muted-foreground" title={e.against_account}>{e.against_account}</td>
                      <td className="px-3 py-1.5 text-xs font-medium">{e.cheque_number || "—"}</td>
                      <td className="px-3 py-1.5 text-xs">{e.cheque_date ? formatDate(e.cheque_date) : "—"}</td>
                      <td className={cn("px-3 py-1.5 text-right text-xs tabular-nums", amount(e) < 0 && "text-rose-600")}>{formatMoney(amount(e))}</td>
                      <td className="px-3 py-1.5"><Input type="date" value={e.clearance_date ?? ""} onChange={(ev) => setDate(k, ev.target.value)} className="h-8 w-40 text-xs" aria-label={`Clearance date for ${e.payment_entry}`} /></td>
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
