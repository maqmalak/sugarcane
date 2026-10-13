/** "Back to …" for pages opened from another page with ?from=<path>: returns to exactly where the user was. */
import { ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/sc/lib/utils";

/** Keep ?from (and other params) when a page rewrites its own query string. */
export function keepFrom(params: URLSearchParams, next: Record<string, string>): Record<string, string> {
  const from = params.get("from");
  return from ? { ...next, from } : next;
}

export function BackLink({ className }: { className?: string }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const from = params.get("from");
  if (!from || !from.startsWith("/")) return null;
  return (
    <button type="button" onClick={() => navigate(from)}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card/95 px-2.5 text-xs font-semibold shadow-sm backdrop-blur hover:bg-accent", className)}>
      <ArrowLeft className="size-3.5" />Back
    </button>
  );
}
