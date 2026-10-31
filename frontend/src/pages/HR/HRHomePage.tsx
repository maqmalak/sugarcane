import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Award, Building2, Cake, CalendarCheck, CalendarDays, CalendarOff, CalendarPlus2, Clock3, GitBranch, IdCard,
  LogIn, PartyPopper, ShieldCheck, TrendingUp, DoorOpen, Hourglass, ListChecks, Receipt, Sliders, UserCheck, UserMinus, UserPlus, Users2, Wallet, ArrowRight, Banknote, Tags,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ChartCard } from "@/components/charts/chart-card";
import { BarChart, DonutChart } from "@/components/charts/charts";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { KpiGrid, BarList } from "@/components/doc/dashboard-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmployeePhoto } from "@/components/hr/employee-photo";
import { tenure } from "@/components/hr/employee-profile-hero";
import { useDocList, useGroupCounts } from "@/hooks/useDoc";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { formatDate, todayISO, addDaysISO } from "@/utils/dates";
import { cn } from "@/utils/cn";
import { WorkspaceIcons } from "@/components/layout/workspace-icons";

interface Emp {
  name: string;
  employee_name?: string;
  image?: string;
  status?: string;
  gender?: string;
  department?: string;
  designation?: string;
  branch?: string;
  employment_type?: string;
  date_of_joining?: string;
  date_of_birth?: string;
  relieving_date?: string;
}

const strip = (d?: string) => (d ? d.replace(/ - [A-Z0-9]{2,6}$/, "") : "Not set");
/** When an employee has several attendance records for a day, the most "present" one wins. */
const statusRank = (x?: string) => ["Present", "Work From Home", "Half Day", "On Leave", "Absent"].indexOf(x ?? "Absent");
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Days from today until the next yearly recurrence of `iso`'s month/day (0 = today). */
function daysToNext(iso?: string): number | null {
  if (!iso) return null;
  const [, m, d] = iso.split("-").map(Number);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  let next = new Date(t.getFullYear(), m - 1, d);
  if (next < t) next = new Date(t.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - t.getTime()) / 86400000);
}

const QUICK_LINKS: { label: string; to: string; icon: typeof Users2; tone: string }[] = [
  { label: "Employees", to: "/hr/employees", icon: Users2, tone: "text-sky-600 bg-sky-500/10" },
  { label: "Departments", to: "/hr/departments", icon: Building2, tone: "text-indigo-600 bg-indigo-500/10" },
  { label: "Designations", to: "/hr/designations", icon: IdCard, tone: "text-violet-600 bg-violet-500/10" },
  { label: "Branches", to: "/hr/branches", icon: GitBranch, tone: "text-teal-600 bg-teal-500/10" },
  { label: "Shifts", to: "/hr/shifts", icon: Clock3, tone: "text-blue-600 bg-blue-500/10" },
  { label: "Attendance", to: "/hr/attendance", icon: CalendarCheck, tone: "text-emerald-600 bg-emerald-500/10" },
  { label: "Checkins", to: "/hr/checkins", icon: LogIn, tone: "text-cyan-600 bg-cyan-500/10" },
  { label: "Leave Applications", to: "/hr/leave-applications", icon: CalendarOff, tone: "text-amber-600 bg-amber-500/10" },
  { label: "Leave Allocations", to: "/hr/leave-allocations", icon: CalendarPlus2, tone: "text-orange-600 bg-orange-500/10" },
  { label: "Leave Types", to: "/hr/leave-types", icon: Tags, tone: "text-lime-600 bg-lime-500/10" },
  { label: "Holiday Lists", to: "/hr/holiday-lists", icon: CalendarDays, tone: "text-rose-600 bg-rose-500/10" },
  { label: "Shift Assignments", to: "/hr/shift-assignments", icon: Clock3, tone: "text-slate-600 bg-slate-500/10" },
  { label: "Expense Claims", to: "/hr/expense-claims", icon: Receipt, tone: "text-pink-600 bg-pink-500/10" },
  { label: "Advances", to: "/hr/advances", icon: Wallet, tone: "text-fuchsia-600 bg-fuchsia-500/10" },
  { label: "Gratuity", to: "/hr/gratuity", icon: Award, tone: "text-yellow-600 bg-yellow-500/10" },
  { label: "Payroll", to: "/payroll", icon: Banknote, tone: "text-emerald-600 bg-emerald-500/10" },
  { label: "Leave Policies", to: "/hr/leave-policies", icon: ShieldCheck, tone: "text-teal-600 bg-teal-500/10" },
  { label: "Promotions", to: "/hr/promotions", icon: TrendingUp, tone: "text-indigo-600 bg-indigo-500/10" },
  { label: "Separations", to: "/hr/separations", icon: DoorOpen, tone: "text-rose-600 bg-rose-500/10" },
  { label: "Overtime", to: "/payroll/overtime-types", icon: Hourglass, tone: "text-violet-600 bg-violet-500/10" },
  { label: "HR Setup", to: "/hr/setup", icon: ListChecks, tone: "text-primary bg-primary/10" },
  { label: "HR Settings", to: "/hr/settings", icon: Sliders, tone: "text-slate-600 bg-slate-500/10" },
];

