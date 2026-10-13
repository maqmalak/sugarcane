import * as React from "react";
import { cn } from "@/utils/cn";

type BadgeVariant = "default" | "primary" | "secondary" | "success" | "warning" | "destructive" | "outline" | "info";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-secondary text-secondary-foreground",
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary text-secondary-foreground",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  outline: "border border-input text-foreground",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({ className, variant = "default", dot, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Map an ERPNext status string to a badge variant. */
export function statusVariant(status?: string): BadgeVariant {
  const s = (status ?? "").toLowerCase();
  if (["closed", "completed", "cancelled", "delivered", "cleared", "confirmed"].some((x) => s.includes(x)))
    return "success";
  if (["draft", "planned", "booking", "open", "pending"].some((x) => s.includes(x)))
    return "secondary";
  if (["in transit", "arrived", "stuffing", "shipped", "produced", "active", "processing"].some((x) => s.includes(x)))
    return "info";
  if (["delayed", "overdue", "expired", "cancelled"].some((x) => s.includes(x))) return "destructive";
  if (["in production", "ready to ship", "on hold", "confirmed"].some((x) => s.includes(x)))
    return "warning";
  return "default";
}