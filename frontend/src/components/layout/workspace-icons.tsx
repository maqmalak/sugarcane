import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ExternalLink, LayoutGrid } from "lucide-react";
import { APP_NAVIGATION } from "@/app/navigation";
import { ICON_GRADIENT } from "@/components/ui/app-icon";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/utils/cn";

/** One hue per sidebar section, so each section's icons read as a group. */
const SECTION_HUES = ["violet", "sky", "indigo", "teal", "amber", "rose", "emerald", "orange", "fuchsia", "cyan", "lime", "slate"];
const STORE_KEY = "baogee.workspace-icons.";

/**
 * Workspace icons for an app's home page (HR, Payroll): every page of the app's sidebar as a glossy icon, grouped by
 * sidebar section, like the Desktop. ERPNext desk tools (/desk/…) open in a new tab, as in the sidebar.
 */
export function WorkspaceIcons({ segment, title }: { segment: string; title: string }) {
  const { hasRole } = useAuth();
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(STORE_KEY + segment) !== "0"; } catch { return true; }
  });
  const toggle = () => {
    setOpen((v) => {
      try { localStorage.setItem(STORE_KEY + segment, v ? "0" : "1"); } catch { /* storage blocked */ }
      return !v;
    });
  };

  const home = `/${segment}`;
  const seen = new Set<string>([home]);
  const sections = (APP_NAVIGATION[segment] ?? [])
    .map((group, i) => ({
      title: group.title || "Start",
      hue: SECTION_HUES[i % SECTION_HUES.length],
      items: group.items.filter((item) => {
        if (seen.has(item.to) || (item.roles?.length && !hasRole(...item.roles))) return false;
        seen.add(item.to);
        return true;
      }),
    }))
    .filter((s) => s.items.length > 0);
  // The untitled first group (Overview / Setup links) and the "Setup" group are one "Start & Setup" card.
  const start = sections.find((s) => s.title === "Start");
  const setup = sections.find((s) => s.title === "Setup");
  if (start && setup) {
    setup.title = "Start & Setup";
    setup.items = [...start.items, ...setup.items];
    sections.splice(sections.indexOf(start), 1);
  } else if (start) start.title = "Start & Setup";
  // small groups first-come share rows; a big group (more than 8 pages) takes a full row
  const count = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <section className="surface rounded-2xl">
      <button type="button" onClick={toggle} aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <LayoutGrid className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{count} pages</span>
        <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        // Group cards flow side by side: small groups (Lifecycle, Tools, Start & Setup …) share a row, big ones wrap inside.
        <div className="flex flex-wrap gap-3 border-t border-border p-3 dark:border-white/10">
          {sections.map((s) => (
            <div key={s.title} className={cn("surface-inset rounded-xl px-2.5 pb-2 pt-2", s.items.length > 8 ? "basis-full" : "flex-auto")}>
              <h3 className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className={cn("h-2.5 w-1 rounded-full bg-gradient-to-b", ICON_GRADIENT[s.hue] ?? ICON_GRADIENT.slate)} />
                {s.title}
                <span className="font-normal normal-case tracking-normal opacity-70">{s.items.length}</span>
              </h3>
              <div className="flex flex-wrap">
                {s.items.map((item) => {
                  const desk = item.to.startsWith("/desk/");
                  const Icon = item.icon ?? LayoutGrid;
                  const body = (
                    <>
                      <span className="relative">
                        <span className={cn("relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-[18px] bg-gradient-to-b text-white shadow-md ring-1 ring-inset ring-white/25 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg",
                          ICON_GRADIENT[s.hue] ?? ICON_GRADIENT.slate)}>
                          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-white/0" />
                          <Icon className="relative h-8 w-8" strokeWidth={2} />
                        </span>
                        {desk && <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background shadow ring-1 ring-border"><ExternalLink className="h-3 w-3 text-muted-foreground" /></span>}
                      </span>
                      <span className="line-clamp-2 w-full text-[12.5px] font-medium leading-tight">{item.label}</span>
                    </>
                  );
                  const cls = "group flex w-[104px] flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center outline-none transition hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-primary";
                  return desk ? (
                    <a key={item.to} href={item.to} target="_blank" rel="noreferrer" className={cls} title="Opens in a new tab (ERPNext desk)">{body}</a>
                  ) : (
                    <Link key={item.to} to={item.to} className={cls} title={item.label}>{body}</Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
