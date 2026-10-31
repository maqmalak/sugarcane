import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  CalendarCheck, CalendarClock, Clock3, ExternalLink, Hourglass, LogIn, LogOut, Percent, Plus, Timer, UserCheck, UserX, Users2,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ChartCard } from "@/components/charts/chart-card";
import { BarChart, DonutChart } from "@/components/charts/charts";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { KpiGrid, BarList } from "@/components/doc/dashboard-kit";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { FrappeForm } from "@/components/forms/frappe-form";
import type { FormFieldMeta } from "@/components/forms/field-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { EmployeePhoto } from "@/components/hr/employee-photo";
import { HrFilterBar, NameSelect, usePeriod, useHrDimensions, type Period } from "@/components/hr/period-filter";
import { Select } from "@/components/ui/select";
import { useHrInsights, useDebounced } from "@/hooks/useHrInsights";
import { useDocMutations } from "@/hooks/useDoc";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useEmployeeQueryFilter } from "@/hooks/useEmployeeQueryFilter";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { formatDate, todayISO } from "@/utils/dates";
import { cn } from "@/utils/cn";

interface DayRow { date: string; present: number; absent: number; on_leave: number; half_day: number; wfh: number; late?: number; early_out?: number; early_in?: number; ot_hours?: number }
interface Overview {
  by_status: Record<string, number>;
  records: number;
  employees: number;
  late: number;
  early: number;
  early_in: number;
  avg_late_minutes: number;
  avg_early_minutes: number;
  overtime: {
    enabled_shifts: number;
    hours: number;
    records: number;
    employees: number;
    by_department: { department: string; hours: number; records: number; employees: number }[];
    top: { employee: string; employee_name: string; department: string; designation?: string; image?: string; ot_hours: number; ot_days: number; days: number }[];
  };
  present_levels: Record<string, number>;
  absence_levels: Record<string, number>;
  top_late: { employee: string; employee_name: string; department: string; designation?: string; image?: string; days: number; late: number; early_out: number; late_minutes: number }[];
  avg_hours: number;
  headcount: number | null;
  active_marked: number | null;
  daily: DayRow[];
  by_department: { department: string; total: number; present: number; absent: number; on_leave: number; late: number }[];
  top_absentees: { employee: string; employee_name: string; department: string; designation?: string; image?: string; days: number; absent: number; on_leave: number; late: number }[];
}
interface Rec {
  name: string; employee: string; employee_name: string; attendance_date: string; status: string; leave_type?: string; shift?: string;
  late_entry?: number; early_exit?: number; in_time?: string; out_time?: string; working_hours?: number; docstatus: number;
  department?: string; designation?: string; image?: string;
  late_checkin?: number; early_checkout?: number; early_checkin?: number; late_by?: number | null; early_by?: number | null; overtime_hours?: number;
  shift_start?: string | null; shift_end?: string | null;
}

const STATUSES = ["Present", "Absent", "On Leave", "Half Day", "Work From Home"];
const strip = (d?: string) => (d ? d.replace(/ - [A-Z0-9]{2,6}$/, "").replace(/\s{2,}/g, " ") : "Not set");
const presentOf = (d: Omit<DayRow, "date">) => d.present + d.wfh + d.half_day / 2;
const markedOf = (d: Omit<DayRow, "date">) => d.present + d.wfh + d.half_day + d.absent + d.on_leave;
const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0);
const time = (dt?: string) => (dt ? String(dt).slice(11, 16) : "");
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekdayIdx = (iso: string) => (new Date(iso).getDay() + 6) % 7;

const PRESENT_LEVELS = ["Excellent", "Good", "Fair", "Poor"];
const ABSENCE_LEVELS = ["Very Low", "Low", "Moderate", "High"];
/** "9:00:00" / "09:00:00" → "09:00". */
const hhmm = (t?: string | null) => (t ? String(t).padStart(8, "0").slice(0, 5) : "");

function PlainSelect({ value, onChange, placeholder, options }: { value: string; onChange: (v: string) => void; placeholder: string; options: string[] }) {
  return (
    <div className="w-full sm:w-40">
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
    </div>
  );
}

/**
 * Late check-ins, early check-outs and early check-ins (beyond each shift's grace period), with a daily chart.
 * Clicking a tile filters the records table below to those records.
 */
