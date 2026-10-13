import { cn } from "@/utils/cn";

export function Progress({ value, className, indicatorClassName }: {
  value: number;
  className?: string;
  indicatorClassName?: string;
}) {
  const safe = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full bg-primary transition-all duration-500", indicatorClassName)}
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}