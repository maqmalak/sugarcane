/**
 * Field Force — insights (/field-force): who is in the field today, attendance and hours over the period, distance
 * travelled, geofence discipline, check-in punctuality, and each surveyor against the season target. Data:
 * sugarcane.api.v1.insights.field_force (scoped to the user's circles).
 */
import { useQuery } from "@tanstack/react-query";
import { Clock, MapPinned, Route, ShieldAlert, Smartphone, Target, UserCheck, UserCog } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Avatar, C, ChartCard, ChartTip, DataTable, Donut, Gauge, Highlights, KpiCard, Pill, Segmented, pctDelta, useChartTheme,
  type Highlight,
} from "@/sc/components/analytics/kit";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get } from "@/sc/lib/api";
import { num } from "@/sc/lib/format";
import { useTheme } from "@/sc/providers/theme";

interface Day { day: string; present: number; out_of_area: number; half_day: number; avg_hours: number; km: number; fields: number; acres: number; attendance_pct: number }
interface Board {
  surveyor: string; name: string; days: number; attendance_pct: number; avg_hours: number; km: number; km_per_day: number; out_of_area: number;
  late: number; fields: number; acres: number; target_acres: number; season_acres: number; achievement: number; last_in: string | null;
}
interface FieldForce {
  days: number; season: string;
  kpis: {
    surveyors: number; present_today: number; attendance_pct: number; avg_hours: number; avg_hours_before: number; km: number; km_per_day: number;
    out_of_area_pct: number; out_of_area_before: number; fields: number; acres: number; target_acres: number; season_acres: number; achievement: number;
    devices: { Approved: number; Pending: number; Blocked: number }; stale_devices: number;
  };
  trend: Day[];
  board: Board[];
  checkin: { name: string; value: number }[];
  status_mix: { name: string; value: number }[];
  highlights: Highlight[];
}
type Period = "7" | "14" | "30";

