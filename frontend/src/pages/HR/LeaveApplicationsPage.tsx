import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  CalendarOff, CalendarPlus2, CheckCircle2, Clock, ExternalLink, FileText, Loader2, Plane, Plus, Scale, Users2, XCircle,
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
import { EmployeePhoto } from "@/components/hr/employee-photo";
import { HrFilterBar, NameSelect, usePeriod, useHrDimensions } from "@/components/hr/period-filter";
import { useHrInsights, useDebounced } from "@/hooks/useHrInsights";
import { useDocMutations } from "@/hooks/useDoc";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useEmployeeQueryFilter } from "@/hooks/useEmployeeQueryFilter";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError, postCall } from "@/services/frappe";
import { formatDate, todayISO } from "@/utils/dates";
import { asNumber, cn } from "@/utils/cn";

interface Person { employee: string; employee_name: string; department?: string; designation?: string; image?: string }
interface Pending extends Person { name: string; leave_type: string; from_date: string; to_date: string; total_leave_days: number; posting_date: string }
interface Overview {
  by_status: Record<string, { count: number; days: number }>;
  by_type: { leave_type: string; applications: number; days: number; employees: number }[];
  by_department: { department: string; days: number; employees: number }[];
  top_takers: (Person & { applications: number; days: number })[];
  daily: { date: string; away: number }[];
  allocations: { leave_type: string; allocated: number; employees: number }[];
  pending: Pending[];
  headcount: number | null;
}
interface Rec extends Person {
  name: string; leave_type: string; from_date: string; to_date: string; total_leave_days: number; half_day?: number; status: string;
  docstatus: number; posting_date: string; description?: string; leave_approver?: string; branch?: string;
}

const STATUSES = ["Open", "Approved", "Rejected", "Cancelled"];
const TYPE_COLORS = ["hsl(199 89% 48%)", "hsl(38 92% 50%)", "hsl(262 83% 58%)", "hsl(160 84% 39%)", "hsl(330 81% 60%)", "hsl(215 16% 55%)"];
const strip = (d?: string) => (d ? d.replace(/ - [A-Z0-9]{2,6}$/, "").replace(/\s{2,}/g, " ") : "Not set");
const fmtDays = (n: number) => `${asNumber(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} d`;

const LEAVE_FIELDS: FormFieldMeta[] = [
  { fieldname: "employee", label: "Employee", fieldtype: "Link", options: "Employee", reqd: true },
  { fieldname: "leave_type", label: "Leave Type", fieldtype: "Link", options: "Leave Type", reqd: true },
  { fieldname: "from_date", label: "From Date", fieldtype: "Date", reqd: true },
  { fieldname: "to_date", label: "To Date", fieldtype: "Date", reqd: true },
  { fieldname: "cb", fieldtype: "Column Break" },
  { fieldname: "half_day", label: "Half Day", fieldtype: "Check" },
  { fieldname: "half_day_date", label: "Half Day Date", fieldtype: "Date" },
  { fieldname: "leave_approver", label: "Leave Approver", fieldtype: "Link", options: "User" },
  { fieldname: "posting_date", label: "Posting Date", fieldtype: "Date", reqd: true },
  { fieldname: "sb", fieldtype: "Section Break" },
  { fieldname: "description", label: "Reason", fieldtype: "Text" },
];

