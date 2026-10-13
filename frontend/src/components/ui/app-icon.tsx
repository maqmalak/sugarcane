import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/** Glossy gradient per hue — full class strings so Tailwind keeps them. */
export const ICON_GRADIENT: Record<string, string> = {
  blue: "from-blue-400 to-blue-600 shadow-blue-500/40", violet: "from-violet-400 to-violet-600 shadow-violet-500/40",
  fuchsia: "from-fuchsia-400 to-fuchsia-600 shadow-fuchsia-500/40", red: "from-red-400 to-red-600 shadow-red-500/40",
  teal: "from-teal-400 to-teal-600 shadow-teal-500/40", amber: "from-amber-300 to-amber-500 shadow-amber-500/40",
  green: "from-green-400 to-green-600 shadow-green-500/40", orange: "from-orange-400 to-orange-600 shadow-orange-500/40",
  slate: "from-slate-400 to-slate-600 shadow-slate-500/40", stone: "from-stone-400 to-stone-600 shadow-stone-500/40",
  purple: "from-purple-400 to-purple-600 shadow-purple-500/40", emerald: "from-emerald-400 to-emerald-600 shadow-emerald-500/40",
  lime: "from-lime-400 to-lime-600 shadow-lime-500/40", pink: "from-pink-400 to-pink-600 shadow-pink-500/40",
  sky: "from-sky-400 to-sky-600 shadow-sky-500/40", indigo: "from-indigo-400 to-indigo-600 shadow-indigo-500/40",
  cyan: "from-cyan-400 to-cyan-600 shadow-cyan-500/40", rose: "from-rose-400 to-rose-600 shadow-rose-500/40",
  yellow: "from-yellow-300 to-yellow-500 shadow-yellow-500/40", gray: "from-gray-400 to-gray-600 shadow-gray-500/40",
};
/** Hue from a tile's `colorClass` ("bg-blue-500/10 …" → blue). */
export const hueOf = (colorClass: string) => /bg-(\w+)-500/.exec(colorClass)?.[1] ?? "slate";

/**
 * App-store style icon: rounded square, vivid gradient, soft top gloss, white line icon, coloured glow.
 * Lifts on hover of the nearest `.group` (the link / button around it).
 */
export function GlossyIcon({ icon: Icon, hue, size = "lg", badge }: { icon: LucideIcon; hue: string; size?: "lg" | "sm"; badge?: ReactNode }) {
  return (
    <span className="relative inline-flex shrink-0">
      <span className={cn("relative flex items-center justify-center overflow-hidden bg-gradient-to-b text-white shadow-lg ring-1 ring-inset ring-white/25 transition-all duration-200",
        "group-hover:-translate-y-1 group-hover:shadow-xl group-active:scale-95", ICON_GRADIENT[hue] ?? ICON_GRADIENT.slate,
        size === "lg" ? "h-[68px] w-[68px] rounded-[20px]" : "h-6 w-6 rounded-md")}>
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-white/0" />
        <Icon className={cn("relative drop-shadow-sm", size === "lg" ? "h-8 w-8" : "h-3.5 w-3.5")} strokeWidth={size === "lg" ? 2 : 2.25} />
      </span>
      {badge && <span className="absolute -right-1.5 -top-1.5 transition-transform duration-200 group-hover:-translate-y-1">{badge}</span>}
    </span>
  );
}
