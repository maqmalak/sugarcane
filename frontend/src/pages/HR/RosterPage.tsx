import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { cn } from "@/utils/cn";

interface Emp { name: string; employee_name: string; department?: string; designation?: string; default_shift?: string }
interface Cell { shift: string; assignment: string; location?: string }
interface Att { status: string; late?: number; early?: number; leave_type?: string }
interface RosterData {
  employees: Emp[];
  days: Record<string, Record<string, Cell>>;
  attendance: Record<string, Record<string, Att>>;
  holidays: Record<string, { description: string; weekly_off: number }>;
  shifts: { name: string; start: string; end: string }[];
  departments: string[];
}

const PALETTE = [
  { chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-sky-500/30", dot: "bg-sky-500" },
  { chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30", dot: "bg-amber-500" },
  { chip: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 ring-indigo-500/30", dot: "bg-indigo-500" },
  { chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30", dot: "bg-emerald-500" },
  { chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30", dot: "bg-rose-500" },
  { chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-violet-500/30", dot: "bg-violet-500" },
];
/** Short code for a shift: its last word if a single letter (A / B / C), else the initials (General → G). */
const code = (s: string) => {
  const last = s.trim().split(/\s+/).pop() ?? s;
  if (last.length <= 2) return last.toUpperCase();
  return s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w[0])).slice(-1).map((w) => w[0]).join("").toUpperCase();
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ATT_MARK: Record<string, { label: string; cls: string }> = {
  Absent: { label: "Absent", cls: "bg-rose-500" },
  "On Leave": { label: "On leave", cls: "bg-violet-500" },
  "Half Day": { label: "Half day", cls: "bg-amber-500" },
};

/** /hr/roster — shift schedule calendar: employees × days, colour-coded shifts, holidays, attendance outcome. */
export default function RosterPage() {
  const { company } = useCompanyContext();
  const navigate = useNavigate();
  const today = iso(new Date());
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [department, setDepartment] = useState("");
  const [shift, setShift] = useState("");
  const [q, setQ] = useState("");

  const start = iso(month);
  const end = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const args = { company: company ?? "", start, end, department, shift_type: shift };
  const { data, isLoading } = useFrappeGetCall<{ message: RosterData }>("mm_core.roster.get_roster", args,
    company ? `mm_core.roster.${JSON.stringify(args)}` : null, { keepPreviousData: true });
  const r = (data as unknown as { message?: RosterData })?.message;

  const dates = useMemo(() => {
    const out: { iso: string; day: number; wd: string; weekend: boolean }[] = [];
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= last; i++) {
      const d = new Date(month.getFullYear(), month.getMonth(), i);
      out.push({ iso: iso(d), day: i, wd: d.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2), weekend: d.getDay() === 0 });
    }
    return out;
  }, [month]);
  const color = useMemo(() => Object.fromEntries((r?.shifts ?? []).map((s, i) => [s.name, PALETTE[i % PALETTE.length]])), [r?.shifts]);
  const shiftInfo = Object.fromEntries((r?.shifts ?? []).map((s) => [s.name, s]));
  const emps = (r?.employees ?? []).filter((e) => !q || `${e.employee_name} ${e.name} ${e.designation ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const groups = useMemo(() => {
    const m = new Map<string, Emp[]>();
    emps.forEach((e) => { const k = e.department?.replace(/ - [A-Z]+$/, "") || "No department"; m.set(k, [...(m.get(k) ?? []), e]); });
    return [...m.entries()];
  }, [emps]);
  const totals = useMemo(() => {
    const t: Record<string, Record<string, number>> = {};
    emps.forEach((e) => Object.entries(r?.days[e.name] ?? {}).forEach(([d, c]) => { (t[d] ??= {})[c.shift] = (t[d][c.shift] ?? 0) + 1; }));
    return t;
  }, [emps, r?.days]);
  const shift_ = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <div className="space-y-4">
      <PageHeader title="Roster" subtitle="Who works which shift, day by day — rotations, holidays and what actually happened"
        icon={<CalendarDays className="h-5 w-5" />}
        actions={<Link to="/hr/shift-assignments/new" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" /> Assign shift</Link>} />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => shift_(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-36 text-center text-sm font-semibold">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
          <Button size="sm" variant="outline" onClick={() => shift_(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</Button>
        </div>
        <Select id="roster-dept" value={department} onChange={(e) => setDepartment(e.target.value)} className="h-8 w-52 text-xs" aria-label="Department">
          <option value="">All departments</option>
          {(r?.departments ?? []).map((d) => <option key={d} value={d}>{d.replace(/ - [A-Z]+$/, "")}</option>)}
        </Select>
        <Select id="roster-shift" value={shift} onChange={(e) => setShift(e.target.value)} className="h-8 w-48 text-xs" aria-label="Shift">
          <option value="">All shifts</option>
          {(r?.shifts ?? []).map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input id="roster-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Employee…" className="h-8 w-48 pl-8 text-xs" />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {(r?.shifts ?? []).map((s) => (
            <span key={s.name} className="flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-sm", color[s.name]?.dot)} />{code(s.name)} {s.name} <span className="opacity-70">{s.start}–{s.end}</span></span>
          ))}
          {Object.entries(ATT_MARK).map(([k, v]) => <span key={k} className="flex items-center gap-1"><span className={cn("h-1.5 w-1.5 rounded-full", v.cls)} />{v.label}</span>)}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {isLoading && !r ? <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8" />)}</div> : (
          <div className="max-h-[72vh] overflow-auto scrollbar-thin">
            <table className="border-separate border-spacing-0 text-xs">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky left-0 z-30 min-w-56 border-b border-r border-border bg-card px-3 py-2 text-left text-[10px] uppercase tracking-wide text-muted-foreground">Employee</th>
                  {dates.map((d) => {
                    const hol = r?.holidays[d.iso];
                    return (
                      <th key={d.iso} title={hol?.description}
                        className={cn("min-w-[34px] border-b border-border px-0.5 py-1 text-center font-medium",
                          hol || d.weekend ? "bg-muted text-muted-foreground" : "bg-card", d.iso === today && "bg-primary/10 text-primary")}>
                        <div className="text-[9px] uppercase">{d.wd}</div><div className="text-[11px] tabular-nums">{d.day}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr><td colSpan={dates.length + 1} className="px-3 py-12 text-center text-sm text-muted-foreground">No employees match.</td></tr>
                ) : groups.map(([dept, list]) => [
                  <tr key={`h-${dept}`}>
                    <td className="sticky left-0 z-10 border-b border-border bg-muted/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" colSpan={1}>{dept} · {list.length}</td>
                    <td className="border-b border-border bg-muted/60" colSpan={dates.length} />
                  </tr>,
                  ...list.map((e) => (
                    <tr key={e.name} className="group">
                      <td className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-1 group-hover:bg-muted/40">
                        <Link to={`/hr/employees/${encodeURIComponent(e.name)}`} className="block truncate font-medium hover:underline">{e.employee_name}</Link>
                        <span className="block truncate text-[10px] text-muted-foreground">{e.designation ?? e.name}</span>
                      </td>
                      {dates.map((d) => {
                        const c = r?.days[e.name]?.[d.iso];
                        const a = r?.attendance[e.name]?.[d.iso];
                        const hol = r?.holidays[d.iso];
                        const mark = a ? ATT_MARK[a.status] : undefined;
                        const info = c ? shiftInfo[c.shift] : undefined;
                        const tip = [c ? `${c.shift}${info ? ` ${info.start}–${info.end}` : ""}` : "No shift", c?.location, hol?.description,
                          a ? `${a.status}${a.leave_type ? ` (${a.leave_type})` : ""}${a.late ? " · late" : ""}${a.early ? " · left early" : ""}` : ""].filter(Boolean).join(" · ");
                        return (
                          <td key={d.iso} title={`${e.employee_name} · ${d.iso} · ${tip}`}
                            className={cn("border-b border-border p-0.5 text-center", (hol || d.weekend) && "bg-muted/50", d.iso === today && "bg-primary/[0.06]")}>
                            {c ? (
                              <button type="button" onClick={() => navigate(`/hr/shift-assignments/${encodeURIComponent(c.assignment)}`)}
                                className={cn("relative mx-auto flex h-6 w-7 items-center justify-center rounded-md text-[10px] font-semibold ring-1 transition-transform hover:scale-110",
                                  color[c.shift]?.chip, (hol || d.weekend) && "opacity-50", a?.status === "Absent" && "line-through opacity-60")}>
                                {code(c.shift)}
                                {mark && <span className={cn("absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-card", mark.cls)} />}
                                {!mark && (a?.late || a?.early) ? <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-amber-500" /> : null}
                              </button>
                            ) : (
                              <button type="button" aria-label={`Assign a shift to ${e.employee_name} on ${d.iso}`}
                                onClick={() => navigate(`/hr/shift-assignments/new?employee=${encodeURIComponent(e.name)}&start_date=${d.iso}&end_date=${d.iso}`)}
                                className="mx-auto flex h-6 w-7 items-center justify-center rounded-md text-muted-foreground/0 hover:bg-muted hover:text-muted-foreground">
                                <Plus className="h-3 w-3" />
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )),
                ])}
              </tbody>
              {emps.length > 0 && (
                <tfoot className="sticky bottom-0 z-20">
                  {(r?.shifts ?? []).map((s) => (
                    <tr key={s.name}>
                      <td className="sticky left-0 z-30 border-t border-r border-border bg-card px-3 py-1 text-[10px] font-medium">
                        <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-sm", color[s.name]?.dot)} />{s.name}</span>
                      </td>
                      {dates.map((d) => (
                        <td key={d.iso} className={cn("border-t border-border bg-card text-center text-[10px] tabular-nums", r?.holidays[d.iso] && "bg-muted text-muted-foreground")}>
                          {totals[d.iso]?.[s.name] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