export function FieldForceInsightsPage() {
  const { dark } = useTheme();
  const t = useChartTheme(dark);
  const [period, setPeriod] = useState<Period>("14");
  const { data, isLoading } = useQuery({
    queryKey: ["sc-ff-insights", period], placeholderData: (p) => p,
    queryFn: () => get<FieldForce>("sugarcane.api.v1.insights.field_force", { days: period }),
  });
  if (isLoading || !data) {
    return <div className="grid gap-4 p-6 md:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>;
  }
  const k = data.kpis;
  const tr = data.trend.map((d) => ({ ...d, label: d.day.slice(5) }));

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-600"><UserCog className="size-4" />Field Force</div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Field force insights</h1>
          <p className="text-sm text-muted-foreground">Last {data.days} days · season {data.season} · comparisons against the {data.days} days before</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={period} onChange={setPeriod} options={[["7", "7 days"], ["14", "14 days"], ["30", "30 days"]]} />
          <Link to="/survey/map?layers=attendance" className="inline-flex h-9 items-center gap-2 rounded-lg border-[1.5px] border-input bg-input-bg px-3 text-sm font-semibold hover:bg-accent">
            <MapPinned className="size-4" />Attendance on map
          </Link>
          <Link to="/field-force/users" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90">
            <UserCog className="size-4" />Users & devices
          </Link>
        </div>
      </div>

      <Highlights items={data.highlights} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard icon={UserCheck} label="In the field today" value={`${k.present_today} / ${k.surveyors}`} color={C.emerald}
          progress={k.surveyors ? (100 * k.present_today) / k.surveyors : 0} spark={tr.map((d) => d.present)} sub={`${k.attendance_pct}% attendance over ${data.days} days`} />
        <KpiCard icon={Clock} label="Average working day" value={`${k.avg_hours} h`} color={C.blue}
          delta={pctDelta(k.avg_hours, k.avg_hours_before)} spark={tr.map((d) => d.avg_hours)} sub="Check-in to check-out" />
        <KpiCard icon={Route} label="Distance travelled" value={`${num(Math.round(k.km))} km`} color={C.violet} spark={tr.map((d) => d.km)} sub={`${k.km_per_day} km per surveyor-day`} />
        <KpiCard icon={ShieldAlert} label="Outside geofence" value={`${k.out_of_area_pct}%`} color={k.out_of_area_pct > 5 ? C.red : C.amber} deltaInvert
          delta={k.out_of_area_before ? pctDelta(k.out_of_area_pct, k.out_of_area_before) : null} spark={tr.map((d) => d.out_of_area)} sub="Check-ins outside the assigned circles" />
        <KpiCard icon={Target} label="Season target" value={`${k.achievement}%`} color={k.achievement >= 80 ? C.green : k.achievement >= 50 ? C.amber : C.red}
          progress={Math.min(k.achievement, 100)} sub={`${num(Math.round(k.season_acres))} of ${num(Math.round(k.target_acres))} acres`} />
        <KpiCard icon={Smartphone} label="Phones" value={`${k.devices.Approved} approved`} color={k.devices.Pending || k.stale_devices ? C.amber : C.teal}
          sub={`${k.devices.Pending} waiting · ${k.devices.Blocked} blocked · ${k.stale_devices} not synced 2+ days`} to="/field-force/users" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Daily attendance & output" sub="Bars: surveyors present (red: outside geofence) · lines: average hours and acres surveyed"
          insight={(() => { const best = [...tr].sort((a, b) => b.acres - a.acres)[0]; return best ? `Most productive day: ${best.label} with ${num(Math.round(best.acres))} acres.` : null; })()}>
          <ResponsiveContainer>
            <ComposedChart data={tr} margin={{ left: 0, right: 0, top: 8 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="label" stroke={t.axis} tick={t.tick} tickLine={false} axisLine={false} />
              <YAxis yAxisId="n" stroke={t.axis} tick={t.tick} width={32} allowDecimals={false} tickLine={false} axisLine={false} />
              <YAxis yAxisId="a" orientation="right" stroke={t.axis} tick={t.tick} width={44} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTip fmt={(v, key) => (key === "avg_hours" ? `${v} h` : key === "acres" ? `${num(Math.round(v))} ac` : String(v))} />} />
              <Bar yAxisId="n" dataKey="present" name="Present" stackId="p" fill={C.emerald} radius={[0, 0, 0, 0]} barSize={18} />
              <Bar yAxisId="n" dataKey="out_of_area" name="Outside geofence" stackId="p" fill={C.rose} radius={[6, 6, 0, 0]} barSize={18} />
              <Line yAxisId="n" type="monotone" dataKey="avg_hours" name="Avg hours" stroke={C.blue} strokeWidth={2.5} dot={false} />
              <Line yAxisId="a" type="monotone" dataKey="acres" name="Acres" stroke={C.amber} strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Team target" sub="Season acres surveyed against targets" bodyClass="h-auto">
          <div className="flex flex-col items-center gap-3 py-2">
            <Gauge value={Math.min(k.achievement, 100)} label={`${k.achievement}%`} sub="of the season target" />
            <div className="grid w-full grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-xl border p-2"><div className="text-muted-foreground">Surveyed</div><div className="font-bold">{num(Math.round(k.season_acres))} ac</div></div>
              <div className="rounded-xl border p-2"><div className="text-muted-foreground">Target</div><div className="font-bold">{num(Math.round(k.target_acres))} ac</div></div>
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Check-in times" sub="When surveyors start the day" insight={(() => { const late = data.board.reduce((s, b) => s + b.late, 0); return late ? `${late} check-in(s) after 08:30.` : "Everyone started by 08:30."; })()}>
          <ResponsiveContainer>
            <ComposedChart data={data.checkin} margin={{ left: 0, right: 0, top: 8 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="name" stroke={t.axis} tick={t.tick} tickLine={false} axisLine={false} />
              <YAxis stroke={t.axis} tick={t.tick} width={32} allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTip fmt={(v) => `${v} check-ins`} />} />
              <Bar dataKey="value" name="Check-ins" fill={C.sky} radius={[6, 6, 0, 0]} barSize={26} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Attendance status" bodyClass="h-auto">
          <Donut data={data.status_mix.map((s) => ({ name: s.name, value: s.value, color: s.name === "Present" ? C.green : s.name === "Half Day" ? C.amber : C.red }))} centerLabel="Days" />
        </ChartCard>
        <ChartCard title="Phones" bodyClass="h-auto" insight={k.stale_devices ? `${k.stale_devices} approved phone(s) silent for 2+ days.` : "All phones syncing."}>
          <Donut data={[
            { name: "Approved", value: k.devices.Approved, color: C.green }, { name: "Waiting", value: k.devices.Pending, color: C.amber },
            { name: "Blocked", value: k.devices.Blocked, color: C.red },
          ]} centerLabel="Phones" />
        </ChartCard>
      </div>

      <ChartCard title="Surveyor leaderboard" sub={`Ranked by season target achieved · attendance and output over the last ${data.days} days`} bodyClass="h-auto">
        <DataTable rows={data.board} rowKey={(r) => r.surveyor} rank initialSort={{ key: "achievement", dir: "desc" }} cols={[
          { key: "name", label: "Surveyor", render: (r) => (
            <span className="flex items-center gap-2"><Avatar name={r.name} /><span><b>{r.name}</b><span className="block text-[11px] text-muted-foreground">{r.surveyor}</span></span></span>
          ) },
          { key: "achievement", label: "Target", align: "right", value: (r) => r.achievement,
            render: (r) => <Pill color={r.achievement >= 80 ? C.green : r.achievement >= 50 ? C.amber : C.red}>{r.achievement}%</Pill>, bar: { color: C.emerald, max: 100 } },
          { key: "season_acres", label: "Season acres", align: "right", value: (r) => r.season_acres, render: (r) => `${num(Math.round(r.season_acres))} / ${num(Math.round(r.target_acres))}` },
          { key: "days", label: "Days", align: "right", value: (r) => r.days, render: (r) => `${r.days} (${r.attendance_pct}%)` },
          { key: "avg_hours", label: "Avg h", align: "right", value: (r) => r.avg_hours },
          { key: "km", label: "km", align: "right", value: (r) => r.km, hideSm: true },
          { key: "fields", label: "Fields", align: "right", value: (r) => r.fields },
          { key: "out_of_area", label: "Outside", align: "right", value: (r) => r.out_of_area, render: (r) => r.out_of_area ? <Pill color={C.red}>{r.out_of_area}</Pill> : "0" },
          { key: "late", label: "Late", align: "right", value: (r) => r.late, hideSm: true },
          { key: "last_in", label: "Last check-in", value: (r) => r.last_in ?? "", render: (r) => r.last_in ? r.last_in.slice(5, 16) : "—", hideSm: true },
        ]} />
      </ChartCard>
    </div>
  );
}
