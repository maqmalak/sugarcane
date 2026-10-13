import { cn, asNumber } from "@/utils/cn";

export type PercentBarTone = "default" | "success" | "warning" | "danger" | "info";

const TONE: Record<PercentBarTone, string> = {
  default: "bg-primary",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
};

/** Pick a tone from the percentage value (0–100). */
export function toneFromPercent(value: number): PercentBarTone {
  if (value >= 100) return "success";
  if (value >= 75) return "info";
  if (value >= 40) return "warning";
  if (value > 0) return "danger";
  return "default";
}

/**
 * Compact percent bar gauge for tables and KPI rows.
 * Shows a horizontal bar + optional label (e.g. "82%").
 */
export function PercentBar({
  value,
  className,
  barClassName,
  showLabel = true,
  tone,
  size = "md",
}: {
  value?: number | string | null;
  className?: string;
  barClassName?: string;
  showLabel?: boolean;
  /** Force a tone; otherwise auto from value. */
  tone?: PercentBarTone;
  size?: "sm" | "md" | "lg";
}) {
  const pct = Math.max(0, Math.min(100, asNumber(value)));
  const resolved = tone ?? toneFromPercent(pct);
  // Never round up to "100%" — 99.86% delivered still has qty pending, so show "99.8%".
  const label = pct >= 100 || pct === Math.floor(pct) ? `${pct.toFixed(0)}%` : `${(Math.floor(pct * 10) / 10).toFixed(1)}%`;
  const heights = { sm: "h-1.5", md: "h-2", lg: "h-2.5" } as const;
  const widths = { sm: "w-16", md: "w-24", lg: "w-32" } as const;

  return (
    <div className={cn("flex items-center gap-2", className)} title={label}>
      <div className={cn("overflow-hidden rounded-full bg-muted", heights[size], widths[size], barClassName)}>
        <div
          className={cn("h-full rounded-full transition-all duration-500", TONE[resolved])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="min-w-[2.5rem] text-right text-xs tabular-nums text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  );
}
