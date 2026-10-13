import { Check, X } from "lucide-react";
import { cn } from "@/utils/cn";

/**
 * Vertical/horizontal lifecycle timeline for shipment documents.
 * Steps up to and including `currentIndex` are marked complete.
 */
export function StatusTimeline({
  steps,
  currentIndex,
  className,
}: {
  steps: readonly string[];
  /** Index of the current step; -1 = not started, steps.length = all done. */
  currentIndex: number;
  className?: string;
}) {
  return (
    <ol className={cn("flex flex-col gap-0", className)} aria-label="Status timeline">
      {steps.map((step, i) => {
        const done = i <= currentIndex;
        const isCurrent = i === currentIndex;
        const last = i === steps.length - 1;
        return (
          <li key={step} className="relative flex gap-3 pb-6 last:pb-0">
            {/* Connector */}
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5",
                  i < currentIndex ? "bg-primary" : "bg-border",
                )}
              />
            )}
            {/* Node */}
            <span
              className={cn(
                "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold",
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground",
                isCurrent && "ring-2 ring-primary/30 ring-offset-1",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            {/* Label */}
            <div className="pt-1">
              <p className={cn("text-sm font-medium", done ? "text-foreground" : "text-muted-foreground")}>{step}</p>
              {isCurrent && <p className="text-xs text-muted-foreground">Current stage</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Horizontal compact variant for mobile-friendly summaries. */
export function StatusTimelineCompact({
  steps,
  currentIndex,
}: {
  steps: readonly string[];
  currentIndex: number;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1" aria-label="Status timeline">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center gap-1">
          <span
            className={cn(
              "whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
              i <= currentIndex
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {step}
          </span>
          {i < steps.length - 1 && (
            <X className="hidden" aria-hidden />
          )}
          {i < steps.length - 1 && <span aria-hidden className="h-px w-4 shrink-0 bg-border" />}
        </div>
      ))}
    </div>
  );
}
