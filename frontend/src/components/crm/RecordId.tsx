import { cn } from "@/utils/cn";

/** A record's Frappe `name` (ID) — e.g. "CRM-LEAD-2026-00012" — in a small monospace style for list columns and pipeline cards. */
export function RecordId({ name, className }: { name?: string | number | null; className?: string }) {
  if (name === undefined || name === null || name === "") return <span className="text-muted-foreground">—</span>;
  return <span className={cn("font-mono text-xs text-muted-foreground", className)}>{String(name)}</span>;
}
