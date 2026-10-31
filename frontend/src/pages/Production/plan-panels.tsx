import type { ReactNode } from "react";
import useSWR from "swr";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, Coins, Cog, Factory, Gauge, Layers, Package, TrendingDown, TrendingUp } from "lucide-react";
import type { ExtraContext } from "@/components/doc/doc-config";
import { Card } from "@/components/ui/card";
import { postCall } from "@/services/frappe";
import { asNumber, cn } from "@/utils/cn";
import { formatMoney, formatNumber } from "@/utils/currency";

/* ------------------------------------------------------------------ data */
interface PlanLine {
  item_code: string; item_name: string; bom_no: string; uom: string; planned_qty: number; produced_qty: number;
  raw_material_cost: number; operating_cost: number; secondary_items_cost: number; total_cost: number; unit_cost: number; has_operations: boolean;
}
interface PlanOp {
  operation: string; workstations: string; planned_hours: number; planned_cost: number; hour_rate: number;
  actual_std_hours: number; actual_hours: number; actual_cost: number; cards: number; completed: number; efficiency: number | null;
}
interface Insights {
  lines: PlanLine[];
  operations: PlanOp[];
  planned: { qty: number; raw_material_cost: number; operating_cost: number; secondary_items_cost: number; total_cost: number; unit_cost: number; hours: number };
  actual: { work_orders: number; produced: number; material_cost: number; additional_cost: number; operation_cost: number; total_cost: number; unit_cost: number; hours: number };
  boms_without_operations: string[];
}

/** Planned (BOM-based) vs actual (work orders, job cards, manufacture entries) figures — shared by the two tabs. */
function usePlanInsights({ name, isNew, values, rows }: ExtraContext) {
  const items = (rows.po_items ?? []).map((r) => ({ item_code: r.item_code, bom_no: r.bom_no, planned_qty: asNumber(r.planned_qty), produced_qty: asNumber(r.produced_qty) }));
  const key = `plan-insights:${isNew ? "new" : name}:${values.modified ?? ""}:${JSON.stringify(items)}`;
  return useSWR(items.length ? key : null, () =>
    postCall<Insights>("micromax.production_plan.get_plan_insights", { doc: JSON.stringify({ name: isNew ? undefined : name, po_items: items }) }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );
}

const money = (v: number) => formatMoney(v, "PKR", { compact: true });
/** Build-up, per-unit and actual-cost figures to 2 decimals. */
const moneyFull = (v: number) => formatMoney(v, "PKR", { decimals: 2 });

export function Tile({ icon, label, value, sub, tone = "primary" }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: "primary" | "emerald" | "amber" | "rose" | "sky" | "violet" }) {
  const tones = {
    primary: "bg-primary/10 text-primary", emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400", sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400", violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tones[tone])}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-bold tabular-nums">{value}</p>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <Card className="p-8 text-center text-sm text-muted-foreground">{children}</Card>;
}

function Loading() {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>;
}