/** New leave application, saved as an Open draft for the approver. */
function LeaveDialog({ open, onClose, onDone, company, employee }: { open: boolean; onClose: () => void; onDone: () => void; company?: string; employee?: string | null }) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const { createDoc } = useDocMutations("Leave Application");
  if (open && !seeded) {
    setSeeded(true);
    setValues({ posting_date: todayISO(), from_date: todayISO(), to_date: todayISO(), status: "Open", employee: employee ?? undefined });
  }
  if (!open && seeded) setSeeded(false);
  const fields = LEAVE_FIELDS.filter((f) => f.fieldname !== "half_day_date" || values.half_day);

  const save = async () => {
    const missing = fields.filter((f) => f.reqd && !values[f.fieldname]).map((f) => f.label);
    if (missing.length) return toast.error(`Fill in: ${missing.join(", ")}`);
    if (values.to_date < values.from_date) return toast.error("To Date can't be before From Date.");
    setSaving(true);
    try {
      await createDoc({ ...values, company, status: "Open" });
      toast.success("Leave application created");
      notifyDataChanged();
      onDone();
      onClose();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  };

  const days = values.from_date && values.to_date ? Math.max(0, (new Date(values.to_date).getTime() - new Date(values.from_date).getTime()) / 86400000 + 1) : 0;
  return (
    <Dialog open={open} onClose={onClose} title="New Leave Application" description="Saved as Open — the approver approves or rejects it." size="lg">
      <FrappeForm fields={fields} values={values} onChange={(f, v) => setValues((s) => ({ ...s, [f]: v }))} />
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{days ? `${values.half_day ? days - 0.5 : days} calendar day${days === 1 ? "" : "s"} (holidays are excluded on save)` : ""}</span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>Create</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Approve / reject = set the status, then submit (how ERPNext closes a leave application). */
function useDecide(onDone: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const { submitDoc } = useDocMutations("Leave Application");
  const decide = async (name: string, status: "Approved" | "Rejected") => {
    setBusy(`${name}:${status}`);
    try {
      await postCall("frappe.client.set_value", { doctype: "Leave Application", name, fieldname: "status", value: status });
      await submitDoc(name);
      toast.success(`Leave ${status.toLowerCase()}`);
      notifyDataChanged();
      onDone();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(null);
    }
  };
  return { busy, decide };
}

function DecideButtons({ name, busy, decide }: { name: string; busy: string | null; decide: (n: string, s: "Approved" | "Rejected") => void }) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        disabled={!!busy}
        onClick={(e) => {
          e.stopPropagation();
          decide(name, "Approved");
        }}
        title="Approve"
        className="flex h-7 items-center gap-1 rounded-md bg-emerald-500/10 px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
      >
        {busy === `${name}:Approved` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve
      </button>
      <button
        type="button"
        disabled={!!busy}
        onClick={(e) => {
          e.stopPropagation();
          decide(name, "Rejected");
        }}
        title="Reject"
        className="flex h-7 items-center gap-1 rounded-md bg-rose-500/10 px-2 text-xs font-medium text-rose-700 hover:bg-rose-500/20 disabled:opacity-50 dark:text-rose-400"
      >
        {busy === `${name}:Rejected` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} Reject
      </button>
    </div>
  );
}

export default function LeaveApplicationsPage() {
  const navigate = useNavigate();
  const { company } = useCompanyContext();
  const { employee } = useEmployeeQueryFilter();
  const period = usePeriod("month");
  const dims = useHrDimensions();
  const search = useDebounced(dims.search);
  const [leaveType, setLeaveType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "from_date", dir: "desc" });
  const [creating, setCreating] = useState(false);

  const filters = { from_date: period.from, to_date: period.to, company, department: dims.department, branch: dims.branch, employee, search, leave_type: leaveType };
  const { data: ov, isLoading: ovLoading, mutate: refreshOv } = useHrInsights<Overview>("leave_overview", filters);
  const { data: recs, isLoading, error, mutate } = useHrInsights<{ rows: Rec[]; total: number }>("leave_records", {
    ...filters,
    status,
    start: page * pageSize,
    page_length: pageSize,
    sort_by: sort.key,
    sort_order: sort.dir,
  });
  const filterKey = JSON.stringify({ ...filters, status });
  const [lastKey, setLastKey] = useState(filterKey);
  if (filterKey !== lastKey) {
    setLastKey(filterKey);
    setPage(0);
  }
  const refresh = () => {
    void mutate();
    void refreshOv();
  };
  const { busy, decide } = useDecide(refresh);

  const s = useMemo(() => {
    const st = ov?.by_status ?? {};
    const approved = st["Approved"] ?? { count: 0, days: 0 };
    const open = st["Open"] ?? { count: 0, days: 0 };
    const rejected = st["Rejected"] ?? { count: 0, days: 0 };
    const applications = Object.entries(st).filter(([k]) => k !== "Cancelled").reduce((a, [, v]) => a + v.count, 0);
    const today = todayISO();
    const awayToday = ov?.daily.find((d) => d.date === today)?.away;
    const peak = [...(ov?.daily ?? [])].sort((a, b) => b.away - a.away)[0];
    const takenByType: Record<string, number> = Object.fromEntries((ov?.by_type ?? []).map((t) => [t.leave_type, asNumber(t.days)]));
    const types = [...new Set([...(ov?.allocations ?? []).map((a) => a.leave_type), ...Object.keys(takenByType)])];
    const utilisation = types
      .map((t) => ({ type: t, allocated: asNumber(ov?.allocations.find((a) => a.leave_type === t)?.allocated), taken: takenByType[t] ?? 0 }))
      .sort((a, b) => b.allocated - a.allocated);
    return {
      approved, open, rejected, applications, awayToday, peak, utilisation,
      decided: approved.count + rejected.count,
      daily: (ov?.daily ?? []).map((d) => ({ ...d, label: formatDate(d.date, { day: "numeric", month: "short", year: undefined }) })),
      typeMix: (ov?.by_type ?? []).map((t, i) => ({ label: t.leave_type, value: asNumber(t.days), color: TYPE_COLORS[i % TYPE_COLORS.length] })),
    };
  }, [ov]);

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
            <p className="truncate text-xs text-muted-foreground">{[r.designation, strip(r.department)].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
      ),
    },
    { key: "leave_type", label: "Leave Type", sortable: true, render: (r) => <span className="text-sm">{r.leave_type}</span> },
    {
      key: "from_date",
      label: "Dates",
      sortable: true,
      render: (r) => (
        <div className="text-sm">
          {formatDate(r.from_date)}{r.to_date !== r.from_date ? ` – ${formatDate(r.to_date)}` : ""}
          <p className="text-xs text-muted-foreground">Posted {formatDate(r.posting_date)}</p>
        </div>
      ),
    },
    {
      key: "total_leave_days",
      label: "Days",
      align: "right",
      sortable: true,
      render: (r) => <span className="font-medium tabular-nums">{asNumber(r.total_leave_days)}{r.half_day ? <span className="ml-1 text-[10px] text-muted-foreground">½</span> : null}</span>,
    },
    { key: "status", label: "Status", sortable: true, render: (r) => (r.status === "Open" && r.docstatus === 0 ? <DecideButtons name={r.name} busy={busy} decide={(n, st) => void decide(n, st)} /> : <StatusBadge status={r.status} />), getValue: (r) => r.status },
    { key: "description", label: "Reason", render: (r) => <span className="line-clamp-2 max-w-xs text-xs text-muted-foreground">{r.description || "—"}</span> },
    { key: "leave_approver", label: "Approver", render: (r) => <span className="text-xs">{r.leave_approver || "—"}</span> },
  ];

  const tabs = [
    { value: "", label: "All", n: Object.values(ov?.by_status ?? {}).reduce((a, v) => a + v.count, 0) },
    ...STATUSES.map((x) => ({ value: x, label: x === "Open" ? "Pending" : x, n: ov?.by_status[x]?.count ?? 0 })),
  ].filter((t) => t.value === "" || t.n);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave"
        subtitle={`${period.label}${employee ? ` · ${employee}` : ""} — who is away, what is waiting for approval, and how leave is being used`}
        icon={<CalendarOff className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Link to="/hr/leave-allocations"><Button variant="outline" size="sm"><CalendarPlus2 className="h-4 w-4" /> Allocations</Button></Link>
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New Leave Application</Button>
          </div>
        }
      />

      <HrFilterBar period={period} dims={dims} company={company}>
        <NameSelect doctype="Leave Type" value={leaveType} onChange={setLeaveType} placeholder="All leave types" />
      </HrFilterBar>

      <KpiGrid
        items={[
          { label: "Applications", value: ovLoading && !ov ? "…" : s.applications.toLocaleString(), icon: <CalendarOff className="h-4 w-4" />, tone: "sky" },
          { label: "Approved days", value: Math.round(s.approved.days).toLocaleString(), icon: <CheckCircle2 className="h-4 w-4" />, tone: "emerald", valueSuffix: `${s.approved.count} apps` },
          { label: "Pending approval", value: s.open.count.toLocaleString(), icon: <Clock className="h-4 w-4" />, tone: s.open.count ? "amber" : "slate", valueSuffix: s.open.count ? fmtDays(s.open.days) : undefined },
          { label: "Rejection rate", value: `${s.decided ? ((s.rejected.count / s.decided) * 100).toFixed(1) : "0.0"}%`, icon: <XCircle className="h-4 w-4" />, tone: "rose", valueSuffix: `${s.rejected.count} rejected` },
          s.awayToday !== undefined
            ? { label: "Away today", value: s.awayToday.toLocaleString(), icon: <Plane className="h-4 w-4" />, tone: "indigo", valueSuffix: ov?.headcount ? `${((s.awayToday / ov.headcount) * 100).toFixed(1)}%` : undefined }
            : { label: "Peak day away", value: (s.peak?.away ?? 0).toLocaleString(), icon: <Plane className="h-4 w-4" />, tone: "indigo", valueSuffix: s.peak?.away ? formatDate(s.peak.date, { day: "numeric", month: "short", year: undefined }) : undefined },
          { label: "Avg per approval", value: s.approved.count ? fmtDays(s.approved.days / s.approved.count) : "—", icon: <Scale className="h-4 w-4" />, tone: "teal" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Who is away"
          subtitle={s.peak?.away ? `Employees on approved leave each day · peak ${s.peak.away} on ${formatDate(s.peak.date, { day: "numeric", month: "short", year: undefined })}` : "Employees on approved leave each day"}
          className="lg:col-span-2"
        >
          {s.daily.some((d) => d.away) ? (
            <BarChart data={s.daily} xKey="label" height={280} series={[{ key: "away", label: "On leave", color: "hsl(38 92% 50%)" }]} />
          ) : (
            <p className="py-20 text-center text-sm text-muted-foreground">No approved leave in this period.</p>
          )}
        </ChartCard>
        <ChartCard title="Leave by type" subtitle="Approved days">
          {s.typeMix.length ? <DonutChart data={s.typeMix} height={280} innerRadius="62%" /> : <p className="py-20 text-center text-sm text-muted-foreground">No approved leave in this period.</p>}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Waiting for approval"
          description={s.open.count ? `${s.open.count} open · earliest start first` : "Nothing pending"}
          actions={s.open.count ? <button type="button" onClick={() => setStatus("Open")} className="text-xs font-medium text-primary hover:underline">See all</button> : undefined}
        >
          <ul className="divide-y divide-border">
            {(ov?.pending ?? []).map((p) => (
              <li key={p.name} className="space-y-2 py-3">
                <div className="flex items-center gap-2.5">
                  <EmployeePhoto name={p.employee_name || p.employee} src={p.image} size="sm" editable={false} className="ring-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.employee_name || p.employee}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.leave_type} · {formatDate(p.from_date, { day: "numeric", month: "short", year: undefined })}{p.to_date !== p.from_date ? ` – ${formatDate(p.to_date, { day: "numeric", month: "short", year: undefined })}` : ""} · {fmtDays(p.total_leave_days)}
                    </p>
                  </div>
                </div>
                <div className="pl-[42px]"><DecideButtons name={p.name} busy={busy} decide={(n, st) => void decide(n, st)} /></div>
              </li>
            ))}
            {!(ov?.pending ?? []).length && (
              <li className="flex flex-col items-center gap-1 py-10 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" /> All caught up.
              </li>
            )}
          </ul>
        </SectionCard>

        <SectionCard title="Allocation vs taken" description="Leave allocated (allocations overlapping the period) against approved days in the period">
          {s.utilisation.length ? (
            <ul className="space-y-4">
              {s.utilisation.map((u, i) => {
                const share = u.allocated ? Math.min(100, (u.taken / u.allocated) * 100) : 100;
                return (
                  <li key={u.type} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2 truncate font-medium">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                        {u.type}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        <span className="font-semibold text-foreground">{fmtDays(u.taken)}</span> / {u.allocated ? fmtDays(u.allocated) : "not allocated"}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(2, share)}%`, background: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                    </div>
                    {!!u.allocated && <p className="text-[11px] text-muted-foreground">{share.toFixed(1)}% used · {fmtDays(Math.max(0, u.allocated - u.taken))} left</p>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No allocations or leave in this period.</p>
          )}
        </SectionCard>

        <SectionCard title="Most leave taken" description="Approved days in the period">
          <ul className="divide-y divide-border">
            {(ov?.top_takers ?? []).slice(0, 7).map((p) => (
              <li key={p.employee} className="flex items-center gap-2.5 py-2">
                <EmployeePhoto name={p.employee_name || p.employee} src={p.image} size="sm" editable={false} className="ring-0" />
                <div className="min-w-0 flex-1">
                  <Link to={`/hr/employees/${encodeURIComponent(p.employee)}`} className="block truncate text-sm font-medium hover:text-primary hover:underline">{p.employee_name || p.employee}</Link>
                  <p className="truncate text-xs text-muted-foreground">{strip(p.department)} · {p.applications} application{p.applications === 1 ? "" : "s"}</p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">{fmtDays(p.days)}</span>
              </li>
            ))}
            {!(ov?.top_takers ?? []).length && <li className="py-10 text-center text-sm text-muted-foreground">No approved leave in this period.</li>}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Leave by department" description="Approved days and employees who took leave — click to filter">
        {(ov?.by_department ?? []).length ? (
          <div className="grid gap-x-8 md:grid-cols-2">
            {[0, 1].map((col) => {
              const list = (ov?.by_department ?? []).slice(0, 12);
              const half = Math.ceil(list.length / 2);
              return (
                <div key={col}>
                  <BarList
                    rows={list.slice(col * half, (col + 1) * half).map((d) => ({
                      label: strip(d.department),
                      value: asNumber(d.days),
                      hint: (
                        <button type="button" onClick={() => d.department && dims.setDepartment(d.department)} className="inline-flex items-center gap-1 hover:text-primary">
                          <Users2 className="h-3 w-3" /> {d.employees} employees · filter
                        </button>
                      ),
                    }))}
                    format={(v) => fmtDays(v)}
                    tone="bg-amber-500"
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No approved leave in this period.</p>
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
              <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", t.value === "Open" && t.n ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground")}>
                {(t.n ?? 0).toLocaleString()}
              </span>
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
            title="Applications"
            subtitle={`${(recs?.total ?? 0).toLocaleString()} applications overlapping ${period.label}`}
            exportFilename={`leave-${period.from}-to-${period.to}`}
            printTitle="Leave Applications"
            printSubtitle={period.label}
            pageSizeOptions={[25, 50, 100, 200]}
            rowActions={(r) => [
              ...(r.status === "Open" && r.docstatus === 0
                ? [
                    { label: "Approve", icon: <CheckCircle2 className="h-4 w-4" />, onClick: () => void decide(r.name, "Approved") },
                    { label: "Reject", icon: <XCircle className="h-4 w-4" />, onClick: () => void decide(r.name, "Rejected"), destructive: true },
                  ]
                : []),
              { label: "Open", icon: <FileText className="h-4 w-4" />, onClick: () => navigate(`/hr/leave-applications/${encodeURIComponent(r.name)}`) },
              { label: "Open in ERPNext", icon: <ExternalLink className="h-4 w-4" />, onClick: () => window.open(`/desk/leave-application/${encodeURIComponent(r.name)}`, "_blank") },
            ]}
            emptyTitle="No leave applications"
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

      <LeaveDialog open={creating} onClose={() => setCreating(false)} onDone={refresh} company={company} employee={employee} />
    </div>
  );
}
