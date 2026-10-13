import { X } from "lucide-react";

/** "Showing: <card> ✕" line shown under the stat cards while one of them is filtering the list/pipeline. */
export function ActiveCardFilter({ label, onClear }: { label: string | null; onClear: () => void }) {
  if (!label) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Showing</span>
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5">
        <span className="font-medium text-foreground">{label}</span>
        <button
          type="button"
          className="rounded-full p-0.5 hover:text-destructive"
          onClick={onClear}
          aria-label={`Remove ${label} filter`}
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    </div>
  );
}