/* ------------------------------------------------------------------ Operation tab */
export function PlanOperationsPanel(ctx: ExtraContext) {
  const { data, isLoading, error } = usePlanInsights(ctx);
  if (!(ctx.rows.po_items ?? []).length) return <Empty>Add assembly items on the Plan tab to see their operations.</Empty>;
  if (isLoading && !data) return <Loading />;
  if (error || !data) return <Empty>Could not load operations.</Empty>;
  const ops = data.operations;
  const maxH = Math.max(1, ...ops.map((o) => Math.max(o.planned_hours, o.actual_hours, o.actual_std_hours)));
  const eff = data.actual.hours ? (ops.reduce((s, o) => s + o.actual_std_hours, 0) / data.actual.hours) * 100 : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<Cog className="h-4 w-4" />} label="Operations" value={ops.length} sub={`${data.lines.length} assembly item${data.lines.length === 1 ? "" : "s"}`} />
        <Tile icon={<Clock className="h-4 w-4" />} label="Planned hours (BOM)" value={formatNumber(data.planned.hours, 1)} sub={money(data.planned.operating_cost) + " operating cost"} tone="sky" />
        <Tile icon={<Factory className="h-4 w-4" />} label="Actual hours (job cards)" value={formatNumber(data.actual.hours, 1)} sub={`${data.actual.work_orders} work orders · ${money(data.actual.operation_cost)}`} tone="violet" />
        <Tile icon={<Gauge className="h-4 w-4" />} label="Time efficiency" value={eff != null ? `${formatNumber(eff, 1)}%` : "—"} sub="Standard ÷ actual job-card time"
          tone={eff == null ? "primary" : eff >= 95 ? "emerald" : eff >= 85 ? "amber" : "rose"} />
      </div>
      {data.boms_without_operations.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {data.boms_without_operations.length} BOM{data.boms_without_operations.length === 1 ? " has" : "s have"} no operations, so planned hours only cover the rest:{" "}
            {data.boms_without_operations.slice(0, 6).map((b, i) => (
              <span key={b}>{i > 0 && ", "}<Link className="font-medium underline" to={`/production/boms/${encodeURIComponent(b)}?tab=Operation`}>{b}</Link></span>
            ))}
            {data.boms_without_operations.length > 6 && " …"}
          </span>
        </p>
      )}
      {ops.length === 0 ? (
        <Empty>No operations yet — the BOMs have no routing and no job cards are linked.</Empty>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border px-5 py-3">
            <p className="text-sm font-semibold">Operations — planned vs actual</p>
            <p className="text-xs text-muted-foreground">In routing sequence. Bars: planned (BOM), standard and actual (job cards) hours.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Operation</th>
                  <th className="px-4 py-2 text-left">Hours</th>
                  <th className="px-3 py-2 text-right">Planned h</th>
                  <th className="px-3 py-2 text-right">Actual h</th>
                  <th className="px-3 py-2 text-right">Efficiency</th>
                  <th className="px-3 py-2 text-right">Job cards</th>
                  <th className="px-4 py-2 text-right">Actual cost</th>
                </tr>
              </thead>
              <tbody>
                {ops.map((o) => (
                  <tr key={o.operation} className="border-t border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{o.operation}</p>
                      <p className="max-w-[16rem] truncate text-[11px] text-muted-foreground" title={o.workstations}>{o.workstations || "—"}</p>
                    </td>
                    <td className="w-[30%] px-4 py-2.5">
                      {[["bg-slate-400/70", o.planned_hours], ["bg-sky-500", o.actual_std_hours], ["bg-violet-500", o.actual_hours]].map(([c, v], i) => (
                        <div key={i} className="my-0.5 h-1.5 rounded-full bg-muted">
                          <div className={cn("h-1.5 rounded-full", c as string)} style={{ width: `${(asNumber(v) / maxH) * 100}%` }} />
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{o.planned_hours ? formatNumber(o.planned_hours, 1) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{o.actual_hours ? formatNumber(o.actual_hours, 1) : "—"}</td>
                    <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", o.efficiency == null ? "text-muted-foreground" : o.efficiency >= 95 ? "text-emerald-600 dark:text-emerald-400" : o.efficiency >= 85 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400")}>
                      {o.efficiency != null ? `${o.efficiency}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{o.cards ? `${o.completed}/${o.cards}` : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{o.actual_cost ? money(o.actual_cost) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-border px-5 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-full bg-slate-400/70" /> Planned (BOM)</span>
            <span className="flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-full bg-sky-500" /> Standard (job cards)</span>
            <span className="flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-full bg-violet-500" /> Actual (job cards)</span>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Costing tab */
export function PlanCostingPanel(ctx: ExtraContext) {
  const { data, isLoading, error } = usePlanInsights(ctx);
  if (!(ctx.rows.po_items ?? []).length) return <Empty>Add assembly items on the Plan tab to cost the plan.</Empty>;
  if (isLoading && !data) return <Loading />;
  if (error || !data) return <Empty>Could not load costing.</Empty>;
  const p = data.planned, a = data.actual;
  const hasActual = a.produced > 0;
  const variance = hasActual && p.unit_cost ? ((a.unit_cost - p.unit_cost) / p.unit_cost) * 100 : null;
  const parts = [
    { label: "Raw materials", v: p.raw_material_cost, c: "bg-sky-500" },
    { label: "Operations", v: p.operating_cost, c: "bg-violet-500" },
    { label: "Secondary items (credit)", v: -Math.abs(p.secondary_items_cost), c: "bg-emerald-500" },
  ];
  const gross = p.raw_material_cost + p.operating_cost || 1;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<Coins className="h-4 w-4" />} label="Planned cost" value={money(p.total_cost)} sub={`${formatNumber(p.qty, 0)} planned`} />
        <Tile icon={<Layers className="h-4 w-4" />} label="Planned cost / unit" value={moneyFull(p.unit_cost)} sub="From the BOMs" tone="sky" />
        <Tile icon={<Package className="h-4 w-4" />} label="Actual cost" value={hasActual ? money(a.total_cost) : "—"}
          sub={hasActual ? `${formatNumber(a.produced, 0)} produced · ${a.work_orders} WOs` : "Nothing manufactured yet"} tone="violet" />
        <Tile
          icon={variance != null && variance > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          label="Actual cost / unit" value={hasActual ? moneyFull(a.unit_cost) : "—"}
          sub={variance != null ? `${variance > 0 ? "+" : ""}${formatNumber(variance, 1)}% vs plan` : "—"}
          tone={variance == null ? "primary" : variance > 2 ? "rose" : variance < -2 ? "emerald" : "amber"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm font-semibold">Planned cost build-up</p>
          <p className="mb-4 text-xs text-muted-foreground">BOM cost scaled to planned quantities</p>
          <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-muted">
            {parts.filter((x) => x.v > 0).map((x) => <div key={x.label} className={x.c} style={{ width: `${(x.v / gross) * 100}%` }} />)}
          </div>
          <dl className="space-y-2 text-sm">
            {parts.map((x) => (
              <div key={x.label} className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-2 text-muted-foreground"><i className={cn("h-2.5 w-2.5 rounded-sm", x.c)} /> {x.label}</dt>
                <dd className="font-medium tabular-nums">{moneyFull(x.v)}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
              <dt>Total</dt><dd className="tabular-nums">{moneyFull(p.total_cost)}</dd>
            </div>
          </dl>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <p className="text-sm font-semibold">Actual cost (manufacture entries and job cards)</p>
          <p className="mb-4 text-xs text-muted-foreground">Material consumed and additional costs on the work orders' Manufacture entries, plus job-card operation cost</p>
          {hasActual ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {[["Material consumed", a.material_cost], ["Additional costs", a.additional_cost], ["Operations (job cards)", a.operation_cost], ["Total actual cost", a.total_cost]].map(([l, v]) => (
                <div key={l as string} className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <dt className="text-xs text-muted-foreground">{l}</dt>
                  <dd className="text-base font-semibold tabular-nums">{moneyFull(v as number)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No Manufacture entries have been posted for this plan's work orders yet.</p>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">Cost by assembly item</p>
          <p className="text-xs text-muted-foreground">Each item's BOM cost × planned quantity</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">BOM</th>
                <th className="px-3 py-2 text-right">Planned</th>
                <th className="px-3 py-2 text-right">Raw materials</th>
                <th className="px-3 py-2 text-right">Operations</th>
                <th className="px-3 py-2 text-right">Unit cost</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l, i) => (
                <tr key={`${l.bom_no}-${i}`} className="border-t border-border/60 hover:bg-muted/30">
                  <td className="px-4 py-2"><p className="font-medium">{l.item_name}</p><p className="text-[11px] text-muted-foreground">{l.item_code}</p></td>
                  <td className="px-3 py-2"><Link to={`/production/boms/${encodeURIComponent(l.bom_no)}?tab=Costing`} className="text-primary hover:underline">{l.bom_no}</Link></td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(l.planned_qty, 0)} <span className="text-muted-foreground">{l.uom}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(l.raw_material_cost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.operating_cost ? money(l.operating_cost) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{moneyFull(l.unit_cost)}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{money(l.total_cost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border font-semibold">
              <tr>
                <td className="px-4 py-2" colSpan={3}>Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(p.raw_material_cost)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(p.operating_cost)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{moneyFull(p.unit_cost)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(p.total_cost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
