import { Landmark, RefreshCw } from "lucide-react";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { useGLEntries } from "@/hooks/useGLEntries";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { humanizeError } from "@/services/frappe";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";

/**
 * Accounting Ledger panel — the GL Entries posted for one voucher (Purchase
 * Invoice, Purchase Receipt, ...). Mirrors ERPNext desk's "View > Accounting
 * Ledger" action. GL Entry is a normal, independently listable DocType, so
 * this reads it directly — no server-side helper needed.
 */
export function GLLedgerPanel({
  voucherType,
  voucherNo,
  title = "Ledger",
  description = "Accounting (GL) entries posted for this document",
}: {
  voucherType: string;
  voucherNo?: string;
  title?: string;
  description?: string;
}) {
  const { companyCurrency } = useCompanyContext();
  const { data, isLoading, error, mutate } = useGLEntries({ voucherType, voucherNo });
  const rows = data ?? [];
  const totalDebit = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit || 0), 0);

  return (
    <SectionCard
      title={title}
      description={description}
      actions={
        <Button size="sm" variant="outline" onClick={() => void mutate()} disabled={isLoading}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      }
    >
      {error ? (
        <p className="text-sm text-destructive">Failed to load ledger entries: {humanizeError(error)}</p>
      ) : rows.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Landmark className="h-3.5 w-3.5" />
          {isLoading ? "Loading…" : "No GL entries posted (document may still be a draft)."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Account</th>
                <th className="py-2 pr-3 font-medium">Against</th>
                <th className="py-2 pr-3 text-right font-medium">Debit</th>
                <th className="py-2 pr-3 text-right font-medium">Credit</th>
                <th className="py-2 text-right font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3 font-medium">{r.account}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{r.against}</td>
                  <td className="py-2 pr-3 text-right">{r.debit ? formatMoney(r.debit, companyCurrency) : "—"}</td>
                  <td className="py-2 pr-3 text-right">{r.credit ? formatMoney(r.credit, companyCurrency) : "—"}</td>
                  <td className="py-2 text-right text-xs text-muted-foreground">{formatDate(r.posting_date)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="py-2 pr-3" colSpan={2}>
                  Total
                </td>
                <td className="py-2 pr-3 text-right">{formatMoney(totalDebit, companyCurrency)}</td>
                <td className="py-2 pr-3 text-right">{formatMoney(totalCredit, companyCurrency)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
