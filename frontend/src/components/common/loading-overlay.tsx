import { Loader2 } from "lucide-react";

/**
 * Full-screen blocking overlay for fetches that can genuinely take a while
 * (e.g. a report running as a background "Prepared Report" job) — as
 * opposed to the inline `<Skeleton>` used for a normal first paint.
 */
export function LoadingOverlay({ show, label }: { show: boolean; label?: string }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" role="status" aria-live="polite">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div className="relative flex w-[min(440px,calc(100vw-2rem))] items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-lg dark:border-white/10">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{label || "Loading…"}</p>
          <p className="text-xs text-muted-foreground">Please wait a moment.</p>
        </div>
        <div className="hidden items-center gap-1 sm:flex">
          <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/40" style={{ animationDelay: "0ms" }} />
          <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/40" style={{ animationDelay: "150ms" }} />
          <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/40" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}
