import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  breadcrumbs,
  badge,
  className,
}: {
  className?: string;
  title: string;
  /** Small pill next to the title (a count, a status). */
  badge?: ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex min-w-0 items-center gap-3.5">
        {icon && (
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-inset ring-white/20">
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
            <span className="relative">{icon}</span>
          </div>
        )}
        <div className="min-w-0">
          {breadcrumbs}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
            {badge}
          </div>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ActionGroup({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}

export { Button };