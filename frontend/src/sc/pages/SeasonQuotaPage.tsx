/**
 * Season quotas (/survey/quota): each circle's cane quota for a crushing season next to what the survey expects. Edit
 * one circle, or several at once (scale by %, match the survey, spread the season's crushing target), then save with a
 * reason. Saved figures live in the season's Circle Quotas table; a circle without one keeps the circle's own quota.
 * Data: sugarcane.api.v1.quota (view / save / reset).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, History, Leaf, Lock, RotateCcw, Save, Scale, Sprout, Target, Undo2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { C, ChartCard, ChartTip, KpiCard, Pill, Segmented, axisShort, useChartTheme } from "@/sc/components/analytics/kit";
import { Button } from "@/sc/components/ui/button";
import { Input, Select } from "@/sc/components/ui/input";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get, post } from "@/sc/lib/api";
import { dateTime, num } from "@/sc/lib/format";
import { cn } from "@/sc/lib/utils";
import { useTheme } from "@/sc/providers/theme";

type Basis = "Manual" | "Survey" | "Season Target" | "Scaled";
interface Row {
  circle: string; circle_name: string; code?: string; zone?: string; affiliation?: string;
  circle_quota: number; quota: number; has_season_quota: boolean; previous_quota: number | null; basis: Basis | null;
  remarks: string | null; adjusted_by: string | null; adjusted_on: string | null; last_season_quota: number | null;
  fields: number; growers: number; acres: number; expected: number; cover: number;
}
interface View {
  season: string; status: string; start_date: string; end_date: string; previous_season: string | null; crushing_target: number;
  seasons: { name: string; status: string }[]; can_edit: boolean; rows: Row[];
  totals: { quota: number; expected: number; cover: number; circles: number; adjusted: number; target_gap: number | null };
  history: { text: string; by: string; on: string }[];
  changed?: string[];
}
interface Draft { quota: number; basis: Basis; remarks: string }
type Tool = "scale" | "survey" | "target";

const md = (v: number) => `${num(Math.round(v))} md`;
const kmd = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)}M md` : `${num(Math.round(v / 1000))}k md`);
const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : 0);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(Math.round(v)))}`;
const BASIS_COLOUR: Record<Basis, string> = { Manual: C.slate, Survey: C.teal, "Season Target": C.blue, Scaled: C.amber };
const coverColour = (c: number) => (c >= 90 ? C.green : c >= 60 ? C.amber : C.red);
/** Comment HTML → text (the desk stores the history entry as escaped HTML). */
const plain = (html: string) => new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
/** Round to the nearest 1,000 maund — quotas are planned in thousands. */
const round1k = (v: number) => Math.max(0, Math.round(v / 1000) * 1000);

