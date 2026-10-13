import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Slide-over panel from the right (stays on top of the map / list). */
export function Sheet({ open, onOpenChange, title, description, children, className }: SheetProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <D.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background shadow-2xl sm:max-w-xl md:max-w-2xl",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b p-4">
            <div>
              <D.Title className="text-lg font-semibold">{title}</D.Title>
              {description && <D.Description className="text-sm text-muted-foreground">{description}</D.Description>}
            </div>
            <D.Close className="rounded-md p-1 hover:bg-accent" aria-label="Close">
              <X className="size-5" />
            </D.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Dialog({ open, onOpenChange, title, children }: Omit<SheetProps, "className" | "description">) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 max-h-[90vh] overflow-y-auto -translate-y-1/2 rounded-lg border bg-card p-5 shadow-2xl">
          <D.Title className="mb-3 text-lg font-semibold">{title}</D.Title>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
