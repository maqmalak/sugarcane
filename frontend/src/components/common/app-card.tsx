import { useRef, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/utils/cn";
import type { AppTile } from "@/app/apps";

/** Pull just the `text-*`/`dark:text-*` tokens out of a tile's colorClass, so a small dot can reuse its accent color via `bg-current`. */
function accentTextTokens(colorClass: string): string {
  return colorClass
    .split(" ")
    .filter((c) => c.startsWith("text-") || c.startsWith("dark:text-"))
    .join(" ");
}

/**
 * Hoverable app-launcher card used on the post-login Desktop grid.
 *
 * Beyond the lift/glow, two extra touches make it feel alive:
 * - a cursor-tracking radial spotlight (position set directly on the DOM
 *   node via a ref on `mousemove`, not React state, so it doesn't re-render
 *   on every pixel of mouse movement)
 * - a one-shot diagonal sheen that sweeps across on hover-in (CSS animation
 *   re-triggered each time via `group-hover:animate-card-sheen`)
 *
 * Layout: icon tile + title + tagline, a two-line description, up to four
 * feature chips (curated in apps.ts, or live doctype names for the module),
 * and an "Open …" footer.
 */
export function AppCard({ app, features }: { app: AppTile; features?: string[] }) {
  const Icon = app.icon;
  const spotRef = useRef<HTMLSpanElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (spotRef.current) {
      spotRef.current.style.background = `radial-gradient(140px circle at ${x}% ${y}%, hsl(var(--primary) / 0.22), transparent 72%)`;
    }
  };

  return (
    <Link
      to={app.to}
      onMouseMove={handleMouseMove}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card will-change-transform",
        "shadow-sm transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
        "hover:-translate-y-1.5 hover:scale-[1.015] hover:border-primary/40 hover:shadow-xl",
        "dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-xl dark:shadow-[0_18px_60px_rgb(2_6_23_/_0.4)]",
        "dark:hover:border-primary/50 dark:hover:shadow-[0_0_0_4px_rgb(20_184_166_/_0.32),0_24px_70px_rgb(2_6_23_/_0.45)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      {/* Cursor-tracking spotlight */}
      <span
        ref={spotRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      {/* One-shot diagonal sheen sweep */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-xl">
        <span className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 group-hover:animate-card-sheen group-hover:opacity-100 dark:via-white/20" />
      </span>

      {/* Header — icon tile, title and tagline */}
      <div className="relative z-10 flex items-start gap-3 px-4 pt-4">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/10 transition-all duration-300 ease-out",
            "group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-[0_0_20px_2px_hsl(var(--primary)/0.30)]",
            app.colorClass,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-tight tracking-tight">{app.label}</h3>
          {app.tagline && (
            <p className={cn("mt-0.5 truncate text-[11px] font-medium uppercase tracking-wider", accentTextTokens(app.colorClass))}>{app.tagline}</p>
          )}
        </div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col px-4 pb-3 pt-2.5">
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{app.description}</p>
        {features && features.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {features.slice(0, 4).map((f) => (
              <li
                key={f}
                className="max-w-full truncate rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10.5px] font-medium text-foreground/80 transition-colors group-hover:border-primary/30 dark:border-white/10 dark:bg-white/5"
              >
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 mt-auto flex items-center justify-between border-t border-border/60 px-4 py-2 text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-primary dark:border-white/10">
        <span>Open {app.label}</span>
        <ArrowRight className="h-3.5 w-3.5 -translate-x-1 transition-transform duration-300 ease-out group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
    </Link>
  );
}