function PunctualityStrip({ ov, flag, setFlag }: { ov?: Overview; flag: string; setFlag: (f: string) => void }) {
  const tiles = [
    { key: "late", label: "Late check-ins", value: ov?.late ?? 0, hint: ov?.avg_late_minutes ? `avg ${ov.avg_late_minutes} min late` : "beyond grace", tone: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400", icon: <Timer className="h-4 w-4" /> },
    { key: "early_out", label: "Early check-outs", value: ov?.early ?? 0, hint: ov?.avg_early_minutes ? `avg ${ov.avg_early_minutes} min early` : "before shift end − grace", tone: "border-orange-500/40 bg-orange-500/5 text-orange-700 dark:text-orange-400", icon: <LogOut className="h-4 w-4" /> },
    { key: "early_in", label: "Early check-ins", value: ov?.early_in ?? 0, hint: "arrived before shift start", tone: "border-sky-500/40 bg-sky-500/5 text-sky-700 dark:text-sky-400", icon: <LogIn className="h-4 w-4" /> },
  ];
  const daily = (ov?.daily ?? []).map((d) => ({ label: formatDate(d.date, { day: "numeric", month: "short", year: undefined }), late: d.late ?? 0, early_out: d.early_out ?? 0, early_in: d.early_in ?? 0 }));
  return (
    <Card className="grid gap-4 p-4 lg:grid-cols-3">
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">Punctuality</h3>
          <p className="text-xs text-muted-foreground">Against each shift's start / end and its grace period · click to filter the records</p>
        </div>
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFlag(flag === t.key ? "" : t.key)}
            className={cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all hover:shadow-sm", flag === t.key ? t.tone + " ring-2 ring-current/30" : "border-border hover:bg-accent/40")}
          >
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", t.tone)}>{t.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-muted-foreground">{t.label}</span>
              <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
            </span>
            <span className="text-xl font-bold tabular-nums">{t.value.toLocaleString()}</span>
          </button>
        ))}
      </div>
      <div className="lg:col-span-2">
        {daily.length > 1 ? (
          <BarChart
            data={daily}
            xKey="label"
            legend
            height={240}
            series={[
              { key: "late", label: "Late check-in", color: "hsl(38 92% 50%)" },
              { key: "early_out", label: "Early check-out", color: "hsl(25 95% 53%)" },
              { key: "early_in", label: "Early check-in", color: "hsl(199 89% 48%)" },
            ]}
          />
        ) : (
          <p className="flex h-full items-center justify-center py-10 text-sm text-muted-foreground">Pick a month or range to see punctuality day by day.</p>
        )}
      </div>
    </Card>
  );
}

/**
 * Overtime on shifts that allow it — department-wise and employee-wise. HRMS's own overtime duration when auto
 * attendance recorded it, otherwise time checked out after the shift ended.
 */
