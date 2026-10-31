import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  CalendarClock, ChevronLeft, ChevronRight, Clock3, Fingerprint, Hourglass, Repeat, Settings2, Timer, UserX, Users2, LogOut,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ChartCard } from "@/components/charts/chart-card";
import { BarChart } from "@/components/charts/charts";
import { SectionCard } from "@/components/common/section-card";
import { KpiGrid } from "@/components/doc/dashboard-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NameSelect } from "@/components/hr/period-filter";
import { useHrInsights } from "@/hooks/useHrInsights";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError, postCall } from "@/services/frappe";
import { addDaysISO, formatDate, todayISO } from "@/utils/dates";
import { cn } from "@/utils/cn";
import { shiftHours } from "./hr-configs";

interface ShiftRow {
  name: string;
  start_time: string;
  end_time: string;
  color?: string;
  enable_auto_attendance?: number;
  enable_late_entry_marking?: number;
  late_entry_grace_period?: number;
  enable_early_exit_marking?: number;
  early_exit_grace_period?: number;
  allow_overtime?: number;
  overtime_type?: string;
  last_sync_of_checkin?: string | null;
  assigned: number;
  departments: Record<string, number>;
  attendance: Record<string, number>;
  late: number;
  early: number;
  early_in: number;
  checkins: number;
  checked_in: number;
}
interface Overview {
  date: string;
  shifts: ShiftRow[];
  without_shift_type: Omit<ShiftRow, "name" | "start_time" | "end_time" | "assigned" | "departments">;
  headcount: number;
  on_shift: number;
  unassigned: number;
  pending_requests: number;
}

/** Frappe shift colours → bar colours. */
const SHIFT_COLORS: Record<string, string> = {
  Blue: "bg-blue-500", Cyan: "bg-cyan-500", Fuchsia: "bg-fuchsia-500", Green: "bg-emerald-500", Lime: "bg-lime-500",
  Orange: "bg-orange-500", Pink: "bg-pink-500", Red: "bg-rose-500", Violet: "bg-violet-500", Yellow: "bg-amber-400",
};
const PALETTE = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-cyan-500", "bg-rose-500", "bg-lime-500", "bg-fuchsia-500"];
const minutes = (t: string) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
};
const hhmm = (t?: string) => (t ? String(t).padStart(8, "0").slice(0, 5) : "—");
const strip = (d?: string) => (d ? d.replace(/ - [A-Z0-9]{2,6}$/, "").replace(/\s{2,}/g, " ") : "Not set");

/** Where a shift sits on a 24-hour track — one segment, or two when it crosses midnight. */
function segments(start: string, end: string): { left: number; width: number }[] {
  const s = minutes(start);
  const e = minutes(end);
  const pct = (m: number) => (m / 1440) * 100;
  if (e > s) return [{ left: pct(s), width: pct(e - s) }];
  return [{ left: pct(s), width: pct(1440 - s) }, { left: 0, width: pct(e) }];
}

