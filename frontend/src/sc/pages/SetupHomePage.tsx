/** Sugar setup (/setup): every master and setting, grouped, with record counts and a quick health check. */
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Boxes, Factory, House, MapPinned, Sprout, Target, Truck, Users, Building2, Route, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get } from "@/sc/lib/api";
import { num } from "@/sc/lib/format";
import { docBase, docsOf } from "@/sc/registry";
import { cn } from "@/sc/lib/utils";

/** Look of each group's panel, and extra links (pages that are not a DocType list) shown in it. */
const GROUP_LOOK: Record<string, { icon: LucideIcon; tone: string; sub: string; extra?: { label: string; to: string; icon: LucideIcon; hint: string }[] }> = {
  Mill: { icon: Factory, tone: "from-indigo-500 to-violet-600 shadow-indigo-500/25", sub: "Settings, seasons, shifts, mills",
    extra: [{ label: "Season Quotas", to: "/survey/quota", icon: Target, hint: "circle quotas per season" }] },
  Area: { icon: House, tone: "from-emerald-500 to-teal-600 shadow-emerald-500/25", sub: "Division → village, pins & boundaries",
    extra: [{ label: "Area Map", to: "/setup/area-map", icon: MapPinned, hint: "pins & boundaries" }] },
  Sources: { icon: Building2, tone: "from-amber-500 to-orange-500 shadow-amber-500/25", sub: "Gates, check posts, depots, journey time",
    extra: [{ label: "Sources on the map", to: "/survey/map?layers=sources", icon: Route, hint: "pins & routes" }] },
  Growers: { icon: Users, tone: "from-pink-500 to-rose-600 shadow-pink-500/25", sub: "Registry, passbooks, Excel import",
    extra: [{ label: "Grower registry", to: "/survey/growers", icon: Users, hint: "search & profiles" }] },
  Crop: { icon: Sprout, tone: "from-lime-500 to-green-600 shadow-lime-500/25", sub: "Varieties and diseases" },
  "Vehicles & Weighbridge": { icon: Truck, tone: "from-sky-500 to-blue-600 shadow-sky-500/25", sub: "Vehicles, lanes, terminals" },
};
const DEFAULT_LOOK = { icon: Boxes, tone: "from-slate-500 to-slate-600 shadow-slate-500/25", sub: "" };

export function SetupHomePage() {
  const docs = docsOf("setup");
  const { data: counts, isLoading } = useQuery({
    queryKey: ["sc-setup-counts"],
    queryFn: async () => {
      const out: Record<string, number | null> = {};
      await Promise.all(docs.filter((d) => d.doctype !== "Sugar Settings").map(async (d) => {
        try {
          out[d.doctype] = await get<number>("frappe.client.get_count", { doctype: d.doctype });
        } catch {
          out[d.doctype] = null;
        }
      }));
      return out;
    },
  });
  const groups = [...new Set(docs.map((d) => d.group))];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25"><Boxes className="size-5" /></span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sugar setup</h1>
            <p className="text-sm text-muted-foreground">Settings, seasons and every master the mill runs on</p>
          </div>
        </div>
        <Link to="/setup/area-map" className="inline-flex h-9 items-center gap-2 rounded-lg border-[1.5px] border-input bg-input-bg px-3 text-sm font-semibold hover:bg-accent">
          <MapPinned className="size-4" />Pins & boundaries (Area Map)
        </Link>
      </div>
      <div className="columns-1 gap-4 sm:columns-2 xl:columns-4">
        {groups.map((g) => {
          const look = GROUP_LOOK[g] ?? DEFAULT_LOOK;
          const items = docs.filter((d) => d.group === g);
          const extra = (GROUP_LOOK[g]?.extra ?? []);
          const total = items.reduce((t, d) => t + (counts?.[d.doctype] ?? 0), 0);
          return (
            <section key={g} className="mb-4 flex break-inside-avoid flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
              <header className="flex items-center gap-3 border-b bg-muted/20 px-4 py-3">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg", look.tone)}><look.icon className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold leading-tight" title={g}>{g}</h2>
                  <p className="truncate text-[11px] text-muted-foreground" title={look.sub}>{look.sub}</p>
                </div>
                {!isLoading && total > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{num(total)}</span>}
              </header>
              <ul className="flex-1 p-1.5">
                {items.map((d) => (
                  <li key={d.doctype}>
                    <Link to={docBase(d.doctype)} className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition hover:bg-accent">
                      <d.icon className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                      <span className="min-w-0 flex-1 truncate font-medium group-hover:text-primary" title={d.label}>{d.label}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {d.doctype === "Sugar Settings" ? "settings" : isLoading ? <Skeleton className="h-3 w-8" /> :
                          counts?.[d.doctype] === null ? "—" : num(counts?.[d.doctype] ?? 0)}
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
                {extra.length > 0 && <li className="mx-2.5 my-1 border-t" aria-hidden />}
                {extra.map((x) => (
                  <li key={x.to}>
                    <Link to={x.to} className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition hover:bg-accent">
                      <x.icon className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate font-medium text-primary">{x.label}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{x.hint}</span>
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-primary opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