function OvertimeSection({ ov, flag, setFlag, onDepartment }: { ov?: Overview; flag: string; setFlag: (f: string) => void; onDepartment: (d: string) => void }) {
  const ot = ov?.overtime;
  if (!ot) return null;
  if (!ot.enabled_shifts) {
    return (
      <Card className="flex flex-col items-start gap-3 border-dashed p-4 sm:flex-row sm:items-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600"><Hourglass className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Overtime is off</p>
          <p className="text-xs text-muted-foreground">No shift allows overtime yet. Tick <b>Allow Overtime</b> (and pick an Overtime Type) on a shift — overtime insights by department and employee then appear here.</p>
        </div>
        <Link to="/hr/shift-types"><Button variant="outline" size="sm">Shift Types</Button></Link>
      </Card>
    );
  }
  const daily = (ov?.daily ?? []).map((d) => ({ label: formatDate(d.date, { day: "numeric", month: "short", year: undefined }), hours: d.ot_hours ?? 0 }));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Overtime</h3>
            <p className="text-xs text-muted-foreground">{ot.enabled_shifts} shift{ot.enabled_shifts === 1 ? "" : "s"} allow overtime</p>
          </div>
          <button
            type="button"
            onClick={() => setFlag(flag === "overtime" ? "" : "overtime")}
            className={cn("rounded-md px-2 py-1 text-xs font-medium", flag === "overtime" ? "bg-violet-500/15 text-violet-700 dark:text-violet-300" : "text-primary hover:bg-primary/10")}
          >
            {flag === "overtime" ? "Showing OT records" : "Show records"}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Hours", ot.hours.toLocaleString(undefined, { maximumFractionDigits: 1 })],
            ["Employees", ot.employees.toLocaleString()],
            ["Avg / employee", ot.employees ? `${(ot.hours / ot.employees).toFixed(1)} h` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-violet-500/5 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">{k}</p>
              <p className="text-lg font-bold tabular-nums text-violet-700 dark:text-violet-300">{v}</p>
            </div>
          ))}
        </div>
        {daily.length > 1 && <BarChart data={daily} xKey="label" height={150} series={[{ key: "hours", label: "Overtime hours", color: "hsl(262 83% 58%)" }]} />}
      </Card>
      <SectionCard title="Overtime by department" description="Hours, and employees who worked overtime — click to filter">
        {ot.by_department.length ? (
          <BarList
            rows={ot.by_department.slice(0, 8).map((d) => ({
              label: strip(d.department),
              value: d.hours,
              hint: (
                <button type="button" onClick={() => d.department && onDepartment(d.department)} className="hover:text-primary">
                  {d.employees} employees · {d.records} shifts · filter
                </button>
              ),
            }))}
            format={(v) => `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} h`}
            tone="bg-violet-500"
          />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">No overtime in this period.</p>
        )}
      </SectionCard>
      <SectionCard title="Most overtime" description="Employees by overtime hours in the period">
        <ul className="max-h-[300px] divide-y divide-border overflow-y-auto">
          {ot.top.map((p) => (
            <li key={p.employee} className="flex items-center gap-2.5 py-2">
              <EmployeePhoto name={p.employee_name || p.employee} src={p.image} size="sm" editable={false} className="ring-0" />
              <div className="min-w-0 flex-1">
                <Link to={`/hr/employees/${encodeURIComponent(p.employee)}`} className="block truncate text-sm font-medium hover:text-primary hover:underline">{p.employee_name || p.employee}</Link>
                <p className="truncate text-xs text-muted-foreground">{strip(p.department)} · {p.ot_days} day{p.ot_days === 1 ? "" : "s"} · avg {(p.ot_hours / Math.max(1, p.ot_days)).toFixed(1)} h</p>
              </div>
              <span className="shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300">{p.ot_hours.toFixed(1)} h</span>
            </li>
          ))}
          {!ot.top.length && <li className="py-10 text-center text-sm text-muted-foreground">No overtime in this period.</li>}
        </ul>
      </SectionCard>
    </div>
  );
}

/** Attendance-rate colour for a calendar cell. */
function rateTone(rate: number | null) {
  if (rate === null) return "bg-muted/40 text-muted-foreground";
  if (rate >= 90) return "bg-emerald-500/80 text-white";
  if (rate >= 75) return "bg-emerald-500/45 text-emerald-950 dark:text-emerald-50";
  if (rate >= 60) return "bg-amber-400/60 text-amber-950 dark:text-amber-50";
  if (rate >= 40) return "bg-orange-500/60 text-white";
  return "bg-rose-500/70 text-white";
}

/** Calendar of the period, each day coloured by its attendance rate; click a day to drill into it. */
function RateCalendar({ days, period }: { days: DayRow[]; period: Period }) {
  const lead = days.length ? weekdayIdx(days[0].date) : 0;
  const today = todayISO();
  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }).map((_, i) => <span key={`b${i}`} />)}
        {days.map((d) => {
          const marked = markedOf(d);
          const rate = marked ? pct(presentOf(d), marked) : null;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => {
                period.setDay(d.date);
                period.setMode("day");
              }}
              title={`${formatDate(d.date)} — ${marked ? `${rate!.toFixed(1)}% · ${d.present + d.wfh} present, ${d.half_day} half day, ${d.absent} absent, ${d.on_leave} on leave` : "nothing marked"}`}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition-transform hover:scale-105 hover:shadow-md",
                rateTone(rate),
                d.date === today && "ring-2 ring-primary ring-offset-1 ring-offset-background",
              )}
            >
              <span className="font-semibold">{Number(d.date.slice(8))}</span>
              {rate !== null && <span className="text-[10px] opacity-90">{Math.round(rate)}%</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>Rate:</span>
        {[["< 40", 30], ["40–60", 50], ["60–75", 65], ["75–90", 80], ["90 +", 95]].map(([l, r]) => (
          <span key={l} className="inline-flex items-center gap-1"><span className={cn("h-3 w-3 rounded", rateTone(Number(r)))} />{l}%</span>
        ))}
        <span className="inline-flex items-center gap-1"><span className={cn("h-3 w-3 rounded", rateTone(null))} />not marked</span>
      </div>
    </div>
  );
}

