import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Landmark, Scale, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/currency";

const fmt = (n: number) => formatNumber(Math.abs(n), 2);
const side = (n: number) => (n >= 0 ? "Dr" : "Cr");

function Tile({ label, value, sub, icon, tone, children, loading }: {
  label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; tone: "sky" | "emerald" | "amber" | "violet"; children?: ReactNode; loading?: boolean;
}) {
  const t = {
    sky: ["from-sky-500/15", "bg-sky-500/15 text-sky-600 dark:text-sky-400", "bg-sky-500"],
    emerald: ["from-emerald-500/15", "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", "bg-emerald-500"],
    amber: ["from-amber-500/15", "bg-amber-500/15 text-amber-600 dark:text-amber-400", "bg-amber-500"],
    violet: ["from-violet-500/15", "bg-violet-500/15 text-violet-600 dark:text-violet-400", "bg-violet-500"],
  }[tone];
  return (
    <Card className={cn("relative overflow-hidden bg-gradient-to-br to-transparent p-4", t[0])}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", t[1])}>{icon}</span>
      </div>
      {loading ? <Skeleton className="mt-2 h-7 w-3/4" /> : <div className="mt-1 truncate text-2xl font-bold tabular-nums">{value}</div>}
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
      {children}
      <span className={cn("absolute inset-x-0 bottom-0 h-0.5", t[2])} />
    </Card>
  );
}

/** General Ledger headline: opening → debits / credits → closing, with the debit-credit balance and net movement. */
export function LedgerSummary({ opening, debit, credit, closing, entries, loading, scope }: {
  opening: number; debit: number; credit: number; closing: number; entries: number; loading?: boolean; scope?: string;
}) {
  const move = debit - credit;
  const drShare = debit + credit ? (debit / (debit + credit)) * 100 : 50;
  const drCr = (n: number) => (
    <span>{fmt(n)} <span className={cn("text-sm font-semibold", n >= 0 ? "text-sky-600 dark:text-sky-400" : "text-amber-600 dark:text-amber-400")}>{side(n)}</span></span>
  );
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Opening balance" value={drCr(opening)} sub={scope ? `brought forward · ${scope}` : "brought forward"} icon={<Wallet className="h-4 w-4" />} tone="violet" loading={loading} />
      <Tile label="Total debit" value={fmt(debit)} sub={`${formatNumber(entries, 0)} entries in range`} icon={<ArrowDownRight className="h-4 w-4" />} tone="sky" loading={loading}>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted" title={`Debit ${drShare.toFixed(1)}% · Credit ${(100 - drShare).toFixed(1)}%`}>
          <div className="bg-sky-500" style={{ width: `${drShare}%` }} />
          <div className="bg-amber-500" style={{ width: `${100 - drShare}%` }} />
        </div>
      </Tile>
      <Tile label="Total credit" value={fmt(credit)} sub={<span className="inline-flex items-center gap-1"><Scale className="h-3 w-3" /> {Math.abs(move) < 0.005 ? "debits equal credits" : `net ${fmt(move)} ${side(move)} for the period`}</span>}
        icon={<ArrowUpRight className="h-4 w-4" />} tone="amber" loading={loading}>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="bg-sky-500" style={{ width: `${drShare}%` }} />
          <div className="bg-amber-500" style={{ width: `${100 - drShare}%` }} />
        </div>
      </Tile>
      <Tile label="Closing balance" value={drCr(closing)} sub={`${closing - opening >= 0 ? "▲" : "▼"} ${fmt(closing - opening)} vs opening`} icon={<Landmark className="h-4 w-4" />} tone="emerald" loading={loading} />
    </div>
  );
}
