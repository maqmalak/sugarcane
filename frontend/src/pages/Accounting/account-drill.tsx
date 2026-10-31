import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Download, Search } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useChartOfAccounts } from "@/hooks/useAccounting";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";

/** One account line offered to the drill-down: its signed amount (in the head's natural direction) and a detail line. */
export interface DrillAccount {
  account: string;
  name?: string;
  amount: number;
  sub?: string;
}

export interface DrillSpec {
  title: string;
  /** Root types whose (non-group) accounts belong to the card, e.g. ["Asset"] or ["Income", "Expense"]. */
  rootTypes: string[];
  /** For combined cards (profit): flip the sign of these root types so the list nets correctly. */
  negate?: string[];
  /** Narrow to these account types (e.g. ["Payable"], ["Bank", "Cash"]). */
  accountTypes?: string[];
}

/**
 * Drill-down behind a report's summary card: the leaf accounts that make up the figure, largest first, with their
 * share, a search box, CSV export, and a link into the General Ledger for the same company and period.
 */
export function AccountDrillDialog({ spec, onClose, accounts, company, fromDate, toDate, currency }: {
  spec: DrillSpec | null; onClose: () => void; accounts: DrillAccount[]; company?: string | null; fromDate?: string; toDate?: string; currency?: string;
}) {
  const [q, setQ] = useState("");
  const { data: coa } = useChartOfAccounts(company ?? undefined, Boolean(spec));
  const meta = useMemo(() => new Map((coa ?? []).map((a) => [a.name, a])), [coa]);
  const rows = useMemo(() => {
    if (!spec) return [];
    return accounts
      .filter((r) => {
        const m = meta.get(r.account);
        return m && !m.is_group && spec.rootTypes.includes(String(m.root_type)) && (!spec.accountTypes || spec.accountTypes.includes(String(m.account_type)))
          && Math.abs(r.amount) >= 0.005;
      })
      .map((r) => ({ ...r, root: String(meta.get(r.account)?.root_type ?? ""), amount: spec.negate?.includes(String(meta.get(r.account)?.root_type)) ? -r.amount : r.amount }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [spec, accounts, meta]);
  const shown = rows.filter((r) => !q || `${r.account} ${r.name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.amount)));
  const money = (v: number) => formatMoney(v, currency || "PKR", { decimals: 2 });
  const glUrl = (acc: string) =>
    `/accounting/reports/general-ledger?${new URLSearchParams({ account: acc, ...(company ? { company } : {}), ...(fromDate ? { from_date: fromDate } : {}), ...(toDate ? { to_date: toDate } : {}) })}`;
  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["Account,Name,Root Type,Amount,Share %", ...rows.map((r) => [r.account, r.name, r.root, r.amount.toFixed(2), total ? ((r.amount / total) * 100).toFixed(2) : ""].map(esc).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${(spec?.title ?? "accounts").toLowerCase().replace(/\W+/g, "-")}.csv`;
    a.click();
  };
  return (
    <Dialog open={Boolean(spec)} onClose={() => { setQ(""); onClose(); }} title={spec?.title ?? ""} description={`${rows.length} accounts · ${fromDate ?? ""} → ${toDate ?? ""} · total ${money(total)}`} size="xl">
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search account…" className="h-8 pl-8 text-sm" />
        </div>
        <button type="button" onClick={exportCsv} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium hover:bg-muted">
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </div>
      {!coa ? <div className="h-40 animate-pulse rounded-lg bg-muted" /> : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No accounts with a balance here.</p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card text-[11px] uppercase tracking-wider text-muted-foreground shadow-[0_1px_0_hsl(var(--border))]">
              <tr><th className="px-4 py-2 text-left">Account</th><th className="w-[28%] px-3 py-2 text-left">Share</th><th className="px-3 py-2 text-right">Amount</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.account} className="group border-t border-border/60 hover:bg-muted/40">
                  <td className="px-4 py-2">
                    <p className="font-medium">{r.name || r.account}</p>
                    <p className="text-[11px] text-muted-foreground">{r.account}{spec && spec.rootTypes.length > 1 ? ` · ${r.root}` : ""}{r.sub ? ` · ${r.sub}` : ""}</p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-2 rounded-full bg-muted"><div className={cn("h-2 rounded-full", r.amount < 0 ? "bg-rose-500" : "bg-primary")} style={{ width: `${(Math.abs(r.amount) / max) * 100}%` }} /></div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{total ? `${((r.amount / total) * 100).toFixed(1)}% of total` : ""}</p>
                  </td>
                  <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", r.amount < 0 && "text-rose-600 dark:text-rose-400")}>{money(r.amount)}</td>
                  <td className="px-4 py-2 text-right">
                    <Link to={glUrl(r.account)} onClick={onClose} className="inline-flex items-center gap-1 text-xs font-medium text-primary opacity-70 hover:underline group-hover:opacity-100">
                      Ledger <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-card font-semibold shadow-[0_-1px_0_hsl(var(--border))]">
              <tr><td className="px-4 py-2" colSpan={2}>Total{q ? " (all accounts)" : ""}</td><td className="px-3 py-2 text-right tabular-nums">{money(total)}</td><td /></tr>
            </tfoot>
          </table>
        </div>
      )}
    </Dialog>
  );
}