const MARK_FIELDS: FormFieldMeta[] = [
  { fieldname: "employee", label: "Employee", fieldtype: "Link", options: "Employee", reqd: true },
  { fieldname: "attendance_date", label: "Attendance Date", fieldtype: "Date", reqd: true },
  { fieldname: "status", label: "Status", fieldtype: "Select", options: STATUSES.join("\n"), reqd: true },
  { fieldname: "cb", fieldtype: "Column Break" },
  { fieldname: "leave_type", label: "Leave Type (if On Leave)", fieldtype: "Link", options: "Leave Type" },
  { fieldname: "shift", label: "Shift", fieldtype: "Link", options: "Shift Type" },
  { fieldname: "late_entry", label: "Late Entry", fieldtype: "Check" },
  { fieldname: "early_exit", label: "Early Exit", fieldtype: "Check" },
];

/** Mark one attendance record and (by default) submit it straight away. */
function MarkAttendanceDialog({ open, onClose, onDone, company, employee }: { open: boolean; onClose: () => void; onDone: () => void; company?: string; employee?: string | null }) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [submit, setSubmit] = useState(true);
  const [saving, setSaving] = useState(false);
  const { createDoc, submitDoc } = useDocMutations("Attendance");
  const [seeded, setSeeded] = useState(false);
  if (open && !seeded) {
    setSeeded(true);
    setValues({ attendance_date: todayISO(), status: "Present", company, employee: employee ?? undefined });
  }
  if (!open && seeded) setSeeded(false);

  const save = async () => {
    const missing = MARK_FIELDS.filter((f) => f.reqd && !values[f.fieldname]).map((f) => f.label);
    if (missing.length) return toast.error(`Fill in: ${missing.join(", ")}`);
    if (values.status === "On Leave" && !values.leave_type) return toast.error("Choose the leave type for On Leave.");
    setSaving(true);
    try {
      const doc = await createDoc({ ...values, company });
      if (submit) await submitDoc(doc.name);
      toast.success(submit ? "Attendance marked" : "Attendance saved as draft");
      notifyDataChanged();
      onDone();
      onClose();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Mark Attendance" description="One employee, one day." size="lg">
      <FrappeForm fields={MARK_FIELDS} values={values} onChange={(f, v) => setValues((s) => ({ ...s, [f]: v }))} />
      <div className="mt-5 flex items-center justify-between gap-3">
        <Checkbox label="Submit now" checked={submit} onChange={(e) => setSubmit(e.target.checked)} className="text-sm" />
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>{submit ? "Mark & Submit" : "Save Draft"}</Button>
        </div>
      </div>
    </Dialog>
  );
}

