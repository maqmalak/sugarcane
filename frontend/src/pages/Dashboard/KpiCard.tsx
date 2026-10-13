import type { LucideIcon } from "lucide-react";
import { LineChart as RCLineChart, Line, ResponsiveContainer } from "recharts";
import { cn } from "@/utils/cn";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "destructive" | "info" | "violet";
  /** Color the value text itself by `tone` (not just the icon badge) — opt-in so existing cards keep their look. */
  colorValue?: boolean;
  /** Ordered series of numbers (e.g. monthly values) rendered as a tiny trend line under the value — opt-in, needs 2+ points. */
  sparkline?: number[];
  loading?: boolean;
  onClick?: () => void;
  /** Override the label's default `text-xs font-medium` (e.g. a heavier weight for a denser card grid). */
  labelClassName?: string;
  /** Override the value's default `text-2xl font-semibold` (e.g. a smaller size for a denser card grid). */
  valueClassName?: string;
}

const toneClasses: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
};

const toneTextClasses: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  destructive: "text-destructive",
  info: "text-sky-600 dark:text-sky-400",
  violet: "text-violet-600 dark:text-violet-400",
};

const toneStroke: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "hsl(var(--primary))",
  success: "#10b981",
  warning: "#f59e0b",
  destructive: "hsl(var(--destructive))",
  info: "#0ea5e9",
  violet: "#8b5cf6",
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  colorValue,
  sparkline,
  loading,
  onClick,
  labelClassName,
  valueClassName,
}: KpiCardProps) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-4 transition-shadow",
        onClick &&
          "cursor-pointer hover-lift hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("truncate text-xs font-medium text-muted-foreground", labelClassName)}>{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className={cn("mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums", colorValue && toneTextClasses[tone], valueClassName)}>
              {value}
            </p>
          )}
          {hint && !loading && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
          {!loading && sparkline && sparkline.length > 1 && (
            <div className="mt-2 h-8 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RCLineChart data={sparkline.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                  <Line type="monotone" dataKey="v" stroke={toneStroke[tone]} strokeWidth={1.75} dot={false} isAnimationActive={false} />
                </RCLineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        {Icon && (
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </Card>
  );
}