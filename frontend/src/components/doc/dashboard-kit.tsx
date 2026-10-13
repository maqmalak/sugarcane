import type { ReactNode } from "react";
import { StatCard, type StatCardProps } from "@/components/common/stat-card";
import { cn } from "@/utils/cn";

/** Responsive grid of KPI cards. */
export function KpiGrid({ items, className }: { items: StatCardProps[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6", className)}>
      {items.map((it) => (
        <StatCard key={it.label} {...it} />
      ))}
    </div>
  );
}

/**
 * Ranked horizontal bars — "top N by value". Lighter than a chart and reads at a glance.
 * `format` renders the right-hand number; bar length is relative to the largest row.
 */
export function BarList({
  rows,
  format = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 1 }),
  tone = "bg-primary",
  empty = "Nothing to show yet.",
}: {
  rows: { label: string; value: number; hint?: ReactNode }[];
  format?: (v: number) => ReactNode;
  tone?: string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{format(r.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full transition-all duration-500", tone)} style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
          {r.hint && <div className="text-xs text-muted-foreground">{r.hint}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Aggregate rows → bucket by month ("2026-07" → "Jul 26"), summing the given keys. */
export function bucketByMonth<T extends Record<string, any>>(rows: T[], dateKey: string, sumKeys: string[]) {
  const buckets = new Map<string, Record<string, number>>();
  rows.forEach((r) => {
    const d = r[dateKey];
    if (!d) return;
    const key = String(d).slice(0, 7);
    const b = buckets.get(key) ?? Object.fromEntries(sumKeys.map((k) => [k, 0]));
    sumKeys.forEach((k) => (b[k] += Number(r[k] ?? 0)));
    buckets.set(key, b);
  });
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const [y, m] = key.split("-");
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleString(undefined, { month: "short", year: "2-digit" });
      return { month: label, ...v };
    });
}
