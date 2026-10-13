import type { ReactNode } from "react";
import { Plus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}) {
  const IconCmp = Icon ?? (actionLabel ? Plus : undefined);
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {IconCmp && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <IconCmp className="h-6 w-6" />
        </div>
      )}
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" onClick={onAction}>
          {!Icon && <Plus className="h-4 w-4" />} {actionLabel}
        </Button>
      )}
      {children}
    </div>
  );
}