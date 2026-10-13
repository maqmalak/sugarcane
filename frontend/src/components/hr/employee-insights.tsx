import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Award, Banknote, Briefcase, CalendarCheck, CalendarOff, Clock3, DoorOpen, Flag,
  Hourglass, Info, LogIn, LogOut, Sparkles, Timer, TrendingUp, Wallet,
} from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { AreaChart, ComboChart, DonutChart } from "@/components/charts/charts";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHrInsights } from "@/hooks/useHrInsights";
import { formatMoney } from "@/utils/currency";
import { formatDate, todayISO } from "@/utils/dates";
import { asNumber, cn } from "@/utils/cn";

interface Month { month: string; present: number; absent: number; on_leave: number; half_day: number; wfh: number; late: number; early_out: number; early_in: number; ot_hours: number; late_minutes: number; marked: number; rate: number | null }
interface Day { date: string; status: string; late: number; early_out: number; in?: string | null; out?: string | null; leave_type?: string | null }
interface Rate { rate: number | null; late_per_100: number | null; records: number }
interface Insights {
  monthly: Month[];
  heatmap: Day[];
  heatmap_from: string;
  usual: { in: string | null; out: string | null; hours: number | null; days: number };
  compare: { employee: Rate; department: Rate | null; department_name?: string };
  leave_balances: { leave_type: string; total_leaves: number; expired_leaves: number; leaves_taken: number; leaves_pending_approval: number; remaining_leaves: number }[];
  leave_applications: { name: string; leave_type: string; from_date: string; to_date: string; total_leave_days: number; status: string; docstatus: number }[];
  leave_by_type: { leave_type: string; days: number }[];
  pay_by_month: { month: string; gross_pay: number; total_deduction: number; net_pay: number; slips: number; currency?: string }[];
  latest_slip: {
    name: string; start_date: string; end_date: string; currency?: string; gross_pay: number; total_deduction: number; net_pay: number;
    payment_days: number; total_working_days: number; earnings: { component: string; amount: number }[]; deductions: { component: string; amount: number }[];
  } | null;
  structures: { name: string; salary_structure: string; from_date: string; base: number; currency?: string; income_tax_slab?: string }[];
  shift: { name: string; shift_type: string; start_date: string; end_date?: string; start_time: string; end_time: string; late_entry_grace_period?: number; enable_late_entry_marking?: number; allow_overtime?: number } | null;
  last_shift: string | null;
  claims: { pending: number; unpaid: number; advance_outstanding: number };
  timeline: { date: string; kind: string; title: string; detail?: string; ref?: string }[];
}

const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleString(undefined, { month: "short", year: "2-digit" });
};
const hhmm = (t?: string | null) => (t ? String(t).padStart(8, "0").slice(0, 5) : "—");
const toMin = (t?: string | null) => {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + (m || 0);
};
const pctChange = (now: number, prev: number) => (prev ? ((now - prev) / prev) * 100 : 0);

/* ------------------------------------------------------------------------------------------ pieces */

function Glance({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: React.ReactNode; tone: string }) {
  return (
    <Card className="flex min-w-0 items-start gap-3 p-4">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone)}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-bold tabular-nums">{value}</p>
        {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
      </div>
    </Card>
  );
}

type Tone = "good" | "warn" | "bad" | "info";
const TONE_STYLE: Record<Tone, string> = {
  good: "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300",
  warn: "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300",
  bad: "border-rose-500/30 bg-rose-500/5 text-rose-800 dark:text-rose-300",
  info: "border-sky-500/30 bg-sky-500/5 text-sky-800 dark:text-sky-300",
};

