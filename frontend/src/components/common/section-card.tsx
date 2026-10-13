import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** A titled section card used across detail pages. */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      {(title || actions) && (
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div>
            {title && <h3 className="text-sm font-semibold">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </CardHeader>
      )}
      <CardContent
        className={cn("px-5 pb-5", title ? "pt-4" : "pt-5", contentClassName)}
      >
        {children}
      </CardContent>
    </Card>
  );
}