import { cn } from "@/utils/cn";
import { Button } from "./button";
import { Dialog } from "./dialog";

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Reusable confirmation dialog with a destructive option. */
export function ConfirmDialog({
  open,
  title = "Are you sure?",
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  loading,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <div className="space-y-4">
        {title && <h2 className="text-base font-semibold">{title}</h2>}
        <p className="text-sm text-muted-foreground">
          {description ?? "This action cannot be undone."}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="neutral" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "save"}
            className={destructive ? "rounded-lg shadow-md shadow-destructive/25" : undefined}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function cnDialog(className?: string) {
  return cn(className);
}