/** Plain-language observations worked out from the numbers, worst first. */
function highlights(d: Insights): { tone: Tone; text: string }[] {
  const out: { tone: Tone; text: string; w: number }[] = [];
  const me = d.compare.employee.rate;
  const dept = d.compare.department?.rate;
  if (me !== null && dept !== null && dept !== undefined) {
    const gap = me - dept;
    if (gap <= -10) out.push({ tone: "bad", w: 0, text: `Attendance ${me}% this year — ${Math.abs(gap).toFixed(1)} points below the department (${dept}%).` });
    else if (gap >= 3) out.push({ tone: "good", w: 5, text: `Attendance ${me}% this year — ${gap.toFixed(1)} points above the department (${dept}%).` });
    else out.push({ tone: "info", w: 6, text: `Attendance ${me}% this year, in line with the department (${dept}%).` });
  }
  d.leave_balances.filter((b) => b.remaining_leaves < 0).forEach((b) =>
    out.push({ tone: "bad", w: 1, text: `${b.leave_type}: overdrawn by ${Math.abs(b.remaining_leaves)} day${Math.abs(b.remaining_leaves) === 1 ? "" : "s"} (${b.leaves_taken} taken of ${b.total_leaves}).` }),
  );
  const thisMonth = d.monthly[d.monthly.length - 1];
  const lastMonth = d.monthly[d.monthly.length - 2];
  if (thisMonth?.late) out.push({ tone: "warn", w: 2, text: `${thisMonth.late} late check-in${thisMonth.late === 1 ? "" : "s"} this month${thisMonth.late_minutes ? `, ${Math.round(thisMonth.late_minutes / thisMonth.late)} min late on average` : ""}.` });
  if (thisMonth?.early_out) out.push({ tone: "warn", w: 3, text: `${thisMonth.early_out} early check-out${thisMonth.early_out === 1 ? "" : "s"} this month.` });
  if (thisMonth?.rate != null && lastMonth?.rate != null && Math.abs(thisMonth.rate - lastMonth.rate) >= 10) {
    out.push({ tone: thisMonth.rate > lastMonth.rate ? "good" : "warn", w: 4, text: `Attendance ${thisMonth.rate > lastMonth.rate ? "up" : "down"} from ${lastMonth.rate}% last month to ${thisMonth.rate}% this month.` });
  }
  const slips = d.pay_by_month;
  if (slips.length >= 2) {
    const ch = pctChange(slips[slips.length - 1].net_pay, slips[slips.length - 2].net_pay);
    if (Math.abs(ch) >= 5) out.push({ tone: "info", w: 7, text: `Net pay ${ch > 0 ? "up" : "down"} ${Math.abs(ch).toFixed(1)}% on the previous month.` });
  }
  const ot = d.monthly.reduce((a, m) => a + m.ot_hours, 0);
  if (ot) out.push({ tone: "info", w: 8, text: `${ot.toFixed(1)} overtime hours in the last ${d.monthly.length} months.` });
  if (!d.shift) out.push({ tone: "warn", w: 9, text: d.last_shift ? `No active shift assignment — last attendance was on ${d.last_shift}.` : "No shift assigned." });
  if (!d.structures.length) out.push({ tone: "bad", w: 1, text: "No salary structure assigned — payroll runs will skip this employee." });
  if (d.claims.advance_outstanding > 0) out.push({ tone: "warn", w: 10, text: `Advance outstanding: ${formatMoney(d.claims.advance_outstanding)}.` });
  return out.sort((a, b) => a.w - b.w).slice(0, 6);
}

/** Last ~17 weeks, one square per day (columns = weeks, Mon at top), coloured by attendance status. */
function Heatmap({ days, from }: { days: Day[]; from: string }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const start = new Date(from);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
  const end = new Date(todayISO());
  const weeks: Date[][] = [];
  for (let d = new Date(start); d <= end; ) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  }
  const color = (d?: Day) =>
    !d ? "bg-muted/50" :
    d.status === "Present" || d.status === "Work From Home" ? (d.late || d.early_out ? "bg-amber-400" : "bg-emerald-500") :
    d.status === "Half Day" ? "bg-teal-400" :
    d.status === "On Leave" ? "bg-sky-400" : "bg-rose-500";
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        <div className="mr-1 flex flex-col gap-1 pt-4 text-[9px] text-muted-foreground">
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((l, i) => <span key={i} className="h-3.5 leading-[14px]">{l}</span>)}
        </div>
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            <span className="h-3 text-[9px] text-muted-foreground">{w[0].getDate() <= 7 ? w[0].toLocaleString(undefined, { month: "short" }) : ""}</span>
            {w.map((day) => {
              const k = iso(day);
              const rec = byDate.get(k);
              const future = day > end;
              return (
                <span
                  key={k}
                  title={future ? "" : `${formatDate(k)} — ${rec ? `${rec.status}${rec.leave_type ? ` (${rec.leave_type})` : ""}${rec.in ? ` · in ${rec.in}` : ""}${rec.out ? ` · out ${rec.out}` : ""}${rec.late ? " · late" : ""}${rec.early_out ? " · left early" : ""}` : "not marked"}`}
                  className={cn("h-3.5 w-3.5 rounded-[3px] transition-transform hover:scale-125", future ? "bg-transparent" : color(rec))}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {[["bg-emerald-500", "Present"], ["bg-amber-400", "Late / left early"], ["bg-teal-400", "Half day"], ["bg-sky-400", "On leave"], ["bg-rose-500", "Absent"], ["bg-muted/50", "Not marked"]].map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1"><span className={cn("h-2.5 w-2.5 rounded-sm", c)} />{l}</span>
        ))}
      </div>
    </div>
  );
}

