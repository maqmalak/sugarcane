import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { ArrowUp, ExternalLink, LayoutList, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ChartCard } from "@/components/charts/chart-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { cn } from "@/utils/cn";
import {
  AnalyticsTabs,
  DrillDialog,
  InsightStrip,
  KpiTile,
  PeriodBar,
  WidgetChart,
  isEmptyWidget,
  moduleMeta,
  useModuleDashboard,
  usePeriod,
  type DashboardData,
  type Kpi,
  type ModuleId,
} from "./analytics-kit";

/** Module dashboards shown together on one page, in order. */
export const SUITES: Record<string, { title: string; subtitle: string; modules: ModuleId[] }> = {
  sales: { title: "Sales", subtitle: "Sales, order book and deliveries on one page", modules: ["sales", "so_analysis", "do_analysis"] },
  trade: { title: "Imp/Exp", subtitle: "Exports, LCs, shipments, imports and landed cost on one page", modules: ["export_analysis", "import_analysis"] },
  purchase: { title: "Buying", subtitle: "Spend, suppliers, buying cycle, lead times and price variance on one page", modules: ["purchase", "procurement"] },
  production: { title: "Production", subtitle: "Output, yield, cost per spindle and downtime, then work-order and job-card (operation) performance", modules: ["production", "wo_analysis", "jc_analysis"] },
};

const secId = (module: string, part: string) => `${module}--${part}`;

/** Every navigable anchor for one loaded module: its summary, insights and each chart. */
function anchorsFor(module: string, dash?: DashboardData) {
  const items = [{ id: secId(module, "kpis"), label: "Summary" }];
  if (dash?.insights?.length) items.push({ id: secId(module, "insights"), label: "Insights" });
  (dash?.widgets ?? []).forEach((w) => items.push({ id: secId(module, `w-${w.id}`), label: w.title }));
  return items;
}

/** Classes that make a panel stand out after it is picked from the navigation (removed again after a few seconds). */
const HIGHLIGHT = ["ring-2", "ring-primary", "ring-offset-4", "ring-offset-background", "shadow-2xl", "shadow-primary/30", "bg-primary/[0.04]", "-translate-y-0.5"];
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
let highlighted: HTMLElement | null = null;

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  // Highlight the target: the section header card for a module link, otherwise the block itself (chart panel,
  // summary tiles or insights), which carries the anchor id.
  const target = (el.tagName === "SECTION" ? el.querySelector<HTMLElement>("[data-highlight]") : null) ?? el;
  if (highlighted && highlighted !== target) highlighted.classList.remove(...HIGHLIGHT);
  clearTimeout(highlightTimer);
  target.classList.add(...HIGHLIGHT);
  highlighted = target;
  highlightTimer = setTimeout(() => {
    target.classList.remove(...HIGHLIGHT);
    if (highlighted === target) highlighted = null;
  }, 3000);
}