function Timeline({ shifts }: { shifts: ShiftRow[] }) {
  const now = new Date();
  const nowPct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;
  return (
    <div className="space-y-1">
      <div className="ml-[180px] flex justify-between pr-1 text-[10px] text-muted-foreground xl:mr-[222px]">
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => <span key={h}>{String(h).padStart(2, "0")}</span>)}
      </div>
      {shifts.map((s, i) => {
        const color = (s.color && SHIFT_COLORS[s.color]) || PALETTE[i % PALETTE.length];
        const marked = Object.values(s.attendance).reduce((a, b) => a + b, 0);
        return (
          <div key={s.name} className="group flex items-center gap-3">
            <Link to={`/hr/shift-types/${encodeURIComponent(s.name)}`} className="w-[168px] shrink-0 truncate text-right text-sm font-medium hover:text-primary hover:underline" title={s.name}>
              {s.name}
            </Link>
            <div className="relative h-9 flex-1 overflow-hidden rounded-md bg-muted/50">
              {[3, 6, 9, 12, 15, 18, 21].map((h) => <span key={h} className="absolute inset-y-0 w-px bg-border/70" style={{ left: `${(h / 24) * 100}%` }} />)}
              {segments(s.start_time, s.end_time).map((seg, k, all) => (
                <div
                  key={k}
                  className={cn("absolute inset-y-1 flex items-center overflow-hidden rounded px-2 text-[11px] font-medium text-white shadow-sm transition-all group-hover:inset-y-0.5", color)}
                  style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
                  title={`${s.name}: ${hhmm(s.start_time)} – ${hhmm(s.end_time)}`}
                >
                  {seg.width === Math.max(...all.map((x) => x.width)) && <span className="truncate">{hhmm(s.start_time)}–{hhmm(s.end_time)} · {s.assigned} assigned{marked ? ` · ${marked} marked` : ""}</span>}
                </div>
              ))}
              <span className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${nowPct}%` }} title="Now" />
            </div>
            <div className="hidden w-[210px] shrink-0 flex-wrap gap-1 xl:flex">
              {s.enable_late_entry_marking ? <Chip tone="amber">late +{s.late_entry_grace_period ?? 0}m</Chip> : <Chip tone="slate">no late mark</Chip>}
              {s.enable_early_exit_marking ? <Chip tone="orange">early −{s.early_exit_grace_period ?? 0}m</Chip> : null}
              {s.allow_overtime ? <Chip tone="violet">OT</Chip> : null}
              {s.enable_auto_attendance ? <Chip tone="emerald">auto</Chip> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Chip({ tone, children }: { tone: "amber" | "orange" | "violet" | "emerald" | "slate"; children: React.ReactNode }) {
  const tones = {
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    orange: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    slate: "bg-muted text-muted-foreground",
  };
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", tones[tone])}>{children}</span>;
}

/** One-click grace period for every shift (turns on late check-in and early check-out marking). */
function GraceControl({ onDone }: { onDone: () => void }) {
  const [minutesValue, setMinutesValue] = useState("30");
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    const m = Number(minutesValue);
    if (!Number.isFinite(m) || m < 0 || m > 240) return toast.error("Enter 0–240 minutes.");
    setBusy(true);
    try {
      const r = await postCall<{ updated: string[] }>("sugarcane.erp_insights.hr_insights.set_shift_grace", { minutes: m });
      toast.success(`${m}-minute grace applied to ${r.updated.length} shifts`);
      notifyDataChanged();
      onDone();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className="hidden whitespace-nowrap text-xs text-muted-foreground md:inline">Grace for all shifts</span>
      <div className="w-16"><Input value={minutesValue} onChange={(e) => setMinutesValue(e.target.value)} inputMode="numeric" className="h-8 text-center" aria-label="Grace minutes" /></div>
      <span className="text-xs text-muted-foreground">min</span>
      <Button size="sm" variant="outline" onClick={() => void apply()} loading={busy}>
        <Timer className="h-4 w-4" /> Apply
      </Button>
    </div>
  );
}

export default function ShiftsOverviewPage() {
  const { company } = useCompanyContext();
  const { hasRole } = useAuth();
  const [day, setDay] = useState(todayISO());
  const [department, setDepartment] = useState("");
  const [branch, setBranch] = useState("");
  const { data: ov, isLoading, mutate } = useHrInsights<Overview>("shift_overview", { date: day, company, department, branch });

  const shifts = ov?.shifts ?? [];
  const late = shifts.reduce((a, s) => a + s.late, 0) + (ov?.without_shift_type.late ?? 0);
  const early = shifts.reduce((a, s) => a + s.early, 0) + (ov?.without_shift_type.early ?? 0);
  const checkedIn = shifts.reduce((a, s) => a + s.checked_in, 0) + (ov?.without_shift_type.checked_in ?? 0);
  const attendanceByShift = [
    ...shifts.map((s) => ({ shift: s.name, ...s.attendance, late: s.late })),
    ...(Object.keys(ov?.without_shift_type.attendance ?? {}).length ? [{ shift: "No shift on record", ...ov!.without_shift_type.attendance, late: ov!.without_shift_type.late }] : []),
  ].filter((r) => Object.entries(r).some(([k, v]) => k !== "shift" && Number(v) > 0));

  // Department mix across all shifts that day.
  const deptTotals: Record<string, number> = {};
  shifts.forEach((s) => Object.entries(s.departments).forEach(([d, n]) => (deptTotals[d] = (deptTotals[d] ?? 0) + n)));
  const topDepts = Object.entries(deptTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([d]) => d);
  const mixData = shifts.filter((s) => s.assigned).map((s) => ({ shift: s.name, ...Object.fromEntries(topDepts.map((d) => [strip(d), s.departments[d] ?? 0])) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shifts"
        subtitle={`${formatDate(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} — who works when, punctuality and coverage`}
        icon={<Clock3 className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {hasRole() && <GraceControl onDone={() => void mutate()} />}
            <Link to="/hr/shift-types/new"><Button variant="primary" size="sm"><Clock3 className="h-4 w-4" /> New Shift Type</Button></Link>
          </div>
        }
      />

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <button type="button" onClick={() => setDay(addDaysISO(day, -1))} className="flex h-9 w-9 items-center justify-center rounded-md border border-input hover:bg-accent" aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></button>
        <div className="w-40"><Input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Day" /></div>
        <button type="button" onClick={() => setDay(addDaysISO(day, 1))} className="flex h-9 w-9 items-center justify-center rounded-md border border-input hover:bg-accent" aria-label="Next day"><ChevronRight className="h-4 w-4" /></button>
        {day !== todayISO() && <button type="button" onClick={() => setDay(todayISO())} className="h-9 rounded-md px-2.5 text-xs font-medium text-primary hover:bg-primary/10">Today</button>}
        <div className="ml-auto flex flex-wrap gap-2">
          <NameSelect doctype="Department" value={department} onChange={setDepartment} placeholder="All departments" filters={company ? [["company", "=", company]] : undefined} />
          <NameSelect doctype="Branch" value={branch} onChange={setBranch} placeholder="All branches" />
        </div>
      </Card>

      <KpiGrid
        items={[
          { label: "Shift types", value: isLoading && !ov ? "…" : shifts.length, icon: <Clock3 className="h-4 w-4" />, tone: "sky", valueSuffix: `${shifts.filter((s) => s.allow_overtime).length} with OT` },
          { label: "Assigned a shift", value: (ov?.on_shift ?? 0).toLocaleString(), icon: <Users2 className="h-4 w-4" />, tone: "emerald", valueSuffix: ov?.headcount ? `of ${ov.headcount}` : undefined },
          { label: "No shift assigned", value: (ov?.unassigned ?? 0).toLocaleString(), icon: <UserX className="h-4 w-4" />, tone: ov?.unassigned ? "amber" : "slate" },
          { label: "Checked in", value: checkedIn.toLocaleString(), icon: <Fingerprint className="h-4 w-4" />, tone: "indigo" },
          { label: "Late / early out", value: `${late} / ${early}`, icon: <LogOut className="h-4 w-4" />, tone: late ? "rose" : "slate" },
          { label: "Shift requests", value: ov?.pending_requests ?? 0, icon: <Repeat className="h-4 w-4" />, tone: ov?.pending_requests ? "amber" : "slate", valueSuffix: "pending" },
        ]}
      />

      <SectionCard title="Shift timeline" description="Every shift across the day — grace periods, overtime and auto attendance on the right; the line marks now">
        {shifts.length ? <Timeline shifts={shifts} /> : <p className="py-10 text-center text-sm text-muted-foreground">No shift types yet.</p>}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Attendance by shift" subtitle="Records for the day, by the shift on the attendance">
          {attendanceByShift.length ? (
            <BarChart
              data={attendanceByShift}
              xKey="shift"
              stacked
              legend
              angledLabels
              height={300}
              series={[
                { key: "Present", label: "Present", color: "hsl(160 84% 39%)" },
                { key: "Half Day", label: "Half day", color: "hsl(173 80% 40%)" },
                { key: "On Leave", label: "On leave", color: "hsl(38 92% 50%)" },
                { key: "Absent", label: "Absent", color: "hsl(351 95% 59%)" },
              ]}
            />
          ) : (
            <p className="py-20 text-center text-sm text-muted-foreground">No attendance marked for this day.</p>
          )}
        </ChartCard>
        <ChartCard title="Who works which shift" subtitle={mixData.length ? "Assigned employees by department (top 6)" : "Shift assignments covering this day"}>
          {mixData.length ? (
            <BarChart data={mixData} xKey="shift" stacked legend angledLabels height={300} series={topDepts.map((d, i) => ({ key: strip(d), label: strip(d), color: ["hsl(199 89% 48%)", "hsl(160 84% 39%)", "hsl(262 83% 58%)", "hsl(38 92% 50%)", "hsl(330 81% 60%)", "hsl(215 16% 55%)"][i] }))} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
              No active shift assignment covers this day.
              <Link to="/hr/shift-assignments/new"><Button size="sm" variant="outline"><CalendarClock className="h-4 w-4" /> Assign a shift</Button></Link>
            </div>
          )}
        </ChartCard>
      </div>

      <SectionCard title="Per shift" description="Check-ins and punctuality for the day">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Shift</th>
                <th className="py-2 pr-3 font-medium">Hours</th>
                <th className="py-2 pr-3 text-right font-medium">Assigned</th>
                <th className="py-2 pr-3 text-right font-medium">Checked in</th>
                <th className="py-2 pr-3 text-right font-medium">Punches</th>
                <th className="py-2 pr-3 text-right font-medium">Late</th>
                <th className="py-2 pr-3 text-right font-medium">Early out</th>
                <th className="py-2 pr-3 text-right font-medium">Early in</th>
                <th className="py-2 font-medium">Last check-in sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shifts.map((s) => (
                <tr key={s.name} className="hover:bg-accent/40">
                  <td className="py-2 pr-3"><Link to={`/hr/shift-types/${encodeURIComponent(s.name)}`} className="font-medium hover:text-primary hover:underline">{s.name}</Link></td>
                  <td className="py-2 pr-3 font-mono text-xs">{hhmm(s.start_time)}–{hhmm(s.end_time)} <span className="text-muted-foreground">({shiftHours(s.start_time, s.end_time).toFixed(1)} h)</span></td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.assigned}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.checked_in}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{s.checkins}</td>
                  <td className={cn("py-2 pr-3 text-right tabular-nums", s.late && "font-semibold text-amber-600")}>{s.late}</td>
                  <td className={cn("py-2 pr-3 text-right tabular-nums", s.early && "font-semibold text-orange-600")}>{s.early}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-sky-600">{s.early_in}</td>
                  <td className="py-2 text-xs text-muted-foreground">{s.last_sync_of_checkin ? String(s.last_sync_of_checkin).slice(0, 16) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {[
          { label: "Shift Types", to: "/hr/shift-types", icon: Clock3 },
          { label: "Shift Assignments", to: "/hr/shift-assignments", icon: CalendarClock },
          { label: "Shift Requests", to: "/hr/shift-requests", icon: Repeat },
          { label: "Checkins", to: "/hr/checkins", icon: Fingerprint },
          { label: "Overtime Types", to: "/payroll/overtime-types", icon: Hourglass },
          { label: "HR Settings", to: "/hr/settings", icon: Settings2 },
        ].map((q) => (
          <Link key={q.to} to={q.to} className="group flex items-center gap-2.5 rounded-lg border border-border bg-card p-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent/40">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-110"><q.icon className="h-4 w-4" /></span>
            {q.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