function PersonRow({ e, right }: { e: Emp; right: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <EmployeePhoto name={e.employee_name || e.name} src={e.image} size="md" editable={false} className="!h-9 !w-9 text-sm ring-0" />
      <div className="min-w-0 flex-1">
        <Link to={`/hr/employees/${encodeURIComponent(e.name)}`} className="block truncate text-sm font-medium hover:text-primary hover:underline">
          {e.employee_name || e.name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">{[e.designation, strip(e.department)].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="shrink-0 text-right text-xs">{right}</div>
    </li>
  );
}

/** HR landing page: today's workforce, approvals waiting, the shape of the organisation and people moments. */
export default function HRHomePage() {
  const { company } = useCompanyContext();
  const co = useMemo(() => companyFilter(company), [company]);
  const today = todayISO();

  const { data: emps, isLoading } = useDocList<Emp>("Employee", {
    fields: ["name", "employee_name", "image", "status", "gender", "department", "designation", "branch", "employment_type", "date_of_joining", "date_of_birth", "relieving_date"],
    filters: co,
    limit: 10000,
  });
  // Per-employee rows (not a status count): attendance also exists for people who have since left, and an
  // employee can carry more than one record for a day — count each active employee once.
  const { data: todayRows } = useDocList("Attendance", {
    fields: ["employee", "status"],
    filters: [...co, ["docstatus", "=", 1], ["attendance_date", "=", today]],
    limit: 20000,
  });
  const { data: pendingLeaves } = useDocList("Leave Application", {
    fields: ["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "status"],
    filters: [...co, ["status", "=", "Open"], ["docstatus", "=", 0]],
    orderBy: { field: "from_date", order: "asc" },
    limit: 6,
  });
  const { counts: leaveCounts } = useGroupCounts("Leave Application", "status", useMemo(() => [...co, ["docstatus", "=", 0]], [co]));
  const { counts: claimCounts } = useGroupCounts("Expense Claim", "approval_status", useMemo(() => [...co, ["docstatus", "=", 0]], [co]));
  const { data: onLeaveToday } = useDocList("Leave Application", {
    fields: ["name", "employee", "employee_name", "leave_type", "to_date"],
    filters: [...co, ["docstatus", "=", 1], ["status", "=", "Approved"], ["from_date", "<=", today], ["to_date", ">=", today]],
    limit: 50,
  });

  const s = useMemo(() => {
    const all = emps ?? [];
    const active = all.filter((e) => e.status === "Active");
    const monthStart = today.slice(0, 8) + "01";
    const in30 = addDaysISO(today, -30);

    const group = (key: keyof Emp) => {
      const m = new Map<string, number>();
      active.forEach((e) => m.set(String(e[key] || ""), (m.get(String(e[key] || "")) ?? 0) + 1));
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };

    // Joiners vs leavers, last 12 months.
    const months: { key: string; month: string; joined: number; left: number }[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 11; i >= 0; i--) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      months.push({ key: monthKey(x), month: x.toLocaleString(undefined, { month: "short", year: "2-digit" }), joined: 0, left: 0 });
    }
    const idx = Object.fromEntries(months.map((m, i) => [m.key, i]));
    all.forEach((e) => {
      const j = idx[(e.date_of_joining ?? "").slice(0, 7)];
      if (j !== undefined) months[j].joined++;
      const l = idx[(e.relieving_date ?? "").slice(0, 7)];
      if (l !== undefined) months[l].left++;
    });
    const leftYear = months.reduce((a, m) => a + m.left, 0);

    const bands = [
      { band: "< 1 y", min: 0, max: 1 },
      { band: "1–3 y", min: 1, max: 3 },
      { band: "3–5 y", min: 3, max: 5 },
      { band: "5–10 y", min: 5, max: 10 },
      { band: "10 y +", min: 10, max: 999 },
    ].map((b) => ({
      band: b.band,
      v: active.filter((e) => {
        if (!e.date_of_joining) return false;
        const y = (Date.now() - new Date(e.date_of_joining).getTime()) / (365.25 * 86400000);
        return y >= b.min && y < b.max;
      }).length,
    }));

    const birthdays = active
      .map((e) => ({ e, days: daysToNext(e.date_of_birth) }))
      .filter((x) => x.days !== null && x.days <= 30)
      .sort((a, b) => a.days! - b.days!)
      .slice(0, 6);
    const anniversaries = active
      .map((e) => {
        const days = daysToNext(e.date_of_joining);
        // Completed years on the anniversary date itself (which may fall in next calendar year).
        const years = days === null ? 0 : new Date(Date.now() + days * 86400000).getFullYear() - Number(e.date_of_joining!.slice(0, 4));
        return { e, days, years };
      })
      .filter((x) => x.days !== null && x.days <= 30 && x.years >= 1)
      .sort((a, b) => a.days! - b.days!)
      .slice(0, 6);
    const newJoiners = active
      .filter((e) => (e.date_of_joining ?? "") >= in30)
      .sort((a, b) => (b.date_of_joining ?? "").localeCompare(a.date_of_joining ?? ""))
      .slice(0, 6);

    return {
      total: all.length,
      active: active.length,
      joinedMonth: all.filter((e) => (e.date_of_joining ?? "") >= monthStart).length,
      leftYear,
      attrition: active.length + leftYear ? (leftYear / (active.length + leftYear)) * 100 : 0,
      female: active.filter((e) => e.gender === "Female").length,
      gender: group("gender").map(([label, value]) => ({ label: label || "Not set", value })),
      dept: group("department"),
      branch: group("branch"),
      etype: group("employment_type").map(([label, value]) => ({ label: label || "Not set", value })),
      months,
      bands,
      birthdays,
      anniversaries,
      newJoiners,
    };
  }, [emps, today]);

  const todayAtt = useMemo(() => {
    const activeIds = new Set((emps ?? []).filter((e) => e.status === "Active").map((e) => e.name));
    const statusOf = new Map<string, string>();
    (todayRows ?? []).forEach((r) => {
      if (!activeIds.has(r.employee)) return;
      const cur = statusOf.get(r.employee);
      if (cur === undefined || statusRank(r.status) < statusRank(cur)) statusOf.set(r.employee, r.status);
    });
    const counts: Record<string, number> = {};
    statusOf.forEach((st) => (counts[st] = (counts[st] ?? 0) + 1));
    return counts;
  }, [emps, todayRows]);
  const present = (todayAtt["Present"] ?? 0) + (todayAtt["Work From Home"] ?? 0) + (todayAtt["Half Day"] ?? 0);
  const absent = todayAtt["Absent"] ?? 0;
  const onLeave = Math.max(todayAtt["On Leave"] ?? 0, (onLeaveToday ?? []).length);
  const marked = Object.values(todayAtt).reduce((a, b) => a + b, 0);
  const unmarked = Math.max(0, s.active - marked);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        subtitle={`${greeting} — here is your workforce for ${formatDate(today, { weekday: "long", day: "numeric", month: "long", year: undefined })}`}
        icon={<Users2 className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/hr/setup">
              <Button variant="outline" size="sm"><ListChecks className="h-4 w-4" /> Setup</Button>
            </Link>
            <Link to="/hr/attendance">
              <Button variant="outline" size="sm"><CalendarCheck className="h-4 w-4" /> Attendance</Button>
            </Link>
            <Link to="/hr/employees">
              <Button variant="primary" size="sm"><UserPlus className="h-4 w-4" /> Employees</Button>
            </Link>
          </div>
        }
      />

      <WorkspaceIcons segment="hr" title="HR workspace" />

      <KpiGrid
        items={[
          { label: "Active employees", value: isLoading ? "…" : s.active.toLocaleString(), icon: <Users2 className="h-4 w-4" />, tone: "sky", valueSuffix: s.active ? `${Math.round((s.female / s.active) * 100)}% female` : undefined },
          { label: "Present today", value: present, icon: <UserCheck className="h-4 w-4" />, tone: "emerald", valueSuffix: s.active ? `${Math.round((present / s.active) * 100)}%` : undefined },
          { label: "On leave today", value: onLeave, icon: <CalendarOff className="h-4 w-4" />, tone: "amber" },
          { label: "Absent / unmarked", value: `${absent} / ${unmarked}`, icon: <UserMinus className="h-4 w-4" />, tone: absent ? "rose" : "slate" },
          { label: "Joined this month", value: s.joinedMonth, icon: <UserPlus className="h-4 w-4" />, tone: "teal" },
          { label: "Attrition (12 m)", value: `${s.attrition.toFixed(1)}%`, icon: <UserMinus className="h-4 w-4" />, tone: s.attrition > 15 ? "rose" : "indigo", valueSuffix: `${s.leftYear} left` },
        ]}
      />

      {/* Today + approvals */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Today's attendance</h3>
              <p className="text-xs text-muted-foreground">{marked} of {s.active} active employees marked</p>
            </div>
            <Link to="/hr/attendance" className="text-xs font-medium text-primary hover:underline">Open</Link>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {[
              { v: present, c: "bg-emerald-500" },
              { v: onLeave, c: "bg-amber-500" },
              { v: absent, c: "bg-rose-500" },
            ].map((x, i) => (
              <div key={i} className={cn("h-full transition-all duration-700", x.c)} style={{ width: `${s.active ? (x.v / s.active) * 100 : 0}%` }} />
            ))}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {[
              ["Present", present, "bg-emerald-500"],
              ["On leave", onLeave, "bg-amber-500"],
              ["Absent", absent, "bg-rose-500"],
              ["Not marked", unmarked, "bg-muted-foreground/30"],
            ].map(([k, v, c]) => (
              <div key={String(k)} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                <dt className="flex items-center gap-2 text-muted-foreground"><span className={cn("h-2 w-2 rounded-full", String(c))} />{k}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {!!(onLeaveToday ?? []).length && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Away today</p>
              <div className="flex flex-wrap gap-1.5">
                {(onLeaveToday ?? []).slice(0, 10).map((l) => (
                  <span key={l.name} className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400" title={`${l.leave_type} until ${formatDate(l.to_date)}`}>
                    {l.employee_name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        <SectionCard
          title="Waiting for approval"
          description={`${leaveCounts["Open"] ?? 0} leave applications · ${claimCounts["Draft"] ?? 0} expense claims`}
          actions={<Link to="/hr/leave-applications" className="text-xs font-medium text-primary hover:underline">All leaves</Link>}
          className="lg:col-span-2"
        >
          <ul className="divide-y divide-border">
            {(pendingLeaves ?? []).map((l) => (
              <li key={l.name} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link to={`/hr/leave-applications?employee=${encodeURIComponent(l.employee)}`} className="block truncate text-sm font-medium hover:text-primary hover:underline">
                    {l.employee_name || l.employee}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {l.leave_type} · {formatDate(l.from_date)} – {formatDate(l.to_date)} · {l.total_leave_days} day{l.total_leave_days === 1 ? "" : "s"}
                  </p>
                </div>
                <StatusBadge status={l.status} />
              </li>
            ))}
            {!(pendingLeaves ?? []).length && (
              <li className="flex flex-col items-center gap-1 py-8 text-center text-sm text-muted-foreground">
                <PartyPopper className="h-5 w-5" /> All caught up — no leave waiting for approval.
              </li>
            )}
          </ul>
          {!!claimCounts["Draft"] && (
            <Link to="/hr/expense-claims" className="mt-3 flex items-center justify-between rounded-md bg-pink-500/5 px-3 py-2 text-sm hover:bg-pink-500/10">
              <span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-pink-600" /> {claimCounts["Draft"]} expense claim{claimCounts["Draft"] === 1 ? "" : "s"} to review</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          )}
        </SectionCard>
      </div>

      {/* Workforce shape */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Joiners vs leavers" subtitle="Last 12 months" className="lg:col-span-2">
          <BarChart
            data={s.months}
            xKey="month"
            legend
            height={260}
            series={[
              { key: "joined", label: "Joined", color: "hsl(160 84% 39%)" },
              { key: "left", label: "Left", color: "hsl(351 95% 59%)" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Gender mix" subtitle="Active employees">
          {s.gender.length ? <DonutChart data={s.gender} height={260} innerRadius="60%" /> : <p className="py-16 text-center text-sm text-muted-foreground">No employees yet.</p>}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Headcount by department" actions={<Link to="/hr/departments" className="text-xs font-medium text-primary hover:underline">Departments</Link>}>
          <BarList rows={s.dept.slice(0, 8).map(([d, v]) => ({ label: strip(d || undefined), value: v }))} format={(v) => `${v}`} tone="bg-indigo-500" empty="No employees yet." />
        </SectionCard>
        <SectionCard title="Headcount by branch" actions={<Link to="/hr/branches" className="text-xs font-medium text-primary hover:underline">Map</Link>}>
          <BarList rows={s.branch.slice(0, 8).map(([b, v]) => ({ label: b || "Not set", value: v }))} format={(v) => `${v}`} tone="bg-teal-500" empty="No employees yet." />
        </SectionCard>
        <ChartCard title="Length of service" subtitle="Active employees by tenure">
          <BarChart data={s.bands} xKey="band" height={240} series={[{ key: "v", label: "Employees", color: "hsl(262 83% 58%)" }]} />
        </ChartCard>
      </div>

      {/* People moments */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Upcoming birthdays" description="Next 30 days" actions={<Cake className="h-4 w-4 text-pink-500" />}>
          <ul className="divide-y divide-border">
            {s.birthdays.map(({ e, days }) => (
              <PersonRow key={e.name} e={e} right={days === 0 ? <span className="font-semibold text-pink-600">Today 🎂</span> : <span className="text-muted-foreground">{formatDate(e.date_of_birth, { day: "numeric", month: "short", year: undefined })} · in {days} d</span>} />
            ))}
            {!s.birthdays.length && <li className="py-6 text-center text-sm text-muted-foreground">No birthdays in the next 30 days.</li>}
          </ul>
        </SectionCard>
        <SectionCard title="Work anniversaries" description="Next 30 days" actions={<Award className="h-4 w-4 text-amber-500" />}>
          <ul className="divide-y divide-border">
            {s.anniversaries.map(({ e, days, years }) => (
              <PersonRow key={e.name} e={e} right={<><span className="font-semibold text-amber-600">{years} yr{years === 1 ? "" : "s"}</span><br /><span className="text-muted-foreground">{days === 0 ? "today" : `in ${days} d`}</span></>} />
            ))}
            {!s.anniversaries.length && <li className="py-6 text-center text-sm text-muted-foreground">No anniversaries in the next 30 days.</li>}
          </ul>
        </SectionCard>
        <SectionCard title="New joiners" description="Last 30 days" actions={<UserPlus className="h-4 w-4 text-emerald-500" />}>
          <ul className="divide-y divide-border">
            {s.newJoiners.map((e) => (
              <PersonRow key={e.name} e={e} right={<span className="text-muted-foreground">{formatDate(e.date_of_joining)}<br />{tenure(e.date_of_joining)}</span>} />
            ))}
            {!s.newJoiners.length && <li className="py-6 text-center text-sm text-muted-foreground">No one joined in the last 30 days.</li>}
          </ul>
        </SectionCard>
      </div>

      {/* Everything HR */}
      <SectionCard title="HR workspace" description="Every HR screen, one click away">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {QUICK_LINKS.map((q) => (
            <Link key={q.to} to={q.to} className="group flex flex-col items-center gap-2 rounded-lg border border-transparent p-3 text-center transition-colors hover:border-border hover:bg-accent/50">
              <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110", q.tone)}>
                <q.icon className="h-5 w-5" />
              </span>
              <span className="text-xs font-medium">{q.label}</span>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