/** A 24-hour bar: the shift window, its grace, and the employee's usual arrival / departure. */
function DayBar({ start, end, grace, usualIn, usualOut }: { start?: string; end?: string; grace?: number; usualIn?: string | null; usualOut?: string | null }) {
  const pct = (m: number) => `${(m / 1440) * 100}%`;
  const s = toMin(start);
  const e = toMin(end);
  const segs = s !== null && e !== null ? (e > s ? [[s, e]] : [[s, 1440], [0, e]]) : [];
  const i = toMin(usualIn);
  const o = toMin(usualOut);
  return (
    <div className="space-y-1">
      <div className="relative h-8 rounded-md bg-muted/60">
        {segs.map(([a, b], k) => <span key={k} className="absolute inset-y-1 rounded bg-primary/25 ring-1 ring-primary/40" style={{ left: pct(a), width: pct(b - a) }} />)}
        {s !== null && !!grace && <span className="absolute inset-y-1 rounded-r bg-amber-400/40" style={{ left: pct(s), width: pct(grace) }} title={`${grace} min grace`} />}
        {i !== null && <span className="absolute -top-1 bottom-[-4px] w-0.5 bg-emerald-600" style={{ left: pct(i) }} title={`Usual check-in ${usualIn}`} />}
        {o !== null && <span className="absolute -top-1 bottom-[-4px] w-0.5 bg-rose-600" style={{ left: pct(o) }} title={`Usual check-out ${usualOut}`} />}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">{[0, 6, 12, 18, 24].map((h) => <span key={h}>{String(h).padStart(2, "0")}:00</span>)}</div>
    </div>
  );
}

const TIMELINE_ICON: Record<string, { icon: typeof Flag; tone: string }> = {
  joined: { icon: Flag, tone: "bg-emerald-500" },
  promotion: { icon: TrendingUp, tone: "bg-indigo-500" },
  transfer: { icon: Briefcase, tone: "bg-sky-500" },
  salary: { icon: Banknote, tone: "bg-teal-500" },
  confirmed: { icon: Award, tone: "bg-emerald-600" },
  contract: { icon: Clock3, tone: "bg-amber-500" },
  left: { icon: DoorOpen, tone: "bg-rose-500" },
  retire: { icon: Sparkles, tone: "bg-slate-400" },
};

/* ------------------------------------------------------------------------------------------ tab */