export function SeasonQuotaPage() {
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const season = params.get("season") || undefined;
  const { data, isLoading } = useQuery({
    queryKey: ["sc-season-quota", season ?? ""],
    queryFn: () => get<View>("sugarcane.api.v1.quota.view", { season }),
  });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<Tool>("scale");
  const [scalePct, setScalePct] = useState("10");
  const [cushionPct, setCushionPct] = useState("0");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDrafts({}); setSelected(new Set()); setReason(""); }, [data?.season]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const quotaOf = (r: Row) => drafts[r.circle]?.quota ?? r.quota;
  const dirty = rows.filter((r) => drafts[r.circle] && Math.round(drafts[r.circle].quota) !== Math.round(r.quota));
  const draftTotal = rows.reduce((s, r) => s + quotaOf(r), 0);
  const net = draftTotal - (data?.totals.quota ?? 0);
  const targets = selected.size ? rows.filter((r) => selected.has(r.circle)) : rows;
  const editable = !!data?.can_edit;

  const setDraft = (r: Row, patch: Partial<Draft>) => setDrafts((d) => {
    const cur = d[r.circle] ?? { quota: r.quota, basis: "Manual" as Basis, remarks: r.remarks ?? "" };
    return { ...d, [r.circle]: { ...cur, ...patch } };
  });

  function apply() {
    if (!data) return;
    const next = { ...drafts };
    const put = (r: Row, quota: number, basis: Basis) => { next[r.circle] = { remarks: next[r.circle]?.remarks ?? r.remarks ?? "", quota: round1k(quota), basis }; };
    if (tool === "scale") {
      const f = 1 + (Number(scalePct) || 0) / 100;
      targets.forEach((r) => put(r, quotaOf(r) * f, "Scaled"));
    } else if (tool === "survey") {
      const f = 1 + (Number(cushionPct) || 0) / 100;
      targets.filter((r) => r.expected > 0).forEach((r) => put(r, r.expected * f, "Survey"));
    } else {
      // Spread whatever the season target leaves for these circles (target − quotas of the others), pro-rata by the
      // survey's expected cane; circles not surveyed yet keep their share by current quota.
      const others = rows.filter((r) => !targets.includes(r)).reduce((s, r) => s + quotaOf(r), 0);
      const pool = Math.max(0, data.crushing_target - others);
      const weight = targets.reduce((s, r) => s + (r.expected || 0), 0);
      const byQuota = targets.reduce((s, r) => s + quotaOf(r), 0);
      targets.forEach((r) => put(r, weight ? (pool * r.expected) / weight : byQuota ? (pool * quotaOf(r)) / byQuota : pool / targets.length, "Season Target"));
    }
    setDrafts(next);
    toast.success(`${targets.length} circle(s) updated — review and save`);
  }

  async function save() {
    if (!data || !dirty.length) return;
    setSaving(true);
    try {
      const changes = dirty.map((r) => ({ circle: r.circle, quota_maund: drafts[r.circle].quota, basis: drafts[r.circle].basis, remarks: drafts[r.circle].remarks }));
      const res = await post<View>("sugarcane.api.v1.quota.save", { season: data.season, changes, reason });
      qc.setQueryData(["sc-season-quota", season ?? ""], res);
      void qc.invalidateQueries({ queryKey: ["sc-survey-insights"] });
      toast.success(`Saved quotas for ${res.changed?.length ?? 0} circle(s)`);
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function resetToCircle(r: Row) {
    if (!data) return;
    try {
      const res = await post<View>("sugarcane.api.v1.quota.reset", { season: data.season, circles: [r.circle] });
      qc.setQueryData(["sc-season-quota", season ?? ""], res);
      setDrafts(({ [r.circle]: _drop, ...rest }) => rest);
      toast.success(`${r.circle_name} is back on the circle quota`);
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Could not reset");
    }
  }

  if (isLoading || !data) {
    return <div className="grid gap-4 p-6 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>;
  }

  const coverNow = pct(data.totals.expected, draftTotal);
  const gap = data.crushing_target ? data.crushing_target - draftTotal : null;
  const chart = rows.map((r) => ({ name: r.circle_name, expected: r.expected, quota: quotaOf(r), cover: pct(r.expected, quotaOf(r)) }));
  const allSelected = selected.size === rows.length && rows.length > 0;

  return (
    <div className={cn("space-y-5 p-4 sm:p-6", dirty.length && "pb-28")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600"><Leaf className="size-4" />EagleEye Survey</div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Season quotas</h1>
          <p className="text-sm text-muted-foreground">
            Cane each circle should supply in {data.season} ({data.status.toLowerCase()}), against what the survey expects
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={data.season} onChange={(e) => setParams((p) => { p.set("season", e.target.value); return p; })} className="h-9 w-44" aria-label="Season">
            {data.seasons.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.status.toLowerCase()})</option>)}
          </Select>
          <Link to="/survey" className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:bg-accent">Insights</Link>
        </div>
      </div>

      {!editable && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200">
          <Lock className="size-4" />
          {data.status === "Closed" ? "This season is closed — quotas are shown read-only." : "You can view the quotas; a Cane Manager adjusts them."}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Factory} label="Season crushing target" value={data.crushing_target ? kmd(data.crushing_target) : "Not set"} color={C.blue}
          sub={gap === null ? "Set it on the Crushing Season" : gap === 0 ? "Quotas match the target" : `Quotas are ${kmd(Math.abs(gap))} ${gap > 0 ? "short of" : "over"} it`} />
        <KpiCard icon={Target} label="Total quota" value={kmd(draftTotal)} color={C.teal}
          sub={net ? <span className={net > 0 ? "text-emerald-600" : "text-red-600"}>{signed(net)} md unsaved</span> : `${data.totals.adjusted} of ${data.totals.circles} circles set for this season`} />
        <KpiCard icon={Sprout} label="Expected from survey" value={kmd(data.totals.expected)} color={C.green}
          sub={`${num(rows.reduce((s, r) => s + r.fields, 0))} fields · ${num(Math.round(rows.reduce((s, r) => s + r.acres, 0)))} acres`} />
        <KpiCard icon={Scale} label="Quota covered by survey" value={`${coverNow}%`} color={coverColour(coverNow)} progress={Math.min(coverNow, 100)}
          sub={coverNow < 100 ? `${kmd(Math.max(0, draftTotal - data.totals.expected))} still to find` : "Survey covers the full quota"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Quota against expected cane" sub="Bars: quota (with unsaved changes) and survey expectation · line: covered %" className="xl:col-span-2"
          insight={(() => {
            const low = chart.filter((c) => c.quota && c.cover < 60);
            const high = chart.filter((c) => c.cover > 150);
            return [low.length ? `${low.length} circle(s) below 60% cover` : null, high.length ? `${high.length} circle(s) expect over 1.5× their quota — room to raise it` : null].filter(Boolean).join(" · ") || "Every circle is between 60% and 150% cover.";
          })()}>
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: t.axis, fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={50} />
              <YAxis yAxisId="v" tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={axisShort} width={44} />
              <YAxis yAxisId="p" orientation="right" tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={40} />
              <Tooltip content={<ChartTip fmt={(v, key) => (key === "cover" ? `${v}%` : md(Number(v)))} />} />
              <Bar yAxisId="v" dataKey="quota" name="Quota" fill={C.slate} opacity={0.45} radius={[6, 6, 0, 0]} barSize={14} />
              <Bar yAxisId="v" dataKey="expected" name="Expected" fill={C.teal} radius={[6, 6, 0, 0]} barSize={14} />
              <Line yAxisId="p" dataKey="cover" name="Covered" stroke={C.amber} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <section className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2"><Wand2 className="size-4 text-primary" /><h3 className="font-semibold">Adjust several circles</h3></div>
          <p className="mt-1 text-xs text-muted-foreground">
            Applies to {selected.size ? <b>{selected.size} selected circle(s)</b> : <b>all {rows.length} circles</b>} — tick rows in the table to narrow it. Figures round to 1,000 md; nothing is saved until you press Save.
          </p>
          <div className="mt-3"><Segmented value={tool} onChange={setTool} accent options={[["scale", "Scale by %"], ["survey", "Match survey"], ["target", "Spread target"]]} /></div>
          <div className="mt-3 flex-1 text-sm">
            {tool === "scale" && (
              <label className="flex items-center gap-2">Change quotas by
                <Input type="number" value={scalePct} onChange={(e) => setScalePct(e.target.value)} className="h-9 w-24" aria-label="Percent" />%
              </label>
            )}
            {tool === "survey" && (
              <label className="flex flex-wrap items-center gap-2">Set each quota to the survey's expected cane plus
                <Input type="number" value={cushionPct} onChange={(e) => setCushionPct(e.target.value)} className="h-9 w-20" aria-label="Cushion percent" />%
                <span className="w-full text-xs text-muted-foreground">Circles with no survey yet are left alone.</span>
              </label>
            )}
            {tool === "target" && (
              <p className="text-muted-foreground">
                Shares {data.crushing_target ? <b className="text-foreground">{kmd(data.crushing_target)}</b> : "the season target"} (less the other circles' quotas) in proportion to each circle's expected cane.
              </p>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={apply} disabled={!editable || (tool === "target" && !data.crushing_target)} className="flex-1"><Wand2 />Apply</Button>
            <Button variant="outline" onClick={() => setDrafts({})} disabled={!dirty.length}><Undo2 />Undo all</Button>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div><h3 className="font-semibold">Circles</h3><p className="text-xs text-muted-foreground">Type a new quota, or use the tools above</p></div>
          {selected.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection ({selected.size})</Button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2.5 text-left">
                  <input type="checkbox" checked={allSelected} aria-label="Select all"
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.circle)))} />
                </th>
                <th className="px-3 py-2.5 text-left">Circle</th>
                <th className="px-3 py-2.5 text-right">Survey</th>
                <th className="px-3 py-2.5 text-right">Expected</th>
                <th className="px-3 py-2.5 text-right">{data.previous_season ? `${data.previous_season}` : "Circle quota"}</th>
                <th className="px-3 py-2.5 text-right">Saved quota</th>
                <th className="px-3 py-2.5 text-left">New quota</th>
                <th className="px-3 py-2.5 text-right">Change</th>
                <th className="px-3 py-2.5 text-left">Covered</th>
                <th className="px-3 py-2.5 text-left">Remarks</th>
                <th className="px-3 py-2.5 text-left">Last set</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const d = drafts[r.circle];
                const q = quotaOf(r);
                const change = q - r.quota;
                const cover = pct(r.expected, q);
                const ref = data.previous_season ? r.last_season_quota : r.circle_quota;
                return (
                  <tr key={r.circle} className={cn("transition-colors hover:bg-muted/30", change !== 0 && "bg-primary/[0.04]", selected.has(r.circle) && "bg-sky-500/[0.06]")}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(r.circle)} aria-label={`Select ${r.circle_name}`}
                        onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.circle)) n.delete(r.circle); else n.add(r.circle); return n; })} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{r.circle_name}</div>
                      <div className="text-[11px] text-muted-foreground">{r.code} · {r.zone}{r.affiliation && r.affiliation !== "Own" ? ` · ${r.affiliation}` : ""}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <div>{num(r.fields)} fields</div>
                      <div className="text-[11px] text-muted-foreground">{num(Math.round(r.acres))} ac · {num(r.growers)} gr</div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.expected ? num(r.expected) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{ref == null ? "—" : num(ref)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {num(r.quota)}
                      {!r.has_season_quota && <div className="text-[10px] text-muted-foreground">circle default</div>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Input type="number" min={0} step={1000} value={Math.round(q)} disabled={!editable} aria-label={`New quota for ${r.circle_name}`}
                          onChange={(e) => setDraft(r, { quota: Math.max(0, Number(e.target.value) || 0), basis: "Manual" })}
                          className={cn("h-8 w-32 text-right tabular-nums", change !== 0 && "border-primary ring-1 ring-primary/30")} />
                        {editable && r.expected > 0 && (
                          <button type="button" title="Set to the survey's expected cane" onClick={() => setDraft(r, { quota: round1k(r.expected), basis: "Survey" })}
                            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><Sprout className="size-4" /></button>
                        )}
                        {editable && change !== 0 && (
                          <button type="button" title="Undo" onClick={() => setDrafts(({ [r.circle]: _drop, ...rest }) => rest)}
                            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><Undo2 className="size-4" /></button>
                        )}
                      </div>
                      {d && change !== 0 && <div className="mt-1"><Pill color={BASIS_COLOUR[d.basis]}>{d.basis}</Pill></div>}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", change > 0 ? "text-emerald-600" : change < 0 ? "text-red-600" : "text-muted-foreground")}>
                      {change ? <>{signed(change)}<div className="text-[10px] font-normal">{r.quota ? `${signed(pct(change, r.quota))}%` : "new"}</div></> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(cover, 100)}%`, background: coverColour(cover) }} />
                        </div>
                        <span className="w-12 text-right text-xs font-semibold tabular-nums" style={{ color: coverColour(cover) }}>{q ? `${cover}%` : "—"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Input value={d?.remarks ?? r.remarks ?? ""} disabled={!editable} placeholder="Why?" aria-label={`Remarks for ${r.circle_name}`}
                        onChange={(e) => setDraft(r, { remarks: e.target.value })} className="h-8 w-36" />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.has_season_quota ? (
                        <div className="flex items-start gap-1.5">
                          <div>
                            <div className="text-foreground">{r.adjusted_by ?? "—"}</div>
                            <div>{r.adjusted_on ? dateTime(r.adjusted_on) : ""}{r.basis ? ` · ${r.basis}` : ""}</div>
                            {r.previous_quota != null && <div>was {num(r.previous_quota)}</div>}
                          </div>
                          {editable && (
                            <button type="button" title="Go back to the circle's own quota" onClick={() => void resetToCircle(r)}
                              className="rounded-md p-1 hover:bg-accent hover:text-foreground"><RotateCcw className="size-3.5" /></button>
                          )}
                        </div>
                      ) : "Circle default"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t bg-muted/40 font-semibold">
              <tr>
                <td />
                <td className="px-3 py-2.5">Total · {rows.length} circles</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{num(rows.reduce((s, r) => s + r.fields, 0))} fields</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{num(data.totals.expected)}</td>
                <td />
                <td className="px-3 py-2.5 text-right tabular-nums">{num(data.totals.quota)}</td>
                <td className="px-3 py-2.5 tabular-nums">{num(Math.round(draftTotal))}</td>
                <td className={cn("px-3 py-2.5 text-right tabular-nums", net > 0 ? "text-emerald-600" : net < 0 ? "text-red-600" : "text-muted-foreground")}>{net ? signed(net) : "—"}</td>
                <td className="px-3 py-2.5 text-xs" style={{ color: coverColour(coverNow) }}>{coverNow}%</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2"><History className="size-4 text-primary" /><h3 className="font-semibold">Adjustment history</h3></div>
        {data.history.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {data.history.map((h, i) => (
              <li key={i} className="flex gap-3 rounded-xl border px-3 py-2">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                <div><div>{plain(h.text)}</div><div className="text-xs text-muted-foreground">{h.by} · {dateTime(h.on)}</div></div>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-muted-foreground">No adjustments yet this season.</p>}
      </section>

      {dirty.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.35)] backdrop-blur lg:left-60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
            <div className="text-sm">
              <b>{dirty.length} circle(s) changed</b>
              <span className={cn("ml-2 font-semibold", net > 0 ? "text-emerald-600" : "text-red-600")}>{signed(net)} md</span>
              {gap !== null && <span className="ml-2 text-muted-foreground">· {gap === 0 ? "matches the target" : `${kmd(Math.abs(gap))} ${gap > 0 ? "short of" : "over"} the target`}</span>}
            </div>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for this adjustment (kept in the history)" className="h-9 min-w-[16rem] flex-1" aria-label="Reason" />
            <Button variant="outline" onClick={() => setDrafts({})}>Discard</Button>
            <Button onClick={() => void save()} disabled={saving}><Save />{saving ? "Saving…" : "Save quotas"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
