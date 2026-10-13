/** EagleEye survey dashboard for the active (or chosen) season. */
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";
import { AlertTriangle, Bug, Factory, Map as MapIcon, RefreshCw, Ruler, Sprout, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtInt } from "@/lib/format";
import { colourFor } from "@/lib/map";

interface Group { key: string; surveys: number; acres: number; maund: number }
interface Dash {
  season: string;
  kpis: Record<string, number>;
  by_circle: Group[];
  by_variety: Group[];
  by_disease: Group[];
  by_day: Group[];
  surveyors: { surveyor: string; surveyor_name: string; target_acres: number; target_surveys: number; done_acres: number; done_surveys: number }[];
  variety_colors: Record<string, string | null>;
}

const tooltip = { contentStyle: { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 } };
const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 11 };

export function SurveyDashboardPage() {
  const [season, setSeason] = useState("");
  const { data: seasons } = useFrappeGetCall<{ message: { seasons: { name: string; status: string }[]; season: string } }>(
    "sugarcane.api.v1.survey_map.meta", undefined, "survey-meta");
  const { data, isLoading, mutate } = useFrappeGetCall<{ message: Dash }>("sugarcane.api.v1.survey_map.dashboard", season ? { season } : undefined);
  const { hasRole } = useSession();
  const { call: recheck, loading: rechecking } = useFrappePostCall<{ message: { checked: number; new_reviews: number; open_reviews: number; tolerance_pct: number } }>(
    "sugarcane.eagleeye_survey.overlaps.recheck_season");
  const runRecheck = async () => {
    try {
      const { message: m } = await recheck(season ? { season } : {});
      toast.success(`${m.checked} surveys checked at ${m.tolerance_pct}% tolerance · ${m.new_reviews} new review(s) · ${m.open_reviews} open`);
      await mutate();
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Re-check failed");
    }
  };
  const d = data?.message;
  const k = d?.kpis ?? {};
  const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
  const tiles = [
    { icon: Ruler, label: "Surveyed cane area", value: `${fmtInt(k.acres)} acres`, sub: `${fmtInt(k.surveys)} fields` },
    { icon: Factory, label: "Expected cane", value: `${fmtInt(k.expected_maund)} md`, sub: k.acres ? `${fmtInt(k.expected_maund / k.acres)} md / acre` : "" },
    { icon: Users, label: "Growers surveyed", value: fmtInt(k.growers_surveyed), sub: `${pct(k.growers_surveyed, k.growers_total)}% of ${fmtInt(k.growers_total)}` },
    { icon: Sprout, label: "Ratoon area", value: `${fmtInt(k.ratoon_acres)} acres`, sub: `${pct(k.ratoon_acres, k.acres)}% of area` },
    { icon: Bug, label: "Diseased area", value: `${fmtInt(k.diseased_acres)} acres`, sub: `${pct(k.diseased_acres, k.acres)}% of area` },
    { icon: MapIcon, label: "Competitor cane", value: `${fmtInt(k.competitor_acres)} acres`, sub: "mapped, never indented" },
    { icon: AlertTriangle, label: "Open overlaps", value: fmtInt(k.open_overlaps), sub: "waiting for review", tone: k.open_overlaps ? "text-amber-600" : "" },
    { icon: UserCheck, label: "Surveyors present today", value: fmtInt(k.present_today), sub: new Date().toLocaleDateString("en-GB") },
  ];
  const varietyColour = (v: string) => colourFor(v, d?.variety_colors ?? {});

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold">Survey dashboard</h1>
          <p className="text-sm text-muted-foreground">EagleEye crop survey · season {d?.season ?? "…"}</p>
        </div>
        <Select className="w-48" value={season} onChange={(e) => setSeason(e.target.value)} aria-label="Season">
          <option value="">Active season</option>
          {(seasons?.message.seasons ?? []).map((s) => <option key={s.name} value={s.name}>{s.name} · {s.status}</option>)}
        </Select>
        {hasRole("Cane Manager", "Cane Admin", "Circle Officer") && (
          <Button variant="outline" className="h-10" disabled={rechecking} onClick={runRecheck} title="Check every submitted survey again against the current tolerance">
            <RefreshCw className={rechecking ? "animate-spin" : ""} />{rechecking ? "Re-checking…" : "Re-check overlaps"}
          </Button>
        )}
        <Link to="/survey" className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
          <MapIcon className="size-4" />Open survey map
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="hover-lift">
            <CardContent className="flex items-start gap-3 p-4">
              <div className="rounded-lg bg-primary/10 p-2.5 text-primary"><t.icon className="size-5" /></div>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{t.label}</div>
                {isLoading ? <Skeleton className="mt-1 h-6 w-20" /> : <div className={`text-lg font-semibold tabular-nums ${t.tone ?? ""}`}>{t.value}</div>}
                <div className="truncate text-[11px] text-muted-foreground">{t.sub}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Surveyed area by circle (acres)">
          <BarChart data={d?.by_circle ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="key" {...axis} interval={0} angle={-30} textAnchor="end" height={60} />
            <YAxis {...axis} />
            <Tooltip {...tooltip} formatter={(v: number) => fmtInt(v)} />
            <Bar dataKey="acres" name="Acres" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Area by variety">
          <PieChart>
            <Pie data={d?.by_variety ?? []} dataKey="acres" nameKey="key" innerRadius="45%" outerRadius="80%" paddingAngle={1}>
              {(d?.by_variety ?? []).map((g) => <Cell key={g.key} fill={varietyColour(g.key)} />)}
            </Pie>
            <Tooltip {...tooltip} formatter={(v: number) => `${fmtInt(v)} acres`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ChartCard>
        <ChartCard title="Fields surveyed per day">
          <LineChart data={d?.by_day ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="key" {...axis} tickFormatter={(v: string) => v.slice(5)} minTickGap={20} />
            <YAxis {...axis} />
            <Tooltip {...tooltip} />
            <Line type="monotone" dataKey="surveys" name="Fields" stroke="#e8590c" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="acres" name="Acres" stroke="#1971c2" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>
        <ChartCard title="Surveyors: target vs surveyed (acres)">
          <BarChart data={d?.surveyors ?? []} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" {...axis} />
            <YAxis type="category" dataKey="surveyor_name" {...axis} width={110} />
            <Tooltip {...tooltip} formatter={(v: number) => fmtInt(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="target_acres" name="Target" fill="hsl(var(--muted-foreground) / 0.35)" radius={[0, 4, 4, 0]} />
            <Bar dataKey="done_acres" name="Surveyed" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      {!!d?.by_disease.length && (
        <Card>
          <CardHeader><CardTitle>Disease</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {d.by_disease.map((g) => (
              <Link key={g.key} to={`/survey?`} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                <div className="font-medium">{g.key}</div>
                <div className="text-xs text-muted-foreground">{g.surveys} fields · {fmtInt(g.acres)} acres</div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <Card className="hover-outline">
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