// ------------------------------------------------------------------ one module section
function ModuleSection({
  module,
  period,
  company,
  currency,
  refreshToken,
  siblings,
  onLoaded,
  onDrill,
}: {
  module: ModuleId;
  period: ReturnType<typeof usePeriod>;
  company?: string;
  currency: string;
  refreshToken: number;
  siblings: ModuleId[];
  onLoaded: (module: ModuleId, dash?: DashboardData) => void;
  onDrill: (module: ModuleId, kpi: Kpi) => void;
}) {
  const meta = moduleMeta(module)!;
  const Icon = meta.icon;
  const { dash, error, isLoading, isValidating, notPermitted } = useModuleDashboard(module, period.range, company, refreshToken, !period.invalid);
  useEffect(() => onLoaded(module, dash), [module, dash, onLoaded]);
  if (notPermitted) return null; // a dashboard this user can't open: left out of the overview

  return (
    <section id={secId(module, "top")} data-nav-id={secId(module, "top")} className="scroll-mt-20 space-y-4">
      {/* section header with a quick jump row to the other sections */}
      <div
        data-highlight
        className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-500"
        style={{ borderTopColor: meta.accent, borderTopWidth: 3 }}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: meta.accent.replace(")", " / 0.12)"), color: meta.accent }}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">{meta.label}</h2>
          <p className="truncate text-xs text-muted-foreground">{meta.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {siblings
            .filter((m) => m !== module)
            .map((m) => {
              const sm = moduleMeta(m)!;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => scrollToId(secId(m, "top"))}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <sm.icon className="h-3.5 w-3.5" /> {sm.label}
                </button>
              );
            })}
          <Link
            to={`/analytics/${module}`}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-primary hover:underline"
            title="Open this dashboard on its own"
          >
            Full tab <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {error && <Card className="border-rose-500/40 p-4 text-sm text-rose-600">Could not load {meta.label}: {(error as any)?.message ?? String(error)}</Card>}

      <div id={secId(module, "kpis")} data-nav-id={secId(module, "kpis")} className="scroll-mt-20 rounded-xl transition-all duration-500">
        {isLoading && !dash ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[132px] rounded-lg" />
            ))}
          </div>
        ) : dash ? (
          <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4 transition-opacity", isValidating && "opacity-60")}>
            {dash.kpis.map((k) => (
              <KpiTile key={k.key} kpi={k} currency={currency} accent={meta.accent} onClick={() => onDrill(module, k)} />
            ))}
          </div>
        ) : null}
      </div>

      {!!dash?.insights?.length && (
        <div id={secId(module, "insights")} data-nav-id={secId(module, "insights")} className="scroll-mt-20 rounded-xl transition-all duration-500">
          <InsightStrip insights={dash.insights} />
        </div>
      )}

      {isLoading && !dash ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className={cn("h-[340px] rounded-lg", i === 0 && "lg:col-span-2")} />
          ))}
        </div>
      ) : dash ? (
        <div className={cn("grid gap-4 lg:grid-cols-3 transition-opacity", isValidating && "opacity-60")}>
          {dash.widgets.map((w) => (
            <div
              key={w.id}
              id={secId(module, `w-${w.id}`)}
              data-nav-id={secId(module, `w-${w.id}`)}
              className={cn("scroll-mt-20 rounded-lg transition-all duration-500", w.span >= 2 && "lg:col-span-2", w.span >= 3 && "lg:col-span-3")}
            >
              <ChartCard title={w.title} subtitle={w.subtitle ?? undefined} className="h-full">
                {isEmptyWidget(w) ? (
                  <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No data in this period.</div>
                ) : (
                  <WidgetChart w={w} currency={currency} />
                )}
              </ChartCard>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ page
export function AnalyticsSuitePage({ suite: fixedSuite }: { suite?: string } = {}) {
  const params = useParams();
  const suite = fixedSuite ?? params.suite ?? "sales";
  const { hash } = useLocation();
  const cfg = SUITES[suite];
  const { company, companyCurrency } = useCompanyContext();
  const currency = companyCurrency ?? "PKR";
  const period = usePeriod();
  const [refreshToken, setRefreshToken] = useState(0);
  const [dashes, setDashes] = useState<Partial<Record<ModuleId, DashboardData>>>({});
  const [drill, setDrill] = useState<{ module: ModuleId; kpi: Kpi } | null>(null);
  const [active, setActive] = useState<string>("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const navRef = useRef<HTMLElement>(null);

  const onLoaded = useCallback((m: ModuleId, d?: DashboardData) => {
    setDashes((prev) => (prev[m] === d ? prev : { ...prev, [m]: d }));
  }, []);
  const onDrill = useCallback((module: ModuleId, kpi: Kpi) => setDrill({ module, kpi }), []);

  const nav = useMemo(
    () => (cfg?.modules ?? []).map((m) => ({ module: m, meta: moduleMeta(m)!, items: anchorsFor(m, dashes[m]) })),
    [cfg, dashes],
  );

  // Scroll-spy: highlight the anchor closest to the top of the viewport.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-nav-id]"));
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive((visible[0].target as HTMLElement).dataset.navId ?? "");
      },
      { rootMargin: "-64px 0px -65% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [nav]);

  // Deep links such as /production#wo_analysis--top: jump once that module's sections have rendered.
  const hashDone = useRef("");
  useEffect(() => {
    const id = hash.slice(1);
    if (!id || hashDone.current === id || !dashes[id.split("--")[0] as ModuleId]) return;
    hashDone.current = id;
    requestAnimationFrame(() => scrollToId(id));
  }, [hash, dashes]);

  // Keep the highlighted link visible inside the (scrollable) nav panel.
  useEffect(() => {
    navRef.current?.querySelector(`[data-link="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!cfg) return <Navigate to="/analytics/suite/sales" replace />;
  const activeModule = active.split("--")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={cfg.title}
        subtitle={`${cfg.subtitle} · ${period.label}`}
        icon={<LayoutList className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" onClick={() => setRefreshToken((t) => t + 1)}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
        }
      />
      <div className="-mt-2">
        <AnalyticsTabs />
      </div>
      <PeriodBar period={period} company={company} page={`suite:${suite}`} />
      {period.invalid && <p className="text-sm text-rose-600">The start date must be before the end date.</p>}

      {/* compact module jump bar for small screens */}
      <div className="sticky top-14 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-lg border border-border bg-card/95 p-1 backdrop-blur lg:hidden">
        {nav.map(({ module, meta }) => (
          <button
            key={module}
            type="button"
            onClick={() => scrollToId(secId(module, "top"))}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
              activeModule === module ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <meta.icon className="h-4 w-4" /> {meta.label}
          </button>
        ))}
      </div>

      <div className="flex gap-6">
        {/* quick navigation panel */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <nav ref={navRef} className="sticky top-[4.5rem] max-h-[calc(100vh-5.5rem)] overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-sm scrollbar-thin" aria-label="Page sections">
            <p className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">On this page</p>
            {nav.map(({ module, meta, items }) => {
              const expanded = open[module] ?? true;
              const isActive = activeModule === module;
              return (
                <div key={module} className="mb-1">
                  <div className={cn("flex items-center gap-1 rounded-md", isActive && "bg-muted")}>
                    <button
                      type="button"
                      data-link={secId(module, "top")}
                      onClick={() => scrollToId(secId(module, "top"))}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm font-semibold"
                      style={{ color: isActive ? meta.accent : undefined }}
                    >
                      <meta.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{meta.label}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={expanded ? `Collapse ${meta.label}` : `Expand ${meta.label}`}
                      onClick={() => setOpen((o) => ({ ...o, [module]: !expanded }))}
                      className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {expanded ? "−" : "+"}
                    </button>
                  </div>
                  {expanded && (
                    <ul className="ml-4 border-l border-border py-0.5">
                      {items.map((it) => (
                        <li key={it.id}>
                          <button
                            type="button"
                            data-link={it.id}
                            onClick={() => scrollToId(it.id)}
                            className={cn(
                              "-ml-px block w-full truncate border-l-2 px-3 py-1 text-left text-xs transition-colors",
                              active === it.id ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                            )}
                            title={it.label}
                          >
                            {it.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-border py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowUp className="h-3.5 w-3.5" /> Back to top
            </button>
          </nav>
        </aside>

        <div className="min-w-0 flex-1 space-y-10">
          {cfg.modules.map((m) => (
            <ModuleSection
              key={m}
              module={m}
              period={period}
              company={company}
              currency={currency}
              refreshToken={refreshToken}
              siblings={cfg.modules}
              onLoaded={onLoaded}
              onDrill={onDrill}
            />
          ))}
        </div>
      </div>

      <DrillDialog
        module={drill?.module ?? cfg.modules[0]}
        kpi={drill?.kpi ?? null}
        range={period.range}
        company={company}
        currency={currency}
        onClose={() => setDrill(null)}
      />
    </div>
  );
}
