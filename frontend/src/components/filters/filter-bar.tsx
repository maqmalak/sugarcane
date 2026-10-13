import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";

export interface FilterOption {
  value: string;
  label: string;
}

export interface ActiveFilter {
  id: string;
  label: string;
  value: string;
  display: string;
}

/** Compact horizontal filter bar with one or more filter controls + active chips. */
export function FilterBar({
  children,
  activeFilters = [],
  onRemove,
  className,
}: {
  children?: ReactNode;
  activeFilters?: ActiveFilter[];
  onRemove?: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {children && (
        <div className="overflow-x-auto">
          <div className="flex flex-nowrap items-center gap-2">{children}</div>
        </div>
      )}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFilters.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs"
            >
              <span className="text-muted-foreground">{f.label}:</span>
              <span className="font-medium">{f.display}</span>
              {onRemove && (
                <button
                  className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(f.id)}
                  aria-label={`Remove ${f.label} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}