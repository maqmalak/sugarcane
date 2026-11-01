/**
 * /procurement/cashier-summary — the TPT cash counters for a day: every cashier shift's opening → closing (counter, shift,
 * cashier, strong room in / out, cash paid, JazzCash, expected, counted, short / excess), totals by shift and by counter,
 * the A4 day summary and each shift's X / Z report; and an excess & short register over a date range, by cashier.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Banknote, CalendarDays, Printer, Scale, Smartphone, Wallet } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { C, ChartCard, DataTable, KpiCard } from "@/sc/components/analytics/kit";
import { Badge } from "@/sc/components/ui/badge";
import { Button } from "@/sc/components/ui/button";
import { Input } from "@/sc/components/ui/input";
import { get } from "@/sc/lib/api";
import { money, num } from "@/sc/lib/format";
import { printDailySummary, printShiftReport } from "@/sc/lib/shiftReport";
import { cn } from "@/sc/lib/utils";

const API = "sugarcane.api.v1.counter";
interface Row {
  name: string; counter: string; cashier: string; cashier_name: string; shift?: string; status: string; opened_at: string; closed_at?: string;
  opening_balance: number; received_total: number; returned_total: number; cash_paid_total: number; cash_paid_count: number;
  jazzcash_total: number; jazzcash_count: number; expected_balance: number; counted_balance: number; difference: number; close_note?: string;
}
interface Tot { opening_balance: number; received_total: number; returned_total: number; cash_paid_total: number; cash_paid_count: number;
  jazzcash_total: number; jazzcash_count: number; expected_balance: number; counted_balance: number; difference: number; sessions: number }
interface Summary { day: string; sessions: Row[]; by_counter: (Tot & { counter: string })[]; by_shift: (Tot & { shift: string; cashiers: string })[];
  total: Tot & { open: number; short: number; excess: number; strong_room_net: number } }
interface SE { rows: (Row & { difference_journal_entry?: string })[]; short: number; excess: number;
  by_cashier: { cashier: string; cashier_name: string; closes: number; all_closes: number; short: number; excess: number; short_n: number; excess_n: number; net: number }[] }

const today = () => new Date().toISOString().slice(0, 10);
const hm = (s?: string) => (s ? s.slice(11, 16) : "—");
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const Diff = ({ v, open }: { v: number; open?: boolean }) => open ? <span className="text-muted-foreground">—</span>
  : <span className={cn("font-semibold tabular-nums", v < 0 ? "text-red-600" : v > 0 ? "text-amber-600" : "text-emerald-600")}>{v < 0 ? "Short " : v > 0 ? "Excess " : ""}{money(Math.abs(v))}</span>;

export function CashierSummaryPage() {
  const [tab, setTab] = useState<"day" | "se">("day");
  const [day, setDay] = useState(today());
  const [from, setFrom] = useState(today().slice(0, 8) + "01");
  const [to, setTo] = useState(today());
  const { data } = useQuery({ queryKey: ["sc-cashier-day", day], enabled: tab === "day", refetchInterval: 30_000,
    queryFn: () => get<Summary>(`${API}.daily_summary`, { day }) });
  const { data: se } = useQuery({ queryKey: ["sc-cashier-se", from, to], enabled: tab === "se", queryFn: () => get<SE>(`${API}.short_excess`, { from_date: from, to_date: to }) });
  const t = data?.total;
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Cane procurement</p>
          <h1 className="text-2xl font-bold">Daily cashier summary</h1>
          <p className="text-sm text-muted-foreground">TPT cash counters — every shift's opening and closing, cash from / to the strong room, bilties paid, and excess / short.</p></div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link to="/procurement/counter" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><Wallet className="size-4" />Cash counter</Link>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {([["day", "Day summary"], ["se", "Excess & short"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn("rounded-full border px-4 py-1.5 text-sm font-medium", tab === k ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground")}>{l}</button>))}
        {tab === "day" ? (
          <span className="ml-auto flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground" />
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-9 w-40" />
            <Button size="sm" variant="outline" onClick={() => printDailySummary(day).catch((e) => toast.error(err(e)))}><Printer />Day summary (A4)</Button></span>
        ) : (
          <span className="ml-auto flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground" />
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" /><span className="text-muted-foreground">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" /></span>
        )}
      </div>

      {tab === "day" && t && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard icon={Wallet} label="Shifts" value={num(t.sessions)} color={C.blue} sub={t.open ? `${t.open} still open` : "all closed"} />
            <KpiCard icon={ArrowDownToLine} label="From strong room" value={money(t.received_total)} color={C.teal} sub={`returned ${money(t.returned_total)}`} />
            <KpiCard icon={Banknote} label="Cash paid" value={money(t.cash_paid_total)} color={C.green} sub={`${num(t.cash_paid_count)} bilties`} />
            <KpiCard icon={Smartphone} label="JazzCash" value={money(t.jazzcash_total)} color={C.red} sub={`${num(t.jazzcash_count)} bilties · not from tills`} />
            <KpiCard icon={Scale} label="Counted at close" value={money(t.counted_balance)} color={C.violet} sub={`expected ${money(t.expected_balance)}`} />
            <KpiCard icon={AlertTriangle} label="Short / excess" value={money(t.difference)} color={t.difference < 0 ? C.red : C.amber} sub={`short ${money(t.short)} · excess ${money(t.excess)}`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="By shift" bodyClass="h-auto">
              <DataTable rows={data.by_shift} rowKey={(r) => r.shift} dense cols={[
                { key: "shift", label: "Shift", value: (r) => r.shift, render: (r) => <b>{r.shift}</b> },
                { key: "cashiers", label: "Cashier(s)", value: (r) => r.cashiers },
                { key: "in", label: "+ In", align: "right", value: (r) => r.received_total, render: (r) => money(r.received_total) },
                { key: "paid", label: "Cash paid", align: "right", value: (r) => r.cash_paid_total, render: (r) => <>{money(r.cash_paid_total)} <span className="text-xs text-muted-foreground">({r.cash_paid_count})</span></> },
                { key: "jc", label: "JazzCash", align: "right", value: (r) => r.jazzcash_total, render: (r) => money(r.jazzcash_total) },
                { key: "diff", label: "Short / excess", align: "right", value: (r) => r.difference, render: (r) => <Diff v={r.difference} /> },
              ]} />
            </ChartCard>
            <ChartCard title="By counter" bodyClass="h-auto">
              <DataTable rows={data.by_counter} rowKey={(r) => r.counter} dense cols={[
                { key: "counter", label: "Counter", value: (r) => r.counter, render: (r) => <b>{r.counter}</b> },
                { key: "n", label: "Shifts", align: "right", value: (r) => r.sessions },
                { key: "paid", label: "Cash paid", align: "right", value: (r) => r.cash_paid_total, render: (r) => money(r.cash_paid_total) },
                { key: "jc", label: "JazzCash", align: "right", value: (r) => r.jazzcash_total, render: (r) => money(r.jazzcash_total) },
                { key: "count", label: "Counted", align: "right", value: (r) => r.counted_balance, render: (r) => money(r.counted_balance) },
                { key: "diff", label: "Short / excess", align: "right", value: (r) => r.difference, render: (r) => <Diff v={r.difference} /> },
              ]} />
            </ChartCard>
          </div>
          <ChartCard title="Shift opening → closing" sub="Every cashier shift that opened on the day" bodyClass="h-auto">
            <DataTable rows={data.sessions} rowKey={(r) => r.name} dense cols={[
              { key: "name", label: "Session", value: (r) => r.name, render: (r) => <><span className="font-mono text-xs font-semibold">{r.name}</span>{r.status === "Open" && <Badge tone="blue" className="ml-1">Open</Badge>}</> },
              { key: "counter", label: "Counter", value: (r) => r.counter },
              { key: "shift", label: "Shift", value: (r) => r.shift ?? "" },
              { key: "cashier", label: "Cashier", value: (r) => r.cashier_name },
              { key: "time", label: "Open → close", value: (r) => r.opened_at, render: (r) => `${hm(r.opened_at)} → ${hm(r.closed_at)}` },
              { key: "open", label: "Opening", align: "right", value: (r) => r.opening_balance, render: (r) => money(r.opening_balance) },
              { key: "in", label: "+ In / − Out", align: "right", value: (r) => r.received_total, render: (r) => <span className="text-xs"><span className="text-emerald-600">{money(r.received_total)}</span> / <span className="text-amber-600">{money(r.returned_total)}</span></span> },
              { key: "paid", label: "Cash paid", align: "right", value: (r) => r.cash_paid_total, render: (r) => <>{money(r.cash_paid_total)} <span className="text-xs text-muted-foreground">({r.cash_paid_count})</span></> },
              { key: "exp", label: "Expected", align: "right", value: (r) => r.expected_balance, render: (r) => money(r.expected_balance) },
              { key: "count", label: "Counted", align: "right", value: (r) => r.counted_balance, render: (r) => r.status === "Closed" ? <b>{money(r.counted_balance)}</b> : "—" },
              { key: "diff", label: "Short / excess", align: "right", value: (r) => r.difference, render: (r) => <span title={r.close_note}><Diff v={r.difference} open={r.status !== "Closed"} /></span> },
              { key: "jc", label: "JazzCash", align: "right", value: (r) => r.jazzcash_total, render: (r) => money(r.jazzcash_total) },
              { key: "rep", label: "", value: () => "", render: (r) => <Button size="sm" variant="outline" onClick={() => printShiftReport(r.name).catch((e) => toast.error(err(e)))}><Printer />{r.status === "Closed" ? "Z" : "X"} report</Button> },
            ]} />
          </ChartCard>
        </>
      )}

      {tab === "se" && se && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard icon={AlertTriangle} label="Shortages" value={money(se.short)} color={C.red} sub={`${se.rows.filter((r) => r.difference < 0).length} closes`} />
            <KpiCard icon={ArrowUpFromLine} label="Excesses" value={money(se.excess)} color={C.amber} sub={`${se.rows.filter((r) => r.difference > 0).length} closes`} />
            <KpiCard icon={Scale} label="Net" value={money(se.short + se.excess)} color={se.short + se.excess < 0 ? C.red : C.green} sub="posted to Cash Short and Excess" />
          </div>
          <ChartCard title="By cashier" sub="Closes with a difference out of all closes in the period" bodyClass="h-auto">
            <DataTable rows={se.by_cashier} rowKey={(r) => r.cashier} dense cols={[
              { key: "who", label: "Cashier", value: (r) => r.cashier_name, render: (r) => <b>{r.cashier_name}</b> },
              { key: "n", label: "Closes off", align: "right", value: (r) => r.closes, render: (r) => `${r.closes} of ${r.all_closes}` },
              { key: "short", label: "Short", align: "right", value: (r) => r.short, render: (r) => <span className="text-red-600">{money(Math.abs(r.short))} ({r.short_n})</span> },
              { key: "excess", label: "Excess", align: "right", value: (r) => r.excess, render: (r) => <span className="text-amber-600">{money(r.excess)} ({r.excess_n})</span> },
              { key: "net", label: "Net", align: "right", value: (r) => r.net, render: (r) => <Diff v={r.net} /> },
            ]} />
          </ChartCard>
          <ChartCard title="Every short / excess" bodyClass="h-auto">
            <DataTable rows={se.rows} rowKey={(r) => r.name} dense cols={[
              { key: "closed", label: "Closed", value: (r) => r.closed_at ?? "", render: (r) => (r.closed_at ?? "").slice(0, 16) },
              { key: "name", label: "Session", value: (r) => r.name, render: (r) => <span className="font-mono text-xs">{r.name}</span> },
              { key: "counter", label: "Counter · shift", value: (r) => r.counter, render: (r) => `${r.counter} · ${r.shift ?? ""}` },
              { key: "who", label: "Cashier", value: (r) => r.cashier_name },
              { key: "exp", label: "Expected", align: "right", value: (r) => r.expected_balance, render: (r) => money(r.expected_balance) },
              { key: "count", label: "Counted", align: "right", value: (r) => r.counted_balance, render: (r) => money(r.counted_balance) },
              { key: "diff", label: "Short / excess", align: "right", value: (r) => r.difference, render: (r) => <Diff v={r.difference} /> },
              { key: "note", label: "Reason", value: (r) => r.close_note ?? "" },
              { key: "je", label: "Posted", value: (r) => r.difference_journal_entry ?? "", render: (r) => <span className="font-mono text-xs">{r.difference_journal_entry}</span> },
              { key: "rep", label: "", value: () => "", render: (r) => <Button size="sm" variant="outline" onClick={() => printShiftReport(r.name).catch((e) => toast.error(err(e)))}><Printer />Z</Button> },
            ]} />
            {!se.rows.length && <p className="p-6 text-center text-sm text-muted-foreground">No short or excess in this period.</p>}
          </ChartCard>
        </>
      )}
    </div>
  );
}
