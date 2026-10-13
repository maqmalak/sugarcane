import type { HTMLAttributes } from "react";
import { cn } from "@/sc/lib/utils";

const TONES = {
  gray: "bg-muted text-muted-foreground border-border",
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  red: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  orange: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", TONES[tone], className)} {...props} />;
}

const STATUS_TONE: Record<string, Tone> = {
  Available: "green", Reserved: "violet", Hold: "orange", Booked: "blue", Sold: "violet", "Possession Given": "blue", Blocked: "gray",
  Critical: "red", Normal: "gray", Paid: "green", Due: "amber", Overdue: "red", Unpaid: "amber", "Partly Paid": "orange", Draft: "gray", Cancelled: "gray",
  Open: "blue", Working: "amber", "Pending Review": "violet", Completed: "green", Scheduled: "blue", Urgent: "red", High: "orange",
  Medium: "amber", Low: "gray",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{status}</Badge>;
}
