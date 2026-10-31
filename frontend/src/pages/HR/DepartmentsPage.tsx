import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Users2, Crown, Banknote, CircleSlash, Pencil, Trash2, ArrowRight, CalendarCheck, Sparkles, ChevronRight, Network } from "lucide-react";
import { CrmManagementPage, countStat, type CrmCardActions, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import { ICON_GRADIENT } from "@/components/ui/app-icon";
import { deptLook, deptLabel as label } from "./department-look";
import { cn } from "@/utils/cn";
import type { ColumnDef } from "@/components/tables/data-table";
import { SectionCard } from "@/components/common/section-card";
import { BarList } from "@/components/doc/dashboard-kit";
import { useAggregate, useDocList, count, sum } from "@/hooks/useDoc";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { formatMoney, compactNumber } from "@/utils/currency";
import { formatDate, startOfMonthISO, todayISO } from "@/utils/dates";
import { asNumber } from "@/utils/cn";

interface DepartmentRow {
  name: string;
  department_name?: string;
  mm_urdu_name?: string;
  mm_code?: string;
  mm_level?: string;
  parent_department?: string;
  company?: string;
  is_group?: number;
  disabled?: number;
}


/** Cards view: one card per department — headcount, gender split, attendance and last payroll, with edit / delete. */
function DepartmentCard({ row, ins, currency, actions }: {
  row: DepartmentRow;
  ins: ReturnType<typeof useDepartmentInsights>;
  currency: string;
  actions: CrmCardActions;
}) {
  const name = row.department_name || label(row.name);
  const { icon: Icon, hue } = deptLook(name);
  const heads = ins.headcount[row.name] ?? 0;
  const g = ins.gender[row.name] ?? { male: 0, female: 0, other: 0 };
  const att = ins.attendance[row.name];
  const attPct = att?.total ? Math.round((att.present / att.total) * 100) : null;
  const pay = ins.payroll[row.name] ?? 0;
  const units = ins.tree.children[row.name]?.length ?? 0;
  const unitWord = row.mm_level === "Division" ? "department" : "sub-department";
  const gTotal = g.male + g.female + g.other;
  const gradient = ICON_GRADIENT[hue] ?? ICON_GRADIENT.blue;

  return (
    <article className={cn(
      "surface surface-hover group relative flex h-full flex-col overflow-hidden rounded-2xl transition-all duration-200",
      "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl",
      row.disabled && "opacity-60",
    )}>
      {/* soft colour wash in the department's hue */}
      <div aria-hidden className={cn("pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-gradient-to-br opacity-25 blur-2xl dark:opacity-30", gradient)} />

      <div className="relative flex items-start gap-3 p-4 pb-3">
        <span className={cn("relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b text-white shadow-lg ring-1 ring-inset ring-white/25", gradient)}>
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-white/0" />
          <Icon className="relative h-6 w-6 drop-shadow-sm" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-tight" title={name}>{name}</h3>
          {row.mm_urdu_name && <p className="urdu truncate text-sm leading-[1.9] text-muted-foreground" dir="rtl" style={{ textAlign: "left" }}>{row.mm_urdu_name}</p>}
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {row.parent_department ? <>under {label(row.parent_department)}</> : "Top level"}
            {row.is_group ? " · group" : ""}
          </p>
          <span className={cn("mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            row.disabled ? "bg-muted text-muted-foreground" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", row.disabled ? "bg-muted-foreground" : "bg-emerald-500")} />
            {row.disabled ? "Disabled" : "Active"}
          </span>
        </div>
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button type="button" onClick={actions.edit} title="Edit" aria-label={`Edit ${name}`}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={actions.remove} title="Delete" aria-label={`Delete ${name}`}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <dl className="surface-inset relative mx-4 grid grid-cols-3 divide-x divide-border rounded-xl text-center dark:divide-white/10">
        <div className="px-2 py-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">People</dt>
          <dd className="text-lg font-semibold tabular-nums">{heads}</dd>
        </div>
        <div className="px-2 py-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Attendance</dt>
          <dd className={cn("text-lg font-semibold tabular-nums",
            attPct === null ? "text-muted-foreground" : attPct < 80 ? "text-rose-600" : attPct < 90 ? "text-amber-600" : "text-emerald-600")}>
            {attPct === null ? "—" : `${attPct}%`}
          </dd>
        </div>
        <div className="px-2 py-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Gross pay</dt>
          <dd className="truncate text-lg font-semibold tabular-nums" title={pay ? formatMoney(pay, currency) : undefined}>
            {pay ? formatMoney(pay, currency, { compact: true }) : "—"}
          </dd>
        </div>
      </dl>

      <div className="relative mt-3 px-4">
        <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
          {gTotal > 0 && <>
            <div className="bg-sky-500" style={{ width: `${(g.male / gTotal) * 100}%` }} />
            <div className="bg-pink-500" style={{ width: `${(g.female / gTotal) * 100}%` }} />
            <div className="bg-slate-400" style={{ width: `${(g.other / gTotal) * 100}%` }} />
          </>}
        </div>
        <div className="mt-1.5 flex gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />{g.male} male</span>
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-pink-500" />{g.female} female</span>
          {g.other > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />{g.other} other</span>}
        </div>
      </div>

      <div className="relative mt-4 flex items-center justify-between border-t border-border px-4 py-2.5 dark:border-white/10 dark:bg-black/10">
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          {units ? <><Users2 className="h-3.5 w-3.5" /> across {units} {unitWord}{units === 1 ? "" : "s"}</>
            : <><CalendarCheck className="h-3.5 w-3.5" /> {att?.total ? `${att.total} records this month` : "No attendance this month"}</>}
        </span>
        {actions.open && (
          <button type="button" onClick={actions.open}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary transition hover:gap-1.5">
            Employees <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}

const LEVEL_TONE: Record<string, string> = {
  Division: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  Department: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  "Sub Department": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
};
const BAR_TONE: Record<number, string> = { 0: "from-violet-500 to-fuchsia-500", 1: "from-sky-500 to-cyan-400", 2: "from-emerald-500 to-teal-400" };

/** Headcount by Division → Department → Sub Department: expandable rows, each with its rolled-up total, share of all
 * staff and male / female split. */
function HeadcountTree({ ins, onOpen }: { ins: ReturnType<typeof useDepartmentInsights>; onOpen: (name: string) => void }) {
  const { nodes, children, roots } = ins.tree;
  const [open, setOpen] = useState<Set<string>>(() => new Set(roots));
  const [showEmpty, setShowEmpty] = useState(false);
  useEffect(() => { setOpen((o) => (o.size ? o : new Set(roots))); }, [roots]);
  const total = roots.reduce((n, r) => n + (ins.headcount[r] ?? 0), 0) || 1;
  const sortKids = (list: string[]) => [...list].filter((n) => showEmpty || (ins.headcount[n] ?? 0) > 0)
    .sort((a, b) => (ins.headcount[b] ?? 0) - (ins.headcount[a] ?? 0));
  const allGroups = Object.keys(children).filter((n) => nodes[n]);
  const toggle = (n: string) => setOpen((o) => { const x = new Set(o); x.has(n) ? x.delete(n) : x.add(n); return x; });
  const divisions = sortKids(roots);
  const levelCount = (lvl: string) => Object.values(nodes).filter((n) => n.mm_level === lvl && (ins.headcount[n.name] ?? 0) > 0).length;

  const Row = ({ name, depth }: { name: string; depth: number }) => {
    const n = nodes[name];
    const heads = ins.headcount[name] ?? 0;
    const g = ins.gender[name] ?? { male: 0, female: 0, other: 0 };
    const kids = sortKids(children[name] ?? []);
    const isOpen = open.has(name);
    const pct = (heads / total) * 100;
    return (
      <>
        <div className={cn("group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-accent/60 md:grid-cols-[minmax(0,2.2fr)_minmax(0,3fr)_auto]",
          depth === 0 && "bg-muted/60 dark:bg-white/[0.07]",
          depth === 0 && isOpen && "rounded-b-none border-b border-border dark:border-white/10",
          depth > 0 && "relative before:absolute before:inset-y-1 before:left-[var(--guide)] before:w-px before:bg-border dark:before:bg-white/15",
          depth === 1 && isOpen && "bg-sky-500/[0.06] dark:bg-sky-400/[0.08]")}
          style={depth > 0 ? ({ ["--guide" as string]: `${depth * 22 - 8}px` } as React.CSSProperties) : undefined}>
          <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 22 }}>
            {kids.length ? (
              <button type="button" onClick={() => toggle(name)} aria-expanded={isOpen} aria-label={isOpen ? "Collapse" : "Expand"}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <ChevronRight className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
              </button>
            ) : <span className="h-6 w-6 shrink-0" />}
            <button type="button" onClick={() => onOpen(name)} className="min-w-0 text-left" title="View employees">
              <span className={cn("block truncate", depth === 0 ? "text-sm font-semibold" : "text-sm")}>{n?.department_name || label(name)}</span>
              {n?.mm_urdu_name && <span className="urdu block truncate text-xs leading-[1.8] text-muted-foreground" dir="rtl" style={{ textAlign: "left" }}>{n.mm_urdu_name}</span>}
            </button>
            {n?.mm_level && <span className={cn("hidden shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide sm:inline", LEVEL_TONE[n.mm_level])}>{n.mm_level === "Sub Department" ? "Sub" : n.mm_level}</span>}
            {kids.length > 0 && <span className="hidden shrink-0 text-[10px] text-muted-foreground lg:inline">{kids.length} {kids.length === 1 ? "unit" : "units"}</span>}
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full bg-gradient-to-r", BAR_TONE[Math.min(depth, 2)])} style={{ width: `${Math.max(heads ? 2 : 0, pct)}%` }} />
            </div>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{pct.toFixed(pct < 10 ? 1 : 0)}%</span>
            <span className="hidden w-24 shrink-0 text-[11px] tabular-nums text-muted-foreground xl:inline">
              <span className="text-sky-500">{g.male}</span> M · <span className="text-pink-500">{g.female}</span> F
            </span>
          </div>
          <span className={cn("min-w-[3rem] text-right tabular-nums", depth === 0 ? "text-base font-bold" : "text-sm font-semibold")}>{heads}</span>
        </div>
        {isOpen && kids.map((k) => <Row key={k} name={k} depth={depth + 1} />)}
      </>
    );
  };

  // An open division is framed as one block (its departments and sub-departments inside), so it stands out in dark mode.
  const Division = ({ name }: { name: string }) => {
    const isOpen = open.has(name);
    return (
      <div className={cn("overflow-hidden rounded-xl transition",
        isOpen ? "surface-inset border-l-[3px] border-l-violet-500 shadow-sm dark:border-l-violet-400" : "border border-transparent")}>
        <Row name={name} depth={0} />
      </div>
    );
  };

  return (
    <section className="surface rounded-2xl">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4 dark:border-white/10">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Network className="h-4.5 w-4.5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Headcount by division, department and sub-department</h2>
          <p className="text-xs text-muted-foreground">Active employees, rolled up — click a name to see its people</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[["Division", levelCount("Division")], ["Department", levelCount("Department")], ["Sub Department", levelCount("Sub Department")]].map(([l, n]) => (
            <span key={l as string} className={cn("rounded-full px-2 py-0.5 font-medium", LEVEL_TONE[l as string])}>{n} {l === "Sub Department" ? "sub-depts" : `${String(l).toLowerCase()}s`}</span>
          ))}
          <span className="surface-inset rounded-full px-2 py-0.5 font-semibold tabular-nums">{total === 1 && !roots.some((r) => ins.headcount[r]) ? 0 : total} people</span>
          <button type="button" onClick={() => setOpen((o) => (o.size >= allGroups.length ? new Set() : new Set(allGroups)))}
            className="surface-inset rounded-lg px-2 py-1 font-medium hover:border-primary/40">
            {open.size >= allGroups.length ? "Collapse all" : "Expand all"}
          </button>
          <button type="button" onClick={() => setShowEmpty((v) => !v)} aria-pressed={showEmpty}
            className={cn("rounded-lg px-2 py-1 font-medium", showEmpty ? "bg-primary text-primary-foreground" : "surface-inset hover:border-primary/40")}>
            Show empty
          </button>
        </div>
      </header>
      <div className="space-y-2 p-3">
        {divisions.length ? divisions.map((r) => <Division key={r} name={r} />) : <p className="py-6 text-center text-sm text-muted-foreground">No active employees yet.</p>}
      </div>
    </section>
  );
}

type Gender = { male: number; female: number; other: number };
interface TreeNode { name: string; department_name?: string; parent_department?: string; mm_level?: string; mm_urdu_name?: string; is_group?: number }

/** Per-department figures for the list and the insight cards: `headcount` etc. are rolled up the tree (a division
 * counts everyone below it); `direct` holds each department's own members only. */
function useDepartmentInsights(company?: string) {
  const co = useMemo(() => companyFilter(company), [company]);
  const active = useMemo(() => [...co, ["status", "=", "Active"]], [co]);
  const { data: heads } = useAggregate("Employee", { fields: ["department", count("name", "n")], filters: active, groupBy: "department" });
  const { data: genders } = useAggregate("Employee", { fields: ["department", "gender", count("name", "n")], filters: active, groupBy: "department, gender" });

  // Latest payroll month with submitted slips → gross pay per department for that month.
  const { data: latest } = useDocList("Salary Slip", {
    fields: ["start_date"],
    filters: [...co, ["docstatus", "=", 1]],
    orderBy: { field: "start_date", order: "desc" },
    limit: 1,
  });
  const payMonth = latest?.[0]?.start_date as string | undefined;
  const { data: pay } = useAggregate("Salary Slip", {
    fields: ["department", sum("base_gross_pay", "gross"), count("name", "n")],
    filters: [...co, ["docstatus", "=", 1], ["start_date", "=", payMonth ?? ""]],
    groupBy: "department",
    enabled: Boolean(payMonth),
  });

  const attFilters = useMemo(() => [...co, ["docstatus", "=", 1], ["attendance_date", ">=", startOfMonthISO()], ["attendance_date", "<=", todayISO()]], [co]);
  // Attendance.department is often blank (not fetched on older records) — attribute by the employee's current department.
  const { data: att } = useAggregate("Attendance", { fields: ["employee", "status", count("name", "n")], filters: attFilters, groupBy: "employee, status" });
  const { data: empDept } = useDocList("Employee", { fields: ["name", "department"], filters: active, limit: 20000 });
  // The department tree (Division → Department → Sub Department), to roll each figure up to its parents.
  const { data: depts } = useDocList("Department", {
    fields: ["name", "department_name", "parent_department", "mm_level", "mm_urdu_name", "is_group"],
    filters: co, orderBy: { field: "lft", order: "asc" }, limit: 5000,
  });

  return useMemo(() => {
    const headcount: Record<string, number> = {};
    (heads ?? []).forEach((r) => (headcount[r.department ?? ""] = asNumber(r.n)));
    const gender: Record<string, { male: number; female: number; other: number }> = {};
    (genders ?? []).forEach((r) => {
      const g = (gender[r.department ?? ""] ??= { male: 0, female: 0, other: 0 });
      if (r.gender === "Male") g.male += asNumber(r.n);
      else if (r.gender === "Female") g.female += asNumber(r.n);
      else g.other += asNumber(r.n);
    });
    const payroll: Record<string, number> = {};
    (pay ?? []).forEach((r) => (payroll[r.department ?? ""] = asNumber(r.gross)));
    const deptOf: Record<string, string> = Object.fromEntries((empDept ?? []).map((e) => [e.name, e.department ?? ""]));
    const attendance: Record<string, { present: number; total: number }> = {};
    (att ?? []).forEach((r) => {
      if (!(r.employee in deptOf)) return; // left / other company
      const a = (attendance[deptOf[r.employee]] ??= { present: 0, total: 0 });
      const n = asNumber(r.n);
      a.total += n;
      if (r.status === "Present" || r.status === "Work From Home") a.present += n;
      else if (r.status === "Half Day") a.present += n / 2;
    });

    // Roll up: a division's figures are its own plus everything in its departments and sub-departments.
    const nodes: Record<string, TreeNode> = Object.fromEntries((depts ?? []).map((d) => [d.name, d as TreeNode]));
    const children: Record<string, string[]> = {};
    (depts ?? []).forEach((d) => { if (d.parent_department) (children[d.parent_department] ??= []).push(d.name); });
    const rolled = { headcount: {} as Record<string, number>, gender: {} as Record<string, Gender>, payroll: {} as Record<string, number>,
      attendance: {} as Record<string, { present: number; total: number }> };
    const roll = (n: string): void => {
      if (n in rolled.headcount) return;
      let h = headcount[n] ?? 0, p = payroll[n] ?? 0;
      const g = { ...(gender[n] ?? { male: 0, female: 0, other: 0 }) };
      const a = { ...(attendance[n] ?? { present: 0, total: 0 }) };
      for (const c of children[n] ?? []) {
        roll(c);
        h += rolled.headcount[c]; p += rolled.payroll[c];
        g.male += rolled.gender[c].male; g.female += rolled.gender[c].female; g.other += rolled.gender[c].other;
        a.present += rolled.attendance[c].present; a.total += rolled.attendance[c].total;
      }
      rolled.headcount[n] = h; rolled.payroll[n] = p; rolled.gender[n] = g; rolled.attendance[n] = a;
    };
    Object.keys(nodes).forEach(roll);
    const roots = (depts ?? []).filter((d) => !d.parent_department || !nodes[d.parent_department] || d.parent_department === "All Departments")
      .map((d) => d.name).filter((n) => n !== "All Departments");
    return {
      ...rolled,
      direct: { headcount, gender, payroll, attendance },
      tree: { nodes, children, roots },
      payMonth,
    };
  }, [heads, genders, pay, att, empDept, depts, payMonth]);
}

export default function DepartmentsPage() {
  const { company, companyCurrency } = useCompanyContext();
  const navigate = useNavigate();
  const ins = useDepartmentInsights(company);
  const currency = companyCurrency ?? "PKR";

  const insights = useMemo(() => {
    const payRows = Object.entries(ins.direct.payroll).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const attRows = Object.entries(ins.direct.attendance)
      .filter(([, a]) => a.total > 0)
      .map(([d, a]) => ({ d, rate: (a.present / a.total) * 100, total: a.total }))
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 8);
    const anyHeads = Object.values(ins.direct.headcount).some((n) => n > 0);
    if (!anyHeads && !payRows.length && !attRows.length) {
      return (
        <div className="flex items-center gap-3 surface rounded-2xl border-dashed px-4 py-3 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          Headcount, gender, attendance and payroll insights appear here once employees are assigned to departments.
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <HeadcountTree ins={ins} onOpen={(n) => navigate(`/hr/employees?department=${encodeURIComponent(n)}`)} />
        {(payRows.length > 0 || attRows.length > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Payroll cost by sub-department" description={ins.payMonth ? `Gross pay, payroll month of ${formatDate(ins.payMonth, { month: "long", year: "numeric", day: undefined })}` : "No submitted salary slips yet"}>
              <BarList
                rows={payRows.map(([d, v]) => ({ label: d ? label(d) : "Not set", value: v, hint: ins.direct.headcount[d] ? `${formatMoney(v / ins.direct.headcount[d], currency, { compact: true })} per head` : undefined }))}
                format={(v) => formatMoney(v, currency, { compact: true })}
                tone="bg-indigo-500"
                empty="No payroll processed yet."
              />
            </SectionCard>
            <SectionCard title="Attendance this month" description="Lowest attendance rate first — present ÷ marked days, half days count ½">
              <BarList
                rows={attRows.map((r) => ({ label: r.d ? label(r.d) : "Not set", value: Math.round(r.rate * 10) / 10, hint: `${r.total} attendance records` }))}
                format={(v) => `${v}%`}
                tone="bg-emerald-500"
                empty="No attendance marked this month."
              />
            </SectionCard>
          </div>
        )}
      </div>
    );
  }, [ins, currency, navigate]);

  const columns: ColumnDef<DepartmentRow>[] = useMemo(
    () => [
      { key: "mm_urdu_name", label: "Urdu", getValue: (r) => r.mm_urdu_name ?? "", render: (r) => <span className="urdu text-sm">{r.mm_urdu_name || "—"}</span> },
      { key: "mm_level", label: "Level", getValue: (r) => r.mm_level ?? "" },
      { key: "parent_department", label: "Parent", getValue: (r) => (r.parent_department ? label(r.parent_department) : "") },
      { key: "headcount", label: "Headcount", align: "right", getValue: (r) => ins.headcount[r.name] ?? 0, render: (r) => <span className="text-sm font-medium tabular-nums">{ins.headcount[r.name] ?? 0}</span> },
      {
        key: "gender",
        label: "M / F",
        align: "right",
        getValue: (r) => `${ins.gender[r.name]?.male ?? 0} / ${ins.gender[r.name]?.female ?? 0}`,
        render: (r) => <span className="text-sm tabular-nums text-muted-foreground">{ins.gender[r.name]?.male ?? 0} / {ins.gender[r.name]?.female ?? 0}</span>,
      },
      {
        key: "attendance",
        label: "Attendance (month)",
        align: "right",
        getValue: (r) => {
          const a = ins.attendance[r.name];
          return a?.total ? Math.round((a.present / a.total) * 100) : null;
        },
        render: (r) => {
          const a = ins.attendance[r.name];
          if (!a?.total) return <span className="text-sm text-muted-foreground">—</span>;
          const pct = Math.round((a.present / a.total) * 100);
          return <span className={`text-sm font-medium tabular-nums ${pct < 80 ? "text-rose-600" : pct < 90 ? "text-amber-600" : "text-emerald-600"}`}>{pct}%</span>;
        },
      },
      {
        key: "payroll",
        label: "Gross pay (last run)",
        align: "right",
        getValue: (r) => ins.payroll[r.name] ?? 0,
        render: (r) => <span className="text-sm tabular-nums">{ins.payroll[r.name] ? formatMoney(ins.payroll[r.name], currency) : "—"}</span>,
      },
      { key: "disabled", label: "Status", render: (r) => <span className={`text-xs font-medium ${r.disabled ? "text-muted-foreground" : "text-emerald-600"}`}>{r.disabled ? "Disabled" : "Active"}</span> },
    ],
    [ins, currency],
  );

  const config: CrmManagementConfig<DepartmentRow> = useMemo(
    () => ({
      title: "Departments",
      subtitle: "Organizational departments — headcount, attendance and payroll cost at a glance",
      icon: <Building2 className="h-5 w-5" />,
      doctype: "Department",
      fields: ["name", "department_name", "mm_urdu_name", "mm_code", "mm_level", "parent_department", "company", "is_group", "disabled"],
      filters: companyFilter(company),
      formFields: [
        { fieldname: "department_name", label: "Department Name", fieldtype: "Data", reqd: true },
        { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
        { fieldname: "parent_department", label: "Parent Department", fieldtype: "Link", options: "Department" },
        { fieldname: "is_group", label: "Is Group", fieldtype: "Check" },
        { fieldname: "disabled", label: "Disabled", fieldtype: "Check" },
      ],
      defaults: { company },
      kanbanField: "parent_department",
      searchField: "department_name",
      statusField: "mm_level",
      statusOptions: ["Division", "Department", "Sub Department"],
      columns,
      exportFilename: "departments",
      insights,
      stats: (rows) => {
        const sized = rows.map((r) => ({ r, n: ins.direct.headcount[r.name] ?? 0 }));
        const largest = [...sized].sort((a, b) => b.n - a.n)[0];
        const staffed = sized.filter((x) => x.n > 0);
        const totalHeads = staffed.reduce((s, x) => s + x.n, 0);
        const totalPay = rows.reduce((s, r) => s + (ins.direct.payroll[r.name] ?? 0), 0);
        return [
          countStat(rows, { label: "Departments", icon: <Building2 className="h-4 w-4" />, tone: "sky", clear: true }),
          { label: "Active employees", value: totalHeads, icon: <Users2 className="h-4 w-4" />, tone: "emerald", valueSuffix: staffed.length ? `avg ${Math.round(totalHeads / staffed.length)} / sub-dept` : undefined },
          { label: "Largest", value: largest?.n ? label(largest.r.department_name || largest.r.name) : "—", icon: <Crown className="h-4 w-4" />, tone: "amber", valueSuffix: largest?.n ? `${largest.n}` : undefined },
          { label: "Payroll (last run)", value: compactNumber(totalPay), icon: <Banknote className="h-4 w-4" />, tone: "indigo" },
          countStat(rows, { label: "No employees", icon: <CircleSlash className="h-4 w-4" />, tone: "rose", predicate: (r) => !(ins.headcount[r.name] ?? 0) }),
        ];
      },
      rowName: (r) => r.department_name || r.name,
      rowSubtitle: (r) => `${ins.headcount[r.name] ?? 0} active employees${r.parent_department ? ` · under ${label(r.parent_department)}` : ""}`,
      onOpen: (r) => navigate(`/hr/employees?department=${encodeURIComponent(r.name)}`),
      renderGridCard: (r, actions) => <DepartmentCard row={r} ins={ins} currency={currency} actions={actions} />,
      onCreate: () => navigate("/hr/departments/new"),
      onEdit: (r) => navigate(`/hr/departments/${encodeURIComponent(r.name)}`),
      defaultView: "grid",
      // Tree order: each division, then its departments and sub-departments.
      orderBy: { field: "lft", order: "asc" },
      statusAllLabel: "All levels",
      kanbanLabel: "By parent",
      emptyTitle: "No departments",
      emptyDescription: "Add your first department",
      newLabel: "New Department",
    }),
    [company, columns, insights, ins, navigate, currency],
  );

  return <CrmManagementPage config={config} />;
}
