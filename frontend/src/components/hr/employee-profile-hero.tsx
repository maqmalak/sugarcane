import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRightLeft, Briefcase, Building2, Cake, CalendarCheck, CalendarOff, Clock3, DoorOpen, GitBranch, Mail, MessageCircle, Phone, Trash2,
  TrendingUp, UserRound, Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/status-badge";
import { EmployeePhoto } from "@/components/hr/employee-photo";
import { whatsappUrl } from "@/utils/whatsapp";
import { useAggregate, useDocList, count, sum } from "@/hooks/useDoc";
import { formatDate, startOfMonthISO, todayISO } from "@/utils/dates";
import { formatMoney } from "@/utils/currency";
import { asNumber, cn } from "@/utils/cn";

/** Whole years + months between an ISO date and today, e.g. "3 y 4 m". */
export function tenure(from?: string): string {
  if (!from) return "—";
  const a = new Date(from);
  const b = new Date();
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  if (months < 0) return "—";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y ? `${y} y ${m} m` : `${m} m`;
}

function age(dob?: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a -= 1;
  return a;
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      <span className="shrink-0 text-muted-foreground/70">{icon}</span>
      <span className="truncate">{children}</span>
    </span>
  );
}

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 surface-inset rounded-lg px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-base font-semibold tabular-nums">{value}</p>
      {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Header card of the employee page: photo (click to change), name, role, contact, and a strip of live
 * figures — tenure, age, this month's attendance, leave taken this year and the latest net pay.
 */
export function EmployeeProfileHero({
  doc,
  displayName,
  onPhotoChange,
}: {
  doc: Record<string, any>;
  displayName: string;
  onPhotoChange: (url: string) => Promise<void>;
}) {
  const emp = doc.name as string;
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const monthFilters = useMemo(
    () => [["employee", "=", emp], ["docstatus", "=", 1], ["attendance_date", ">=", startOfMonthISO()], ["attendance_date", "<=", todayISO()]],
    [emp],
  );
  const { data: att } = useAggregate("Attendance", { fields: ["status", count("name", "n")], filters: monthFilters, groupBy: "status" });
  const { data: leaves } = useAggregate("Leave Application", {
    fields: [sum("total_leave_days", "days")],
    filters: [["employee", "=", emp], ["docstatus", "=", 1], ["from_date", ">=", yearStart]],
  });
  const { data: slip } = useDocList("Salary Slip", {
    fields: ["name", "net_pay", "currency", "end_date"],
    filters: [["employee", "=", emp], ["docstatus", "=", 1]],
    orderBy: { field: "end_date", order: "desc" },
    limit: 1,
  });

  const attBy: Record<string, number> = Object.fromEntries((att ?? []).map((r) => [r.status, asNumber(r.n)]));
  const present = (attBy["Present"] ?? 0) + (attBy["Work From Home"] ?? 0) + (attBy["Half Day"] ?? 0) / 2;
  const marked = Object.values(attBy).reduce((a, b) => a + b, 0);
  const last = slip?.[0];
  const years = age(doc.date_of_birth);

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-primary/30 via-sky-500/20 to-violet-500/25" />
      <div className="pointer-events-none absolute right-6 top-3 hidden text-right sm:block">
        <p className="text-[11px] font-medium uppercase tracking-wider text-foreground/60">Service</p>
        <p className="text-2xl font-bold tabular-nums text-foreground/80">{tenure(doc.date_of_joining)}</p>
      </div>
      <div className="relative flex flex-col gap-5 p-5 pt-8 lg:flex-row lg:items-end">
        <div className="flex items-end gap-4">
          <div className="relative">
            <EmployeePhoto name={displayName} src={doc.image} docname={emp} size="lg" passport onChange={onPhotoChange}
              caption={[doc.designation, doc.employee_number, doc.employee_cnic && `CNIC ${doc.employee_cnic}`].filter(Boolean).join(" · ")} />
            {doc.image && (
              <button
                type="button"
                onClick={() => void onPhotoChange("")}
                title="Remove photo"
                className="absolute -right-1 bottom-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="min-w-0 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold">{displayName}</h2>
              <StatusBadge status={doc.status} />
            </div>
            {doc.mm_urdu_name && <p className="urdu text-left text-lg leading-[2.1] text-foreground/80" dir="rtl">{doc.mm_urdu_name}</p>}
            <p className="text-sm text-muted-foreground">
              {doc.designation || "No designation"} · <span className="font-mono text-xs">{emp}</span>
              {doc.employee_number && <> · <span className="font-mono text-xs">{doc.employee_number}</span></>}
              {doc.employee_cnic && <> · CNIC <span className="font-mono text-xs">{doc.employee_cnic}</span></>}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Hover the photo to upload or change it</p>
          </div>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-2 lg:pb-1">
          {doc.department && <Fact icon={<Building2 className="h-3.5 w-3.5" />}>{doc.department}</Fact>}
          {doc.branch && <Fact icon={<GitBranch className="h-3.5 w-3.5" />}>{doc.branch}</Fact>}
          {doc.cell_number && (
            <Fact icon={<Phone className="h-3.5 w-3.5" />}>
              <a href={`tel:${doc.cell_number}`} className="hover:text-foreground hover:underline">{doc.cell_number}</a>
            </Fact>
          )}
          {(doc.company_email || doc.personal_email) && (
            <Fact icon={<Mail className="h-3.5 w-3.5" />}>
              <a href={`mailto:${doc.company_email || doc.personal_email}`} className="hover:text-foreground hover:underline">
                {doc.company_email || doc.personal_email}
              </a>
            </Fact>
          )}
          {doc.reports_to && (
            <Fact icon={<UserRound className="h-3.5 w-3.5" />}>
              Reports to{" "}
              <Link to={`/hr/employees/${encodeURIComponent(doc.reports_to)}`} className="hover:text-foreground hover:underline">
                {doc.reports_to}
              </Link>
            </Fact>
          )}
          {doc.employment_type && <Fact icon={<Briefcase className="h-3.5 w-3.5" />}>{doc.employment_type}</Fact>}
        </div>
      </div>

      <div className="relative flex flex-wrap items-center gap-2 border-t border-border/60 px-5 py-3">
        {[
          // each link has its own colour: gradient icon tile + tinted chip (classes written out so Tailwind keeps them)
          { label: "Apply leave", to: `/hr/leave-applications?employee=${encodeURIComponent(emp)}`, icon: CalendarOff,
            tile: "from-amber-400 to-orange-500 shadow-orange-500/30", chip: "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:border-amber-500/60 hover:bg-amber-500/15 dark:text-amber-300" },
          { label: "Attendance", to: `/hr/attendance?employee=${encodeURIComponent(emp)}`, icon: CalendarCheck,
            tile: "from-sky-400 to-blue-600 shadow-blue-500/30", chip: "border-sky-500/30 bg-sky-500/10 text-sky-700 hover:border-sky-500/60 hover:bg-sky-500/15 dark:text-sky-300" },
          { label: "Assign shift", to: `/hr/shift-assignments/new?employee=${encodeURIComponent(emp)}`, icon: Clock3,
            tile: "from-indigo-400 to-violet-600 shadow-violet-500/30", chip: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 hover:border-indigo-500/60 hover:bg-indigo-500/15 dark:text-indigo-300" },
          { label: "Salary slips", to: `/payroll/salary-slips?employee=${encodeURIComponent(emp)}`, icon: Wallet,
            tile: "from-emerald-400 to-teal-600 shadow-emerald-500/30", chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/60 hover:bg-emerald-500/15 dark:text-emerald-300" },
          { label: "Promote", to: `/hr/promotions/new?employee=${encodeURIComponent(emp)}`, icon: TrendingUp,
            tile: "from-lime-400 to-green-600 shadow-green-500/30", chip: "border-lime-500/30 bg-lime-500/10 text-lime-700 hover:border-lime-500/60 hover:bg-lime-500/15 dark:text-lime-300" },
          { label: "Transfer", to: `/hr/transfers/new?employee=${encodeURIComponent(emp)}`, icon: ArrowRightLeft,
            tile: "from-cyan-400 to-sky-600 shadow-cyan-500/30", chip: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 hover:border-cyan-500/60 hover:bg-cyan-500/15 dark:text-cyan-300" },
          { label: "Separation", to: `/hr/separations/new?employee=${encodeURIComponent(emp)}`, icon: DoorOpen,
            tile: "from-rose-400 to-red-600 shadow-rose-500/30", chip: "border-rose-500/30 bg-rose-500/10 text-rose-700 hover:border-rose-500/60 hover:bg-rose-500/15 dark:text-rose-300" },
        ].map((a) => (
          <Link key={a.label} to={a.to}
            className={cn("group inline-flex h-9 items-center gap-2 rounded-xl border py-1 pl-1 pr-3 text-xs font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md", a.chip)}>
            <span className={cn("relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-b text-white shadow-md ring-1 ring-inset ring-white/25", a.tile)}>
              <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-white/0" />
              <a.icon className="relative h-3.5 w-3.5" />
            </span>
            {a.label}
          </Link>
        ))}
        <span className="ml-auto flex gap-1.5">
          {doc.cell_number && (
            <>
              <a href={`tel:${doc.cell_number}`} title="Call" className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-600 transition hover:-translate-y-0.5 hover:bg-sky-500/20 dark:text-sky-300"><Phone className="h-3.5 w-3.5" /></a>
              {whatsappUrl(doc.cell_number) && (
                <a href={whatsappUrl(doc.cell_number)!} target="_blank" rel="noreferrer" title="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 transition hover:-translate-y-0.5 hover:bg-emerald-500/20 dark:text-emerald-300"><MessageCircle className="h-3.5 w-3.5" /></a>
              )}
            </>
          )}
          {(doc.company_email || doc.personal_email) && (
            <a href={`mailto:${doc.company_email || doc.personal_email}`} title="Email" className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-600 transition hover:-translate-y-0.5 hover:bg-violet-500/20 dark:text-violet-300"><Mail className="h-3.5 w-3.5" /></a>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border/60 bg-muted/20 p-4 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Tenure" value={tenure(doc.date_of_joining)} hint={`Joined ${formatDate(doc.date_of_joining)}`} />
        <Metric
          label="Age"
          value={years !== null ? `${years} y` : "—"}
          hint={doc.date_of_birth ? <span className="inline-flex items-center gap-1"><Cake className="h-3 w-3" /> {formatDate(doc.date_of_birth, { day: "numeric", month: "short", year: undefined })}</span> : undefined}
        />
        <Metric
          label="Attendance (month)"
          value={marked ? `${Math.round((present / marked) * 100)} %` : "—"}
          hint={<span className="inline-flex items-center gap-1"><CalendarCheck className="h-3 w-3" /> {present} of {marked} days present</span>}
        />
        <Metric label="Leave taken (year)" value={`${asNumber(leaves?.[0]?.days)} d`} hint="Approved applications" />
        <Metric
          label="Last net pay"
          value={last ? formatMoney(asNumber(last.net_pay), last.currency) : "—"}
          hint={
            last ? (
              <Link to={`/payroll/salary-slips/${encodeURIComponent(last.name)}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                <Wallet className="h-3 w-3" /> {formatDate(last.end_date)}
              </Link>
            ) : (
              "No salary slip yet"
            )
          }
        />
      </div>
    </Card>
  );
}
