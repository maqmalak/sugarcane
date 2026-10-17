/**
 * Indenting — insights (/indenting): entitled cane against indents issued and used, the next three weeks of indents
 * against the mill's daily capacity, status mix and per-circle progress. Data: sugarcane.cane_indenting.api.insights.
 */
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, ClipboardList, PauseCircle, ScanBarcode, Sprout, Ticket, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, ChartCard, ChartTip, DataTable, Donut, Highlights, KpiCard, axisShort, useChartTheme, type Highlight } from "@/sc/components/analytics/kit";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get } from "@/sc/lib/api";
import { num } from "@/sc/lib/format";
import { useTheme } from "@/sc/providers/theme";

interface Insights {
  season: string;
  standards: { load_maund: number; per_day: number; validity_days: number; first: string; end: string };
  kpis: { entitled: number; issued: number; used: number; indents: number; growers: number; loads_entitled: number; valid_today: number; held: number; draft_batches: number };
  status: { name: string; value: number }[];
  days: { date: string; indents: number; capacity: number }[];
  circles: { name: string; entitled: number; issued: number; used: number; expired: number; growers: number; cover: number }[];
  highlights: Highlight[];
}

const STATUS_COLOUR: Record<string, string> = { Draft: C.slate, Authorized: C.blue, Printed: C.teal, Used: C.green, Expired: C.red, Cancelled: "#868e96" };
const kmd = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)}M md` : `${num(Math.round(v / 1000))}k md`);
const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : 0);
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function IndentInsightsPage() {
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const { data, isLoading } = useQuery({ queryKey: ["sc-indent-insights"], queryFn: () => get<Insights>("sugarcane.cane_indenting.api.insights") });
  if (isLoading || !data) {
    return <div className="grid gap-4 p-6 md:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div>;
  }
  const k = data.kpis;
  const s = data.standards;
  const days = data.days.map((d) => ({ ...d, label: dayLabel(d.date), use: pct(d.indents, d.capacity) }));

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600"><ClipboardList className="size-4" />Indenting</div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Indent insights</h1>
          <p className="text-sm text-muted-foreground">
            Season {data.season} · {num(s.load_maund)} md per indent · {num(s.per_day)} indents a day at full intake · valid {s.validity_days} days
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/indenting/lookup" className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:bg-accent"><ScanBarcode className="size-4" />Look up</Link>
          <Link to="/indenting/generate" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"><Wand2 className="size-4" />Generate indents</Link>
        </div>
      </div>

      <Highlights items={data.highlights} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Sprout} label="Entitled cane" value={kmd(k.entitled)} color={C.green}
          sub={`${num(k.growers)} growers · ${num(k.loads_entitled)} loads for the season`} />
        <KpiCard icon={Ticket} label="Indents issued" value={num(k.indents)} color={C.blue} progress={Math.min(pct(k.issued, k.entitled), 100)}
          sub={`${kmd(k.issued)} · ${pct(k.issued, k.entitled)}% of entitled cane`} />
        <KpiCard icon={CalendarCheck} label="Valid today" value={num(k.valid_today)} color={C.teal}
          sub={`${kmd(k.used)} delivered against indents so far`} />
        <KpiCard icon={PauseCircle} label="Waiting" value={`${num(k.draft_batches)} batch${k.draft_batches === 1 ? "" : "es"}`} color={k.draft_batches ? C.amber : C.slate}
          sub={k.held ? `${num(k.held)} fields held for overlap review` : "no fields held back"} to={k.draft_batches ? "/approvals/inbox" : undefined} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Next three weeks" sub="Bars: indents per supply day · line: share of the mill's daily capacity" className="xl:col-span-2"
          insight={(() => {
            const busy = days.filter((d) => d.use > 90).length;
            const empty = days.filter((d) => !d.indents).length;
            return [busy ? `${busy} day(s) above 90% of capacity` : null, empty ? `${empty} day(s) with no indents yet — generate the next batch` : null]
              .filter(Boolean).join(" · ") || "Indents are spread evenly across the coming days.";
          })()}>
          <ResponsiveContainer>
            <ComposedChart data={days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: t.axis, fontSize: 11 }} interval={1} />
              <YAxis yAxisId="v" tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={axisShort} width={40} />
              <YAxis yAxisId="p" orientation="right" tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={40} domain={[0, 100]} />
              <Tooltip content={<ChartTip fmt={(v, key) => (key === "use" ? `${v}%` : num(Number(v)))} />} />
              <Bar yAxisId="v" dataKey="indents" name="Indents" fill={C.blue} radius={[6, 6, 0, 0]} barSize={16} />
              <Line yAxisId="p" dataKey="use" name="Capacity used" stroke={C.amber} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Indents by status" sub="All indents of the season">
          <Donut data={data.status.map((x) => ({ ...x, color: STATUS_COLOUR[x.name] }))} centerLabel="Indents" fmt={(v) => num(v)} />
        </ChartCard>
      </div>

      <ChartCard title="Circles" sub="Entitled cane against indents issued and used" bodyClass="h-auto" className="w-full">
        <DataTable rows={data.circles} rowKey={(r) => r.name} initialSort={{ key: "cover", dir: "asc" }}
          cols={[
            { key: "name", label: "Circle", value: (r) => r.name, render: (r) => <span className="font-semibold">{r.name}</span> },
            { key: "growers", label: "Growers", align: "right", render: (r) => num(r.growers), value: (r) => r.growers },
            { key: "entitled", label: "Entitled", align: "right", render: (r) => kmd(r.entitled), value: (r) => r.entitled },
            { key: "issued", label: "Issued", align: "right", render: (r) => kmd(r.issued), value: (r) => r.issued },
            { key: "cover", label: "Issued %", render: (r) => (
              <div className="flex items-center gap-2">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(r.cover, 100)}%` }} /></div>
                <span className="text-xs tabular-nums">{r.cover}%</span>
              </div>), value: (r) => r.cover },
            { key: "used", label: "Used", align: "right", render: (r) => kmd(r.used), value: (r) => r.used },
            { key: "expired", label: "Expired", align: "right", render: (r) => (r.expired ? <span className="font-semibold text-red-600">{num(r.expired)}</span> : "—"), value: (r) => r.expired },
          ]} />
      </ChartCard>
    </div>
  );
}
