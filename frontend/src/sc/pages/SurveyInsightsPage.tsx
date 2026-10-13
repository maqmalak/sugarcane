/**
 * EagleEye Survey — insights (/survey): headline KPIs with 30-day comparisons, plain-language highlights, the survey
 * pace, varieties, circles against quota, competitor pressure, crop health and survey accuracy. Built on the
 * real-estate analytics kit. Data: sugarcane.api.v1.insights.survey (scoped to the user's circles).
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Factory, Leaf, Map as MapIcon, Ruler, Sprout, Target, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  C, ChartCard, ChartTip, DataTable, Donut, Gauge, Highlights, KpiCard, Pill, Segmented, axisShort, pctDelta, useChartTheme,
  type Highlight,
} from "@/sc/components/analytics/kit";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get } from "@/sc/lib/api";
import { num } from "@/sc/lib/format";
import { colourFor } from "@/sc/lib/map";
import { useAuth } from "@/sc/providers/auth";
import { useTheme } from "@/sc/providers/theme";

interface Group { name: string; fields: number; acres: number; expected: number; growers: number }
interface Variety extends Group { color?: string | null; maturity?: string | null; yield: number; share: number }
interface CircleRow { name: string; code?: string; zone?: string; affiliation?: string; fields: number; growers: number; acres: number; expected: number; quota: number; quota_cover: number; competitor_acres: number; competitor_share: number }
interface Survey {
  season: string;
  kpis: Record<string, number>;
  compare: { fields: [number, number]; acres: [number, number]; expected: [number, number] };
  trend: { week: string; fields: number; acres: number; expected: number; competitor: number; diseased: number; cumulative: number }[];
  by_variety: Variety[];
  by_circle: CircleRow[];
  by_disease: { name: string; fields: number; acres: number; avg_pct: number }[];
  crop_type: { name: string; value: number }[];
  condition: { name: string; value: number }[];
  grower_category: { name: string; value: number }[];
  competitor_mills: { name: string; value: number }[];
  accuracy: { name: string; value: number }[];
  top_growers: { grower: string; grower_name: string; acres: number; fields: number; expected: number; circle: string; village: string }[];
  overlaps: Record<string, number>;
  highlights: Highlight[];
}
type Section = "all" | "progress" | "crop" | "circles" | "quality";
const SECTIONS: [Section, string][] = [["all", "Everything"], ["progress", "Progress"], ["crop", "Crop"], ["circles", "Circles & competitors"], ["quality", "Data quality"]];

const md = (v: number) => `${num(Math.round(v))} md`;
const ac = (v: number) => `${num(Math.round(v))} ac`;

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return <div className="pt-2"><h2 className="text-lg font-bold tracking-tight">{title}</h2><p className="text-xs text-muted-foreground">{sub}</p></div>;
}

export function SurveyInsightsPage() {
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const { boot } = useAuth();
  const [section, setSection] = useState<Section>("all");
  const { data, isLoading } = useQuery({ queryKey: ["sc-survey-insights"], queryFn: () => get<Survey>("sugarcane.api.v1.insights.survey") });
  if (isLoading || !data) {
    return <div className="grid gap-4 p-6 md:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>;
  }
  const k = data.kpis;
  const show = (s: Section) => section === "all" || section === s;
  const tr = data.trend;
  const varietyColour = (v: Variety, i: number) => v.color ?? colourFor(v.name) ?? [C.teal, C.blue, C.amber][i % 3];

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600"><Leaf className="size-4" />EagleEye Survey</div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Crop survey insights</h1>
          <p className="text-sm text-muted-foreground">Season {data.season} · {boot?.company} · comparisons are the last 30 days against the 30 before</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={section} onChange={setSection} options={SECTIONS} />
          <Link to="/survey/map" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90">
            <MapIcon className="size-4" />Survey map
          </Link>
        </div>
      </div>

      <Highlights items={data.highlights} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard icon={Ruler} label="Surveyed cane area" value={ac(k.acres)} color={C.emerald}
          delta={pctDelta(data.compare.acres[0], data.compare.acres[1])} spark={tr.map((r) => r.acres)}
          sub={`${num(k.fields)} fields · ${ac(data.compare.acres[0])} in the last 30 days`} to="/survey/d/cane-survey" />
        <KpiCard icon={Factory} label="Expected cane" value={`${num(Math.round(k.expected / 1000))}k md`} color={C.blue}
          delta={pctDelta(data.compare.expected[0], data.compare.expected[1])} spark={tr.map((r) => r.expected)} sub={`${num(k.yield)} maund per acre`} />
        <KpiCard icon={Target} label="Quota covered" value={`${k.quota_cover}%`} color={k.quota_cover >= 90 ? C.green : k.quota_cover >= 60 ? C.amber : C.red}
          progress={Math.min(k.quota_cover, 100)} sub={`Expected cane against circle quotas of ${num(Math.round(k.quota / 1000))}k md`} />
        <KpiCard icon={Users} label="Growers surveyed" value={`${num(k.growers_surveyed)} / ${num(k.growers_total)}`} color={C.violet}
          progress={k.growers_total ? (100 * k.growers_surveyed) / k.growers_total : 0} sub={`${k.non_passbook} non-passbook by CNIC`} to="/survey/growers" />
        <KpiCard icon={Sprout} label="Ratoon · diseased" value={`${k.ratoon_pct}% · ${k.diseased_pct}%`} color={C.amber} sub="Share of surveyed area" />
        <KpiCard icon={AlertTriangle} label="Competitor cane" value={ac(k.competitor_acres)} color={C.rose}
          sub={`${k.competitor_share}% of mapped cane · ${k.open_overlaps} overlaps open`} to="/survey/d/survey-overlap-review" />
      </div>

      {show("progress") && <>
        <SectionTitle title="Survey progress" sub="How fast the season's cane is being mapped" />
        <div className="grid gap-4 xl:grid-cols-3">
          <ChartCard className="xl:col-span-2" title="Weekly survey pace" sub="Bars: acres surveyed per week · line: cumulative · area: competitor cane"
            insight={tr.length ? `${num(tr.reduce((s, r) => s + r.fields, 0))} fields in ${tr.length} weeks; best week ${(() => { const b = [...tr].sort((a, c) => c.acres - a.acres)[0]; return `${b.week.slice(5)} with ${ac(b.acres)}`; })()}.` : null}>
            <ResponsiveContainer>
              <ComposedChart data={tr} margin={{ left: 0, right: 0, top: 8 }}>
                <defs>
                  <linearGradient id="sc-acres" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.emerald} stopOpacity={0.95} /><stop offset="100%" stopColor={C.teal} stopOpacity={0.55} /></linearGradient>
                </defs>
                <CartesianGrid stroke={t.grid} vertical={false} />
                <XAxis dataKey="week" stroke={t.axis} tick={t.tick} tickFormatter={(v: string) => v.slice(5)} tickLine={false} axisLine={false} />
                <YAxis yAxisId="a" stroke={t.axis} tick={t.tick} tickFormatter={axisShort} width={44} tickLine={false} axisLine={false} />
                <YAxis yAxisId="c" orientation="right" stroke={t.axis} tick={t.tick} tickFormatter={axisShort} width={44} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip fmt={(v) => ac(v)} />} />
                <Area yAxisId="a" type="monotone" dataKey="competitor" name="Competitor" stroke={C.rose} fill={C.rose} fillOpacity={0.12} />
                <Bar yAxisId="a" dataKey="acres" name="Surveyed" fill="url(#sc-acres)" radius={[6, 6, 0, 0]} barSize={22} />
                <Line yAxisId="c" type="monotone" dataKey="cumulative" name="Cumulative" stroke={C.blue} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Season quota" sub="Expected cane against the circles' quotas" bodyClass="h-auto"
            actions={<Link to="/survey/quota" className="text-xs font-semibold text-primary hover:underline">Adjust quotas →</Link>}
            insight={k.quota_cover < 100 ? `${num(Math.round((k.quota - k.expected) / 1000))}k maund still to find.` : "Survey covers the full quota."}>
            <div className="flex flex-col items-center gap-3 py-2">
              <Gauge value={Math.min(k.quota_cover, 100)} label={`${k.quota_cover}%`} sub="of quota surveyed" color={k.quota_cover >= 90 ? C.green : C.amber} />
              <div className="grid w-full grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-xl border p-2"><div className="text-muted-foreground">Expected</div><div className="font-bold">{md(k.expected)}</div></div>
                <div className="rounded-xl border p-2"><div className="text-muted-foreground">Quota</div><div className="font-bold">{md(k.quota)}</div></div>
              </div>
            </div>
          </ChartCard>
        </div>
      </>}

      {show("crop") && <>
        <SectionTitle title="Crop" sub="Varieties, plant / ratoon, condition and disease" />
        <div className="grid gap-4 xl:grid-cols-3">
          <ChartCard title="Area by variety" sub="Share of surveyed cane" bodyClass="h-auto"
            insight={data.by_variety[0] ? `${data.by_variety[0].name} leads with ${data.by_variety[0].share}%.` : null}>
            <Donut data={data.by_variety.slice(0, 8).map((v, i) => ({ name: v.name, value: v.acres, color: varietyColour(v, i) }))}
              centerLabel="Acres" centerValue={num(Math.round(k.acres))} fmt={(v) => ac(v)} legendFmt={(s) => `${ac(s.value)}`} />
          </ChartCard>
          <ChartCard title="Plant vs ratoon" bodyClass="h-auto">
            <Donut data={data.crop_type.map((c) => ({ name: c.name, value: c.value, color: c.name === "Ratoon" ? C.amber : C.emerald }))} centerLabel="Acres" fmt={(v) => ac(v)} />
          </ChartCard>
          <ChartCard title="Crop condition" bodyClass="h-auto">
            <Donut data={data.condition.map((c) => ({ name: c.name, value: c.value, color: c.name === "Good" ? C.green : c.name === "Average" ? C.amber : C.red }))} centerLabel="Acres" fmt={(v) => ac(v)} />
          </ChartCard>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Varieties" sub="Area, expected cane and the variety's yield" bodyClass="h-auto">
            <DataTable rows={data.by_variety} rowKey={(r) => r.name} initialSort={{ key: "acres", dir: "desc" }} rank dense cols={[
              { key: "name", label: "Variety", render: (r) => <span className="flex items-center gap-2 font-semibold"><span className="size-2.5 rounded-full" style={{ background: r.color ?? C.teal }} />{r.name}</span> },
              { key: "maturity", label: "Maturity", render: (r) => r.maturity ? <Pill color={r.maturity === "Early" ? C.green : r.maturity === "Late" ? C.violet : C.blue}>{r.maturity}</Pill> : "—" },
              { key: "fields", label: "Fields", align: "right", value: (r) => r.fields },
              { key: "acres", label: "Acres", align: "right", value: (r) => r.acres, render: (r) => num(Math.round(r.acres)), bar: { color: (r) => r.color ?? C.emerald } },
              { key: "expected", label: "Expected (md)", align: "right", value: (r) => r.expected, render: (r) => num(Math.round(r.expected)) },
              { key: "share", label: "Share", align: "right", value: (r) => r.share, render: (r) => `${r.share}%` },
            ]} />
          </ChartCard>
          <ChartCard title="Disease" sub="Diseased area and average infection" bodyClass="h-auto"
            insight={data.by_disease[0] ? `${data.by_disease[0].name} is the most widespread (${ac(data.by_disease[0].acres)}).` : "No disease recorded."}>
            <DataTable rows={data.by_disease} rowKey={(r) => r.name} initialSort={{ key: "acres", dir: "desc" }} dense cols={[
              { key: "name", label: "Disease", render: (r) => <span className="font-semibold">{r.name}</span> },
              { key: "fields", label: "Fields", align: "right", value: (r) => r.fields },
              { key: "acres", label: "Acres", align: "right", value: (r) => r.acres, render: (r) => num(Math.round(r.acres)) },
              { key: "avg_pct", label: "Avg infection", align: "right", value: (r) => r.avg_pct, render: (r) => <Pill color={r.avg_pct >= 20 ? C.red : r.avg_pct >= 10 ? C.amber : C.green}>{r.avg_pct}%</Pill> },
            ]} />
          </ChartCard>
        </div>
      </>}

      {show("circles") && <>
        <SectionTitle title="Circles & competitors" sub="Expected cane against quota, and how much cane other mills hold" />
        <ChartCard title="Circles against quota" sub="Bars: expected cane · line: quota covered %" className="w-full"
          insight={(() => { const low = data.by_circle.filter((c) => c.quota && c.quota_cover < 60).length; return low ? `${low} circle(s) below 60% of quota.` : "Every circle is above 60% of quota."; })()}>
          <ResponsiveContainer>
            <ComposedChart data={data.by_circle} margin={{ left: 0, right: 0, top: 8 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="name" stroke={t.axis} tick={t.tick} interval={0} angle={-25} textAnchor="end" height={60} tickLine={false} axisLine={false} />
              <YAxis yAxisId="v" stroke={t.axis} tick={t.tick} tickFormatter={axisShort} width={48} tickLine={false} axisLine={false} />
              <YAxis yAxisId="p" orientation="right" stroke={t.axis} tick={t.tick} tickFormatter={(v: number) => `${v}%`} width={44} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTip fmt={(v, key) => (key === "quota_cover" ? `${v}%` : md(v))} />} />
              <Bar yAxisId="v" dataKey="quota" name="Quota" fill={C.slate} opacity={0.35} radius={[6, 6, 0, 0]} barSize={16} />
              <Bar yAxisId="v" dataKey="expected" name="Expected" fill={C.emerald} radius={[6, 6, 0, 0]} barSize={16} />
              <Line yAxisId="p" type="monotone" dataKey="quota_cover" name="Covered %" stroke={C.amber} strokeWidth={2.5} dot />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <div className="grid gap-4 xl:grid-cols-3">
          <ChartCard className="xl:col-span-2" title="Circle scorecard" bodyClass="h-auto">
            <DataTable rows={data.by_circle} rowKey={(r) => r.name} initialSort={{ key: "expected", dir: "desc" }} dense cols={[
              { key: "name", label: "Circle", render: (r) => <span><span className="font-mono text-[11px] text-muted-foreground">{r.code}</span> <b>{r.name}</b></span> },
              { key: "affiliation", label: "Type", render: (r) => <Pill color={r.affiliation === "Own" ? C.green : r.affiliation === "Free" ? C.amber : C.blue}>{r.affiliation ?? "—"}</Pill> },
              { key: "growers", label: "Growers", align: "right", value: (r) => r.growers },
              { key: "acres", label: "Acres", align: "right", value: (r) => r.acres, render: (r) => num(Math.round(r.acres)), bar: { color: C.emerald } },
              { key: "quota_cover", label: "Quota", align: "right", value: (r) => r.quota_cover, render: (r) => <Pill color={r.quota_cover >= 90 ? C.green : r.quota_cover >= 60 ? C.amber : C.red}>{r.quota_cover}%</Pill> },
              { key: "competitor_share", label: "Competitor", align: "right", value: (r) => r.competitor_share, render: (r) => `${r.competitor_share}%` },
            ]} />
          </ChartCard>
          <ChartCard title="Competitor mills" sub="Cane mapped for other mills" bodyClass="h-auto"
            insight={data.competitor_mills[0] ? `${data.competitor_mills[0].name} holds the most (${ac(data.competitor_mills[0].value)}).` : null}>
            <Donut data={data.competitor_mills.map((m, i) => ({ name: m.name, value: m.value, color: [C.rose, C.orange, C.violet, C.slate][i % 4] }))}
              centerLabel="Acres" centerValue={num(Math.round(k.competitor_acres))} fmt={(v) => ac(v)} />
          </ChartCard>
        </div>
      </>}

      {show("quality") && <>
        <SectionTitle title="Data quality" sub="How closely declared areas match the measured boundaries, and overlaps" />
        <div className="grid gap-4 xl:grid-cols-3">
          <ChartCard title="Declared vs measured" sub="Fields by difference between the declared cane area and the GPS boundary" bodyClass="h-auto"
            insight={(() => { const tot = data.accuracy.reduce((s, b) => s + b.value, 0); const ok = data.accuracy.find((b) => b.name === "±5%")?.value ?? 0; return tot ? `${Math.round((100 * ok) / tot)}% of fields within ±5%.` : null; })()}>
            <Donut data={data.accuracy.map((b) => ({ name: b.name, value: b.value, color: b.name === "±5%" ? C.green : b.name.includes("10") && !b.name.includes("…") ? C.red : C.amber }))} centerLabel="Fields" />
          </ChartCard>
          <ChartCard title="Overlap reviews" bodyClass="h-auto" insight={data.overlaps.Open ? `${data.overlaps.Open} waiting for a decision.` : "Nothing waiting."}>
            <Donut data={[
              { name: "Open", value: data.overlaps.Open, color: C.amber }, { name: "Accepted", value: data.overlaps.Accepted, color: C.blue },
              { name: "Rejected", value: data.overlaps["Rejected Survey"] + data.overlaps["Rejected Other Survey"], color: C.red },
            ]} centerLabel="Reviews" />
          </ChartCard>
          <ChartCard title="Grower type" bodyClass="h-auto">
            <Donut data={data.grower_category.map((g) => ({ name: g.name, value: g.value, color: g.name.startsWith("Non") ? C.violet : C.emerald }))} centerLabel="Acres" fmt={(v) => ac(v)} />
          </ChartCard>
        </div>
        <ChartCard title="Largest growers" sub="Top 10 by surveyed area" bodyClass="h-auto">
          <DataTable rows={data.top_growers} rowKey={(r) => r.grower} rank dense cols={[
            { key: "grower_name", label: "Grower", render: (r) => <Link className="font-semibold hover:underline" to={`/setup/d/grower/${encodeURIComponent(r.grower)}`}>{r.grower_name}</Link> },
            { key: "grower", label: "ID", render: (r) => <span className="font-mono text-xs">{r.grower}</span> },
            { key: "circle", label: "Circle" },
            { key: "fields", label: "Fields", align: "right", value: (r) => r.fields },
            { key: "acres", label: "Acres", align: "right", value: (r) => r.acres, render: (r) => num(r.acres) },
            { key: "expected", label: "Expected (md)", align: "right", value: (r) => r.expected, render: (r) => num(Math.round(r.expected)) },
          ]} />
        </ChartCard>
      </>}
    </div>
  );
}