export default function AttendancePage() {
  const { company } = useCompanyContext();
  const { employee } = useEmployeeQueryFilter();
  const period = usePeriod("month");
  const dims = useHrDimensions();
  const search = useDebounced(dims.search);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "attendance_date", dir: "desc" });
  const [marking, setMarking] = useState(false);
  const [flag, setFlag] = useState("");
  const [shift, setShift] = useState("");
  const [gender, setGender] = useState("");
  const [marital, setMarital] = useState("");
  const [etype, setEtype] = useState("");

  const filters = {
    from_date: period.from, to_date: period.to, company, department: dims.department, branch: dims.branch, employee, search,
    shift, gender, marital_status: marital, employment_type: etype,
  };
  const { data: ov, isLoading: ovLoading, mutate: refreshOv } = useHrInsights<Overview>("attendance_overview", filters);
  const { data: recs, isLoading, error, mutate } = useHrInsights<{ rows: Rec[]; total: number }>("attendance_records", {
    ...filters,
    status,
    flag,
    start: page * pageSize,
    page_length: pageSize,
    sort_by: sort.key,
    sort_order: sort.dir,
  });
  // New filters → back to the first page.
  const filterKey = JSON.stringify({ ...filters, status, flag });
  const [lastKey, setLastKey] = useState(filterKey);
  if (filterKey !== lastKey) {
    setLastKey(filterKey);
    setPage(0);
  }

  const s = useMemo(() => {
    const st = ov?.by_status ?? {};
    const t = { present: st["Present"] ?? 0, absent: st["Absent"] ?? 0, on_leave: st["On Leave"] ?? 0, half_day: st["Half Day"] ?? 0, wfh: st["Work From Home"] ?? 0 };
    const marked = markedOf(t);
    const daily = (ov?.daily ?? []).map((d) => ({ ...d, label: formatDate(d.date, { day: "numeric", month: "short", year: undefined }), present_all: d.present + d.wfh }));
    const weekday = WEEKDAYS.map((w, i) => {
      const ds = (ov?.daily ?? []).filter((d) => weekdayIdx(d.date) === i);
      const m = ds.reduce((a, d) => a + markedOf(d), 0);
      return { day: w, rate: Math.round(pct(ds.reduce((a, d) => a + presentOf(d), 0), m) * 10) / 10, marked: m };
    }).filter((w) => w.marked);
    const markedDays = (ov?.daily ?? []).filter((d) => markedOf(d) > 0);
    const best = [...markedDays].sort((a, b) => pct(presentOf(b), markedOf(b)) - pct(presentOf(a), markedOf(a)))[0];
    const worst = [...markedDays].sort((a, b) => pct(presentOf(a), markedOf(a)) - pct(presentOf(b), markedOf(b)))[0];
    const depts = (ov?.by_department ?? []).filter((d) => d.total > 0).map((d) => ({ ...d, rate: pct(d.present, d.total) })).sort((a, b) => a.rate - b.rate);
    const levels = (src: Record<string, number> | undefined, order: string[], colors: string[]) =>
      order.map((label, i) => ({ label, value: src?.[label] ?? 0, color: colors[i] })).filter((x) => x.value > 0);
    const presentLevels = levels(ov?.present_levels, PRESENT_LEVELS, ["hsl(142 71% 38%)", "hsl(160 60% 52%)", "hsl(38 92% 50%)", "hsl(351 85% 55%)"]);
    const absenceLevels = levels(ov?.absence_levels, ABSENCE_LEVELS, ["hsl(142 71% 38%)", "hsl(160 60% 52%)", "hsl(38 92% 50%)", "hsl(351 85% 55%)"]);
    return { t, marked, rate: pct(presentOf(t), marked), daily, weekday, best, worst, depts, markedDays: markedDays.length, presentLevels, absenceLevels };
  }, [ov]);

  const statusData = [
    { label: "Present", value: s.t.present, color: "hsl(160 84% 39%)" },
    { label: "Work from home", value: s.t.wfh, color: "hsl(239 84% 67%)" },
    { label: "Half day", value: s.t.half_day, color: "hsl(173 80% 40%)" },
    { label: "On leave", value: s.t.on_leave, color: "hsl(38 92% 50%)" },
    { label: "Absent", value: s.t.absent, color: "hsl(351 95% 59%)" },
  ].filter((x) => x.value > 0);

  const columns: ColumnDef<Rec>[] = [
    {
      key: "employee_name",
      label: "Employee",
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <EmployeePhoto name={r.employee_name || r.employee} src={r.image} size="sm" editable={false} className="ring-0" />
          <div className="min-w-0">
            <Link to={`/hr/employees/${encodeURIComponent(r.employee)}`} onClick={(e) => e.stopPropagation()} className="block truncate text-sm font-medium hover:text-primary hover:underline">
              {r.employee_name || r.employee}
            </Link>
            <p className="truncate text-xs text-muted-foreground">{r.employee}{r.designation ? ` · ${r.designation}` : ""}</p>
          </div>
        </div>
      ),
    },
    {
      key: "attendance_date",
      label: "Date",
      sortable: true,
      render: (r) => (
        <div className="text-sm">
          {formatDate(r.attendance_date)}
          <p className="text-xs text-muted-foreground">{formatDate(r.attendance_date, { weekday: "long", day: undefined, month: undefined, year: undefined })}</p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) => (
        <div className="flex flex-col items-start gap-0.5">
          <StatusBadge status={r.status} />
          {r.leave_type && <span className="text-[11px] text-muted-foreground">{r.leave_type}</span>}
        </div>
      ),
    },
    { key: "department", label: "Department", sortable: true, render: (r) => <span className="text-sm">{strip(r.department)}</span>, getValue: (r) => strip(r.department) },
    { key: "shift", label: "Shift", render: (r) => <span className="text-sm">{r.shift || "—"}</span> },
    {
      key: "in_time",
      label: "In / Out",
      render: (r) =>
        r.in_time || r.out_time ? (
          <div>
            <span className="font-mono text-xs">
              <span className={r.late_checkin ? "font-semibold text-amber-600" : r.early_checkin ? "text-sky-600" : ""}>{time(r.in_time) || "--:--"}</span>
              {" → "}
              <span className={r.early_checkout ? "font-semibold text-orange-600" : ""}>{time(r.out_time) || "--:--"}</span>
            </span>
            {r.shift_start && <p className="font-mono text-[10px] text-muted-foreground">shift {hhmm(r.shift_start)}–{hhmm(r.shift_end)}</p>}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: "working_hours", label: "Hours", align: "right", render: (r) => (r.working_hours ? <span className="tabular-nums">{Number(r.working_hours).toFixed(1)}</span> : <span className="text-muted-foreground">—</span>) },
    {
      key: "flags",
      label: "Flags",
      getValue: (r) =>
        [r.late_checkin ? `Late check-in${r.late_by ? ` ${r.late_by}m` : ""}` : "", r.early_checkout ? `Early check-out${r.early_by ? ` ${r.early_by}m` : ""}` : "", r.early_checkin ? "Early check-in" : "", r.docstatus === 0 ? "Draft" : ""]
          .filter(Boolean)
          .join(", "),
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {!!r.late_checkin && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">Late{r.late_by ? ` +${r.late_by}m` : ""}</span>}
          {!!r.early_checkout && <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-400">Early out{r.early_by ? ` −${r.early_by}m` : ""}</span>}
          {!!r.early_checkin && <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400">Early in</span>}
          {!!r.overtime_hours && <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-400">OT {Number(r.overtime_hours).toFixed(1)}h</span>}
          {r.docstatus === 0 && <span className="rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">Draft</span>}
        </div>
      ),
    },
  ];

  const tabs = [{ value: "", label: "All", n: ov?.records }, ...STATUSES.map((x) => ({ value: x, label: x, n: ov?.by_status[x] ?? 0 }))].filter((t) => t.value === "" || t.n);
  const expected = ov?.headcount && period.mode === "day" ? ov.headcount : null;
  const markedActive = ov?.active_marked ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        subtitle={`${period.label}${employee ? ` · ${employee}` : ""} — daily attendance, punctuality and absence patterns`}
        icon={<CalendarCheck className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Link to="/hr/checkins"><Button variant="outline" size="sm"><Clock3 className="h-4 w-4" /> Checkins</Button></Link>
            <Button variant="primary" size="sm" onClick={() => setMarking(true)}><Plus className="h-4 w-4" /> Mark Attendance</Button>
          </div>
        }
      />

      <HrFilterBar period={period} dims={dims} company={company}>
        <NameSelect doctype="Shift Type" value={shift} onChange={setShift} placeholder="All shifts" />
        <PlainSelect value={gender} onChange={setGender} placeholder="All genders" options={["Male", "Female"]} />
        <PlainSelect value={marital} onChange={setMarital} placeholder="Any marital status" options={["Single", "Married", "Divorced", "Widowed"]} />
        <NameSelect doctype="Employment Type" value={etype} onChange={setEtype} placeholder="All employment types" />
      </HrFilterBar>

      <KpiGrid
        items={[
          { label: "Attendance rate", value: ovLoading && !ov ? "…" : `${s.rate.toFixed(1)}%`, icon: <Percent className="h-4 w-4" />, tone: s.rate >= 85 ? "emerald" : s.rate >= 70 ? "amber" : "rose", },
          { label: "Present", value: (s.t.present + s.t.wfh).toLocaleString(), icon: <UserCheck className="h-4 w-4" />, tone: "emerald", valueSuffix: s.t.wfh ? `${s.t.wfh} WFH` : s.t.half_day ? `+${s.t.half_day} half` : undefined },
          { label: "Absent", value: s.t.absent.toLocaleString(), icon: <UserX className="h-4 w-4" />, tone: "rose", valueSuffix: s.marked ? `${pct(s.t.absent, s.marked).toFixed(1)}%` : undefined },
          { label: "On leave", value: s.t.on_leave.toLocaleString(), icon: <CalendarClock className="h-4 w-4" />, tone: "amber" },
          { label: "Late check-ins", value: (ov?.late ?? 0).toLocaleString(), icon: <Timer className="h-4 w-4" />, tone: "indigo", valueSuffix: ov?.avg_late_minutes ? `avg ${ov.avg_late_minutes}m` : undefined },
          expected
            ? { label: "Unmarked staff", value: Math.max(0, expected - markedActive).toLocaleString(), icon: <Users2 className="h-4 w-4" />, tone: markedActive >= expected ? "emerald" : "amber", valueSuffix: `of ${expected}` }
            : { label: "Employees marked", value: (ov?.employees ?? 0).toLocaleString(), icon: <Users2 className="h-4 w-4" />, tone: "sky", valueSuffix: ov?.avg_hours ? `avg ${ov.avg_hours} h/day` : `${(ov?.records ?? 0).toLocaleString()} records` },
        ]}
      />

      <PunctualityStrip ov={ov} flag={flag} setFlag={setFlag} />

      <OvertimeSection ov={ov} flag={flag} setFlag={setFlag} onDepartment={dims.setDepartment} />

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Present level" subtitle="Employees by how often they were present · Excellent ≥ 95% · Good ≥ 85% · Fair ≥ 75% · Poor < 75%">
          {s.presentLevels.length ? <DonutChart data={s.presentLevels} height={260} innerRadius="58%" /> : <p className="py-16 text-center text-sm text-muted-foreground">Nothing marked.</p>}
        </ChartCard>
        <ChartCard title="Absence level" subtitle="Employees by share of days absent · Very Low < 5% · Low < 10% · Moderate < 20% · High ≥ 20%">
          {s.absenceLevels.length ? <DonutChart data={s.absenceLevels} height={260} innerRadius="58%" /> : <p className="py-16 text-center text-sm text-muted-foreground">Nothing marked.</p>}
        </ChartCard>
        <SectionCard title="Most late" description="Late check-ins (and early check-outs) in the period, beyond the shift's grace">
          <ul className="max-h-[260px] divide-y divide-border overflow-y-auto">
            {(ov?.top_late ?? []).map((p) => (
              <li key={p.employee} className="flex items-center gap-2.5 py-2">
                <EmployeePhoto name={p.employee_name || p.employee} src={p.image} size="sm" editable={false} className="ring-0" />
                <div className="min-w-0 flex-1">
                  <Link to={`/hr/employees/${encodeURIComponent(p.employee)}`} className="block truncate text-sm font-medium hover:text-primary hover:underline">{p.employee_name || p.employee}</Link>
                  <p className="truncate text-xs text-muted-foreground">{strip(p.department)}{p.late && p.late_minutes ? ` · avg ${Math.round(p.late_minutes / p.late)}m late` : ""}</p>
                </div>
                <div className="flex shrink-0 gap-1 text-xs">
                  {!!p.late && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-400">{p.late} late</span>}
                  {!!p.early_out && <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-orange-700 dark:text-orange-400">{p.early_out} early</span>}
                </div>
              </li>
            ))}
            {!(ov?.top_late ?? []).length && <li className="py-10 text-center text-sm text-muted-foreground">Everyone on time. 🎉</li>}
          </ul>
        </SectionCard>
      </div>

      {period.days > 1 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard title="Day by day" subtitle={`Records per day by status · best ${s.best ? formatDate(s.best.date, { day: "numeric", month: "short", year: undefined }) : "—"}, worst ${s.worst ? formatDate(s.worst.date, { day: "numeric", month: "short", year: undefined }) : "—"}`} className="lg:col-span-2">
            <BarChart
              data={s.daily}
              xKey="label"
              stacked
              legend
              height={290}
              series={[
                { key: "present_all", label: "Present", color: "hsl(160 84% 39%)" },
                { key: "half_day", label: "Half day", color: "hsl(173 80% 40%)" },
                { key: "on_leave", label: "On leave", color: "hsl(38 92% 50%)" },
                { key: "absent", label: "Absent", color: "hsl(351 95% 59%)" },
              ]}
            />
          </ChartCard>
          <ChartCard title="Status mix" subtitle={`${s.marked.toLocaleString()} records`}>
            {statusData.length ? <DonutChart data={statusData} height={290} innerRadius="62%" /> : <p className="py-20 text-center text-sm text-muted-foreground">Nothing marked in this period.</p>}
          </ChartCard>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard title="Status mix" subtitle={`${period.label} · ${s.marked.toLocaleString()} records`}>
            {statusData.length ? <DonutChart data={statusData} height={260} innerRadius="62%" /> : <p className="py-16 text-center text-sm text-muted-foreground">Nothing marked on this day.</p>}
          </ChartCard>
          <DepartmentRates depts={s.depts} onPick={dims.setDepartment} className="lg:col-span-2" />
        </div>
      )}

      {period.days > 1 && (
        <div className="grid gap-4 lg:grid-cols-3">
          {period.days <= 62 ? (
            <SectionCard title="Attendance calendar" description="Each day's attendance rate — click a day to open it">
              <RateCalendar days={ov?.daily ?? []} period={period} />
            </SectionCard>
          ) : (
            <ChartCard title="Attendance rate trend" subtitle="Daily rate across the range">
              <BarChart data={s.daily.map((d) => ({ label: d.label, rate: Math.round(pct(presentOf(d), markedOf(d)) * 10) / 10 }))} xKey="label" percent height={260} series={[{ key: "rate", label: "Rate", color: "hsl(160 84% 39%)" }]} />
            </ChartCard>
          )}
          <DepartmentRates depts={s.depts} onPick={dims.setDepartment} />
          <ChartCard title="Weekday pattern" subtitle="Attendance rate by day of the week">
            {s.weekday.length ? (
              <BarChart data={s.weekday} xKey="day" percent height={260} series={[{ key: "rate", label: "Rate", color: "hsl(199 89% 48%)" }]} />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">Nothing marked yet.</p>
            )}
          </ChartCard>
        </div>
      )}

      <SectionCard title="Most absent" description="Employees with the most absences in the period — late entries and leave alongside">
        {(ov?.top_absentees ?? []).length ? (
          <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
            {(ov?.top_absentees ?? []).map((p, i) => (
              <div key={p.employee} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
                <span className="w-5 text-center text-xs font-semibold text-muted-foreground">{i + 1}</span>
                <EmployeePhoto name={p.employee_name || p.employee} src={p.image} size="sm" editable={false} className="ring-0" />
                <div className="min-w-0 flex-1">
                  <Link to={`/hr/employees/${encodeURIComponent(p.employee)}`} className="block truncate text-sm font-medium hover:text-primary hover:underline">{p.employee_name || p.employee}</Link>
                  <p className="truncate text-xs text-muted-foreground">{[p.designation, strip(p.department)].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-xs">
                  <span className="rounded-full bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-600 dark:text-rose-400">{p.absent} absent</span>
                  {!!p.on_leave && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-400">{p.on_leave} leave</span>}
                  {!!p.late && <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-indigo-600 dark:text-indigo-400">{p.late} late</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No absences in this period. 🎉</p>
        )}
      </SectionCard>

      <Card className="p-0">
        <div className="flex flex-wrap gap-1 border-b border-border px-3 pt-3">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setStatus(t.value)}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors",
                status === t.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{(t.n ?? 0).toLocaleString()}</span>
            </button>
          ))}
        </div>
        <div className="p-3">
          <FrappeDataTable
            columns={columns}
            rows={recs?.rows ?? []}
            rowKey={(r) => r.name}
            loading={isLoading}
            error={error}
            onRetry={() => void mutate()}
            searchable={false}
            title="Records"
            subtitle={`${(recs?.total ?? 0).toLocaleString()} records · ${period.label}`}
            exportFilename={`attendance-${period.from}-to-${period.to}`}
            printTitle="Attendance"
            printSubtitle={period.label}
            pageSizeOptions={[25, 50, 100, 200]}
            rowActions={(r) => [{ label: "Open in ERPNext", icon: <ExternalLink className="h-4 w-4" />, onClick: () => window.open(`/desk/attendance/${encodeURIComponent(r.name)}`, "_blank") }]}
            emptyTitle="No attendance records"
            emptyDescription="Nothing matches this period and these filters."
            serverSide={{
              total: recs?.total ?? 0,
              page,
              pageSize,
              onPageChange: setPage,
              onPageSizeChange: (n) => {
                setPageSize(n);
                setPage(0);
              },
              query: dims.search,
              onQueryChange: dims.setSearch,
              sort,
              onSortChange: setSort,
            }}
          />
        </div>
      </Card>

      <MarkAttendanceDialog
        open={marking}
        onClose={() => setMarking(false)}
        onDone={() => {
          void mutate();
          void refreshOv();
        }}
        company={company}
        employee={employee}
      />
    </div>
  );
}

/** Departments by attendance rate, worst first; clicking one filters the page to it. */
function DepartmentRates({ depts, onPick, className }: { depts: { department: string; total: number; present: number; absent: number; late: number; rate: number }[]; onPick: (d: string) => void; className?: string }) {
  return (
    <SectionCard title="By department" description="Attendance rate, lowest first — click to filter" className={className}>
      {depts.length ? (
        <ul className="max-h-[290px] space-y-2.5 overflow-y-auto pr-1">
          {depts.map((d) => (
            <li key={d.department || "none"}>
              <button type="button" onClick={() => d.department && onPick(d.department)} className="w-full space-y-1 text-left">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium hover:text-primary">{strip(d.department)}</span>
                  <span className={cn("shrink-0 font-semibold tabular-nums", d.rate >= 85 ? "text-emerald-600" : d.rate >= 70 ? "text-amber-600" : "text-rose-600")}>{d.rate.toFixed(1)}%</span>
                </div>
                <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-emerald-500" style={{ width: `${d.rate}%` }} />
                  <div className="h-full bg-rose-500/70" style={{ width: `${pct(d.absent, d.total)}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground">{d.total.toLocaleString()} records · {d.absent.toLocaleString()} absent{d.late ? ` · ${d.late} late` : ""}</p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">Nothing marked in this period.</p>
      )}
    </SectionCard>
  );
}
