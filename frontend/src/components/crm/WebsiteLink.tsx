import { Globe } from "lucide-react";
import { cn } from "@/utils/cn";

/**
 * A website shown as a compact, clickable "example.com" line with a globe icon, for pipeline cards.
 * The card itself opens the record and can be dragged, so the link must do neither.
 */
export function WebsiteLink({ url, className }: { url: string; className?: string }) {
  return (
    <p className={cn("flex min-w-0 items-center gap-1.5 text-xs", className)}>
      <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <a
        href={/^https?:\/\//i.test(url) ? url : `https://${url}`}
        target="_blank"
        rel="noreferrer"
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onDragStart={(e) => e.preventDefault()}
        className="min-w-0 truncate text-primary hover:underline"
      >
        {url.replace(/^https?:\/\//i, "")}
      </a>
    </p>
  );
}
