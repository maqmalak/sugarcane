import { cn } from "@/utils/cn";
import { statusBadgeClass, statusDotClass } from "./status-color";

export function StatusBadge({ status, className }: { status?: string; className?: string }) {
  if (!status) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-input px-2 py-0.5 text-xs font-medium text-muted-foreground",
          className,
        )}
      >
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        statusBadgeClass(status),
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", statusDotClass(status))} aria-hidden="true" />
      {status}
    </span>
  );
}