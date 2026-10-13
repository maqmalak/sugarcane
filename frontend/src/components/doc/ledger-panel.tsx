import useSWR from "swr";
import { Link } from "react-router-dom";
import { Boxes, Scale } from "lucide-react";
import { Card } from "@/components/ui/card";
import { docUrl } from "@/app/doc-routes";
import { postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { formatMoney, formatNumber } from "@/utils/currency";

interface Ledgers {
  gl: { account: string; party?: string; debit: number; credit: number; against_voucher_type?: string; against_voucher?: string; cost_center?: string }[];
  sle: { item_code: string; warehouse: string; actual_qty: number; valuation_rate: number; stock_value_difference: number; qty_after_transaction: number; stock_uom?: string }[];
  debit: number; credit: number; stock_value: number;
}
const money = (v: number) => formatMoney(v, "PKR", { decimals: 2 });

/** "Ledger" tab for any submitted voucher: the GL entries (with a balance check) and the stock ledger it posted. */
export function LedgerPanel({ doctype, name, docstatus }: { doctype: string; name?: string; docstatus?: number }) {
  const { data, isLoading } = useSWR(name && docstatus === 1 ? `ledgers:${doctype}:${name}` : null,
    () => postCall<Ledgers>("sugarcane.api.v1.ledger.get_voucher_ledgers", { voucher_type: doctype, voucher_no: name }), { revalidateOnFocus: false });
  if (!name || docstatus !== 1) return <Card className="p-8 text-center text-sm text-muted-foreground">Nothing posted yet — the accounting and stock entries appear here once the document is submitted.</Card>;
  if (isLoading && !data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (!data || (!data.gl.length && !data.sle.length)) return <Card className="p-8 text-center text-sm text-muted-foreground">This document posted no ledger entries.</Card>;
  const balanced = Math.abs(data.debit - data.credit) < 0.01;
  return (
    <div className="space-y-4">
      {data.gl.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <p className="text-sm font-semibold">General ledger</p>
            <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", balanced ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/15 text-rose-700")}>
              <Scale className="h-3.5 w-3.5" /> {balanced ? "Balanced" : "Out of balance"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-4 py-2 text-left">Account</th><th className="px-3 py-2 text-left">Against</th><th className="px-3 py-2 text-left">Cost Center</th><th className="px-3 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr>
              </thead>
              <tbody>
                {data.gl.map((g, i) => (
                  <tr key={i} className="border-t border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-2"><p className="font-medium">{g.account}</p>{g.party && <p className="text-[11px] text-muted-foreground">{g.party}</p>}</td>
                    <td className="px-3 py-2 text-xs">{g.against_voucher ? <Link className="text-primary hover:underline" to={docUrl(g.against_voucher_type ?? "", g.against_voucher).href}>{g.against_voucher}</Link> : "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{g.cost_center ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.debit ? money(g.debit) : ""}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{g.credit ? money(g.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border font-semibold">
                <tr><td className="px-4 py-2" colSpan={3}>Total</td><td className="px-3 py-2 text-right tabular-nums">{money(data.debit)}</td><td className="px-4 py-2 text-right tabular-nums">{money(data.credit)}</td></tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
      {data.sle.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3"><Boxes className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Stock ledger</p>
            <span className="ml-auto text-xs text-muted-foreground">Stock value change {money(data.stock_value)}</span></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-4 py-2 text-left">Item</th><th className="px-3 py-2 text-left">Warehouse</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Valuation</th><th className="px-3 py-2 text-right">Value Change</th><th className="px-4 py-2 text-right">Balance Qty</th></tr>
              </thead>
              <tbody>
                {data.sle.map((s, i) => (
                  <tr key={i} className="border-t border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{s.item_code}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{s.warehouse}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", s.actual_qty < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>{formatNumber(s.actual_qty, 2)} {s.stock_uom ?? ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(s.valuation_rate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(s.stock_value_difference)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(s.qty_after_transaction, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