/** The employee profile's Insights tab: attendance, punctuality, leave, pay and career — for one person. */
export function EmployeeInsights({ employee }: { employee: string }) {
  const { data: d, isLoading, error } = useHrInsights<Insights>("employee_insights", { employee, months: 12 });
  if (error) return <Card className="p-6 text-sm text-destructive">Could not load insights for {employee}.</Card>;
  if (isLoading || !d) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
      </div>
    );
  }

  const year = d.monthly.reduce(
    (a, m) => ({ marked: a.marked + m.marked, present: a.present + m.present + m.wfh + m.half_day / 2, late: a.late + m.late, lateMin: a.lateMin + m.late_minutes, early: a.early + m.early_out, ot: a.ot + m.ot_hours, absent: a.absent + m.absent }),
    { marked: 0, present: 0, late: 0, lateMin: 0, early: 0, ot: 0, absent: 0 },
  );
  const rate12 = year.marked ? (year.present / year.marked) * 100 : null;
  const deptRate = d.compare.department?.rate ?? null;
  const remaining = d.leave_balances.reduce((a, b) => a + b.remaining_leaves, 0);
  const slips = d.pay_by_month;
  const lastSlip = slips[slips.length - 1];
  const prevSlip = slips[slips.length - 2];
  const netChange = lastSlip && prevSlip ? pctChange(lastSlip.net_pay, prevSlip.net_pay) : null;
  const currency = lastSlip?.currency ?? d.structures[0]?.currency;
  const notes = highlights(d);
  // No records that month → no rate point (a gap), not a misleading 0%.
  const trend = d.monthly.map((m) => ({ month: monthLabel(m.month), present: m.present + m.wfh + m.half_day, on_leave: m.on_leave, absent: m.absent, rate: m.rate }));
  const punct = d.monthly.map((m) => ({ month: monthLabel(m.month), late: m.late, early_out: m.early_out, ot: m.ot_hours }));

  return (
    <div className="space-y-4">
      {/* Highlights */}
      {!!notes.length && (
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Highlights</h3>
          <ul className="grid gap-2 md:grid-cols-2">
            {notes.map((n, i) => (
              <li key={i} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", TONE_STYLE[n.tone])}>
                {n.tone === "good" ? <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0" /> : n.tone === "info" ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : n.tone === "warn" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* At a glance */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Glance icon={<CalendarCheck className="h-4 w-4" />} tone="bg-emerald-500/10 text-emerald-600" label="Attendance (12 m)" value={rate12 !== null ? `${rate12.toFixed(1)}%` : "—"} hint={deptRate !== null ? `Dept. ${deptRate}% this year` : `${year.marked} days marked`} />
        <Glance icon={<Timer className="h-4 w-4" />} tone="bg-amber-500/10 text-amber-600" label="Late check-ins (12 m)" value={year.late} hint={year.late ? `avg ${Math.round(year.lateMin / year.late)} min · ${year.early} early out` : `${year.early} early check-outs`} />
        <Glance icon={<Hourglass className="h-4 w-4" />} tone="bg-violet-500/10 text-violet-600" label="Overtime (12 m)" value={`${year.ot.toFixed(1)} h`} hint={d.shift?.allow_overtime ? "shift allows overtime" : "overtime off on shift"} />
        <Glance icon={<CalendarOff className="h-4 w-4" />} tone={remaining < 0 ? "bg-rose-500/10 text-rose-600" : "bg-sky-500/10 text-sky-600"} label="Leave balance" value={`${remaining.toLocaleString(undefined, { maximumFractionDigits: 1 })} d`} hint={`${d.leave_balances.length} leave type${d.leave_balances.length === 1 ? "" : "s"} allocated`} />
        <Glance
          icon={<Wallet className="h-4 w-4" />}
          tone="bg-teal-500/10 text-teal-600"
          label="Net pay (last month)"
          value={lastSlip ? formatMoney(lastSlip.net_pay, currency, { compact: true }) : "—"}
          hint={netChange !== null ? <span className={netChange >= 0 ? "text-emerald-600" : "text-rose-600"}>{netChange >= 0 ? "▲" : "▼"} {Math.abs(netChange).toFixed(1)}% vs previous month</span> : "no earlier month"}
        />
        <Glance icon={<LogIn className="h-4 w-4" />} tone="bg-indigo-500/10 text-indigo-600" label="Usual day (90 d)" value={d.usual.in ? `${d.usual.in} → ${d.usual.out ?? "—"}` : "—"} hint={d.usual.days ? `${d.usual.days} days with punches` : "no check-in times"} />
      </div>

      {/* Attendance trend + comparison */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Attendance by month" subtitle="Days present / on leave / absent, with the attendance rate" className="lg:col-span-2">
          <ComboChart
            data={trend}
            xKey="month"
            legend
            dualAxis
            height={270}
            series={[
              { key: "present", label: "Present", color: "hsl(160 84% 39%)" },
              { key: "on_leave", label: "On leave", color: "hsl(199 89% 48%)" },
              { key: "absent", label: "Absent", color: "hsl(351 95% 59%)" },
              { key: "rate", label: "Rate %", type: "line", axis: "right", format: "percent", color: "hsl(262 83% 58%)" },
            ]}
          />
        </ChartCard>
        <SectionCard title="Compared with the department" description={`${d.compare.department_name ?? "Department"} · this year`}>
          <div className="space-y-5">
            {[
              { label: "Attendance rate", me: d.compare.employee.rate, them: d.compare.department?.rate, unit: "%", higherBetter: true, max: 100 },
              { label: "Late check-ins per 100 days", me: d.compare.employee.late_per_100, them: d.compare.department?.late_per_100, unit: "", higherBetter: false, max: Math.max(5, d.compare.employee.late_per_100 ?? 0, d.compare.department?.late_per_100 ?? 0) },
            ].map((r) => {
              const better = r.me != null && r.them != null ? (r.higherBetter ? r.me >= r.them : r.me <= r.them) : null;
              return (
                <div key={r.label} className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{r.label}</p>
                  {[["This employee", r.me, better === false ? "bg-rose-500" : "bg-emerald-500"], ["Department", r.them, "bg-slate-400"]].map(([l, v, c]) => (
                    <div key={String(l)} className="flex items-center gap-2 text-sm">
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">{l}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full transition-all duration-700", String(c))} style={{ width: `${v == null ? 0 : Math.min(100, (Number(v) / r.max) * 100)}%` }} />
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums">{v == null ? "—" : `${v}${r.unit}`}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground">{d.compare.employee.records} records for this employee · {d.compare.department?.records?.toLocaleString() ?? 0} for the department</p>
          </div>
        </SectionCard>
      </div>

      {/* Heatmap + shift */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Last 4 months, day by day" description="Hover a day for its status and check-in / check-out" className="lg:col-span-2">
          <Heatmap days={d.heatmap} from={d.heatmap_from} />
        </SectionCard>
        <SectionCard title="Shift" description={d.shift ? `Since ${formatDate(d.shift.start_date)}${d.shift.end_date ? ` until ${formatDate(d.shift.end_date)}` : ""}` : "No active shift assignment"}>
          {d.shift ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <Link to={`/hr/shift-types/${encodeURIComponent(d.shift.shift_type)}`} className="text-base font-semibold hover:text-primary hover:underline">{d.shift.shift_type}</Link>
                <span className="font-mono text-sm">{hhmm(d.shift.start_time)}–{hhmm(d.shift.end_time)}</span>
              </div>
              <DayBar start={d.shift.start_time} end={d.shift.end_time} grace={d.shift.enable_late_entry_marking ? asNumber(d.shift.late_entry_grace_period) : 0} usualIn={d.usual.in} usualOut={d.usual.out} />
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {d.shift.enable_late_entry_marking ? <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">grace {d.shift.late_entry_grace_period} min</span> : null}
                <span className={cn("rounded px-1.5 py-0.5", d.shift.allow_overtime ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "bg-muted text-muted-foreground")}>{d.shift.allow_overtime ? "overtime allowed" : "no overtime"}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <DayBar usualIn={d.usual.in} usualOut={d.usual.out} />
              <p className="text-sm text-muted-foreground">{d.last_shift ? <>Last attendance was on <b>{d.last_shift}</b>.</> : "No shift on any attendance."}</p>
              <Link to={`/hr/shift-assignments/new?employee=${encodeURIComponent(employee)}`} className="inline-flex text-xs font-medium text-primary hover:underline">Assign a shift →</Link>
            </div>
          )}
          <div className="mt-3 flex gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-3 w-0.5 bg-emerald-600" /> usual in {d.usual.in ?? "—"}</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-0.5 bg-rose-600" /> usual out {d.usual.out ?? "—"}</span>
            {d.usual.hours && <span>{d.usual.hours} h/day</span>}
          </div>
        </SectionCard>
      </div>

      {/* Punctuality + leave */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Punctuality & overtime" subtitle="Late check-ins and early check-outs per month (beyond grace), overtime hours">
          <ComboChart
            data={punct}
            xKey="month"
            legend
            dualAxis
            height={230}
            series={[
              { key: "late", label: "Late", color: "hsl(38 92% 50%)" },
              { key: "early_out", label: "Early out", color: "hsl(25 95% 53%)" },
              { key: "ot", label: "OT hours", type: "line", axis: "right", color: "hsl(262 83% 58%)" },
            ]}
          />
        </ChartCard>
        <SectionCard title="Leave balance" description="Current allocations — taken, pending and left" actions={<Link to={`/hr/leave-applications?employee=${encodeURIComponent(employee)}`} className="text-xs font-medium text-primary hover:underline">Applications</Link>}>
          {d.leave_balances.length ? (
            <ul className="space-y-4">
              {d.leave_balances.map((b) => {
                const total = Math.max(b.total_leaves, b.leaves_taken + b.leaves_pending_approval, 1);
                return (
                  <li key={b.leave_type} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{b.leave_type}</span>
                      <span className={cn("shrink-0 font-semibold tabular-nums", b.remaining_leaves < 0 ? "text-rose-600" : "text-emerald-600")}>{b.remaining_leaves} left</span>
                    </div>
                    <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                      <div className="bg-sky-500" style={{ width: `${(Math.min(b.leaves_taken, total) / total) * 100}%` }} />
                      <div className="bg-amber-400" style={{ width: `${(b.leaves_pending_approval / total) * 100}%` }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">{b.leaves_taken} taken{b.leaves_pending_approval ? ` · ${b.leaves_pending_approval} pending` : ""} of {b.total_leaves}{b.expired_leaves ? ` · ${b.expired_leaves} expired` : ""}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No leave allocated for today.</p>
          )}
        </SectionCard>
        <SectionCard title="Recent leave" description={d.leave_by_type.length ? `This year: ${d.leave_by_type.map((t) => `${t.days} d ${t.leave_type}`).join(", ")}` : "No approved leave this year"}>
          {d.leave_by_type.length > 1 && <DonutChart data={d.leave_by_type.map((t) => ({ label: t.leave_type, value: asNumber(t.days) }))} height={150} innerRadius="60%" legend={false} />}
          <ul className="divide-y divide-border">
            {d.leave_applications.slice(0, 5).map((l) => (
              <li key={l.name} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.leave_type}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(l.from_date)}{l.to_date !== l.from_date ? ` – ${formatDate(l.to_date)}` : ""} · {l.total_leave_days} d</p>
                </div>
                <StatusBadge status={l.status} />
              </li>
            ))}
            {!d.leave_applications.length && <li className="py-6 text-center text-sm text-muted-foreground">No leave applications.</li>}
          </ul>
        </SectionCard>
      </div>

      {/* Pay */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Pay history" subtitle={`Gross and net pay by payroll month, last ${slips.length} months`} className="lg:col-span-2">
          {slips.length ? (
            <AreaChart
              data={slips.map((s) => ({ month: monthLabel(s.month), gross: asNumber(s.gross_pay), net: asNumber(s.net_pay) }))}
              xKey="month"
              money
              currency={currency}
              legend
              height={250}
              series={[{ key: "gross", label: "Gross" }, { key: "net", label: "Net", color: "hsl(160 84% 39%)" }]}
            />
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">No submitted salary slips yet.</p>
          )}
        </ChartCard>
        <SectionCard
          title="Latest payslip"
          description={d.latest_slip ? `${formatDate(d.latest_slip.start_date)} – ${formatDate(d.latest_slip.end_date)} · ${d.latest_slip.payment_days} of ${d.latest_slip.total_working_days} days paid` : "—"}
          actions={d.latest_slip ? <Link to={`/payroll/salary-slips/${encodeURIComponent(d.latest_slip.name)}`} className="text-xs font-medium text-primary hover:underline">Open</Link> : undefined}
        >
          {d.latest_slip ? (
            <div className="space-y-3 text-sm">
              {[["Earnings", d.latest_slip.earnings, "bg-emerald-500"], ["Deductions", d.latest_slip.deductions, "bg-rose-500"]].map(([title, rows, tone]) => {
                const list = rows as { component: string; amount: number }[];
                const max = Math.max(1, ...list.map((r) => r.amount));
                return (
                  <div key={String(title)} className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{String(title)}</p>
                    {list.map((r) => (
                      <div key={r.component} className="space-y-0.5">
                        <div className="flex justify-between gap-2 text-xs"><span className="truncate">{r.component}</span><span className="tabular-nums">{formatMoney(r.amount, d.latest_slip!.currency)}</span></div>
                        <div className="h-1 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", String(tone))} style={{ width: `${(r.amount / max) * 100}%` }} /></div>
                      </div>
                    ))}
                    {!list.length && <p className="text-xs text-muted-foreground">None</p>}
                  </div>
                );
              })}
              <div className="flex items-baseline justify-between border-t border-border pt-2">
                <span className="font-semibold">Net pay</span>
                <span className="text-lg font-bold tabular-nums">{formatMoney(d.latest_slip.net_pay, d.latest_slip.currency)}</span>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No salary slip yet.</p>
          )}
        </SectionCard>
      </div>

      {/* Career + money */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Career timeline" description="Joining, promotions, transfers and pay changes" className="lg:col-span-2">
          <ol className="relative ml-3 space-y-4 border-l border-border pl-6">
            {d.timeline.map((t, i) => {
              const meta = TIMELINE_ICON[t.kind] ?? { icon: Flag, tone: "bg-slate-400" };
              const future = t.date > todayISO();
              return (
                <li key={i} className={cn("relative", future && "opacity-60")}>
                  <span className={cn("absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full text-white ring-4 ring-background", meta.tone)}>
                    <meta.icon className="h-3 w-3" />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold">{t.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(t.date)}{future ? " · upcoming" : ""}</span>
                  </div>
                  {t.detail && <p className="text-xs text-muted-foreground">{t.detail}</p>}
                </li>
              );
            })}
            {!d.timeline.length && <li className="text-sm text-muted-foreground">Nothing recorded yet.</li>}
          </ol>
        </SectionCard>
        <SectionCard title="Pay setup & money" description="Salary structure, claims and advances">
          <div className="space-y-4 text-sm">
            {d.structures[0] ? (
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Current structure · from {formatDate(d.structures[0].from_date)}</p>
                <p className="font-semibold">{d.structures[0].salary_structure}</p>
                <p className="text-xs text-muted-foreground">Base {formatMoney(d.structures[0].base, d.structures[0].currency)}{d.structures[0].income_tax_slab ? ` · tax slab ${d.structures[0].income_tax_slab}` : ""}</p>
              </div>
            ) : (
              <Link to={`/payroll/salary-structure-assignments?employee=${encodeURIComponent(employee)}`} className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-rose-700 dark:text-rose-300">
                <AlertTriangle className="h-4 w-4" /> No salary structure — assign one
              </Link>
            )}
            {[
              ["Expense claims awaiting approval", d.claims.pending, `/hr/expense-claims?employee=${encodeURIComponent(employee)}`],
              ["Claims approved, not yet paid", d.claims.unpaid, `/hr/expense-claims?employee=${encodeURIComponent(employee)}`],
              ["Advance outstanding", d.claims.advance_outstanding, `/hr/advances?employee=${encodeURIComponent(employee)}`],
            ].map(([l, v, to]) => (
              <Link key={String(l)} to={String(to)} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-accent/40">
                <span className="text-muted-foreground">{l}</span>
                <span className={cn("font-semibold tabular-nums", Number(v) > 0 ? "text-amber-600" : "")}>{formatMoney(Number(v), currency)}</span>
              </Link>
            ))}
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Link to={`/payroll/salary-slips?employee=${encodeURIComponent(employee)}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"><Banknote className="h-3.5 w-3.5" /> Salary slips</Link>
              <Link to={`/hr/attendance?employee=${encodeURIComponent(employee)}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"><CalendarCheck className="h-3.5 w-3.5" /> Attendance</Link>
              <Link to={`/hr/checkins?employee=${encodeURIComponent(employee)}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"><LogOut className="h-3.5 w-3.5" /> Check-ins</Link>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
