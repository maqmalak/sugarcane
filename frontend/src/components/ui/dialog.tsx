import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

// Open dialogs, oldest first. A dialog can be opened from inside another one (e.g. the "+" quick-create
// on a Link field inside a create/edit form), so only the TOPMOST reacts to Escape, and page scroll is
// only unlocked once the LAST one closes.
const openDialogStack: symbol[] = [];

/**
 * Accessible modal dialog. Renders into a portal, closes on Esc / overlay
 * click, supports focus. Lightweight, dependency-free.
 */
export function Dialog({ open, onClose, title, description, children, className, size = "md" }: DialogProps) {
  // Callers mostly pass an inline `onClose`, whose identity changes on every parent render — keep it in a
  // ref so the effect below depends on `open` only. Otherwise each parent re-render would pop and re-push
  // this dialog, moving it above a dialog opened later (and Escape would then close the wrong one).
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open) return;
    const id = Symbol("dialog");
    openDialogStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openDialogStack[openDialogStack.length - 1] === id) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = openDialogStack.indexOf(id);
      if (i !== -1) openDialogStack.splice(i, 1);
      if (openDialogStack.length === 0) document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 mt-10 w-full animate-fade-in overflow-hidden rounded-xl border border-border bg-card shadow-2xl ring-1 ring-black/5 dark:ring-white/10 sm:mt-16",
          "dark:border-white/10 dark:bg-card dark:shadow-[0_24px_80px_rgb(0_0_0_/_0.6)]",
          sizeClasses[size],
          className,
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-border/60 bg-gradient-to-r from-primary/[0.07] via-transparent to-transparent px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 h-5 w-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              <div>
                {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
                {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}