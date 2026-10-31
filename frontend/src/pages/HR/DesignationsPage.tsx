import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Banknote, CircleSlash, IdCard, Pencil, Trash2, Trophy, Users2 } from "lucide-react";
import { CrmManagementPage, countStat, type CrmCardActions, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import type { ColumnDef } from "@/components/tables/data-table";
import { ICON_GRADIENT } from "@/components/ui/app-icon";
import { useAggregate, count, avg } from "@/hooks/useDoc";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { formatMoney, compactNumber } from "@/utils/currency";
import { asNumber, cn } from "@/utils/cn";
import { designationLook } from "./designation-look";

interface DesignationRow {
  name: string;
  designation_name?: string;
  mm_urdu_name?: string;
  mm_abbr?: string;
  description?: string;
}

interface DesigStats { people: number; avgBasic: number; departments: number }

/** Active employees per designation: headcount, average basic salary and how many departments use it. */
function useDesignationStats(company?: string) {
  const filters = useMemo(() => [...companyFilter(company), ["status", "=", "Active"]], [company]);
  const { data } = useAggregate("Employee", {
    fields: ["designation", count("name", "n"), avg("mm_basic_salary", "basic")],
    filters,
    groupBy: "designation",
  });
  // Frappe's query API has no COUNT(DISTINCT …): one row per designation × department, counted here.
  const { data: pairs } = useAggregate("Employee", { fields: ["designation", "department", count("name", "n")], filters, groupBy: "designation, department" });
  return useMemo(() => {
    const depts: Record<string, number> = {};
    (pairs ?? []).forEach((r) => {
      const k = String(r.designation ?? "").toLowerCase();
      if (r.department) depts[k] = (depts[k] ?? 0) + 1;
    });
    const by: Record<string, DesigStats> = {};
    (data ?? []).forEach((r) => {
      const k = String(r.designation ?? "").toLowerCase();
      by[k] = { people: asNumber(r.n), avgBasic: asNumber(r.basic), departments: depts[k] ?? 0 };
    });
    return by;
  }, [data, pairs]);
}

const statsFor = (by: Record<string, DesigStats>, r: DesignationRow) => by[r.name.toLowerCase()] ?? { people: 0, avgBasic: 0, departments: 0 };

/** Cards view: one card per designation — people, average basic salary, departments — with edit / delete. */
function DesignationCard({ row, st, currency, actions }: { row: DesignationRow; st: DesigStats; currency: string; actions: CrmCardActions }) {
  const title = row.designation_name || row.name;
  const { icon: Icon, hue } = designationLook(title);
  const gradient = ICON_GRADIENT[hue] ?? ICON_GRADIENT.blue;
  return (
    <article className="surface surface-hover group relative flex h-full flex-col overflow-hidden rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl">
      <div aria-hidden className={cn("pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-gradient-to-br opacity-25 blur-2xl dark:opacity-30", gradient)} />
      <div className="relative flex items-start gap-3 p-4 pb-3">
        <span className={cn("relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b text-white shadow-lg ring-1 ring-inset ring-white/25", gradient)}>
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-white/0" />
          <Icon className="relative h-6 w-6 drop-shadow-sm" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-tight" title={title}>{title}</h3>
          {row.mm_urdu_name && <p className="urdu truncate text-sm leading-[1.9] text-muted-foreground" dir="rtl" style={{ textAlign: "left" }}>{row.mm_urdu_name}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {row.mm_abbr && <span className="surface-inset rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold">{row.mm_abbr}</span>}
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              st.people ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", st.people ? "bg-emerald-500" : "bg-muted-foreground")} />
              {st.people ? "In use" : "Not used"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button type="button" onClick={actions.edit} title="Edit" aria-label={`Edit ${title}`}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={actions.remove} title="Delete" aria-label={`Delete ${title}`}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <dl className="surface-inset relative mx-4 grid grid-cols-3 divide-x divide-border rounded-xl text-center dark:divide-white/10">
        <div className="px-2 py-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">People</dt>
          <dd className="text-lg font-semibold tabular-nums">{st.people}</dd>
        </div>
        <div className="px-2 py-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Avg basic</dt>
          <dd className="truncate text-lg font-semibold tabular-nums" title={st.avgBasic ? formatMoney(st.avgBasic, currency) : undefined}>
            {st.avgBasic ? formatMoney(st.avgBasic, currency, { compact: true }) : "—"}
          </dd>
        </div>
        <div className="px-2 py-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Departments</dt>
          <dd className="text-lg font-semibold tabular-nums">{st.departments || "—"}</dd>
        </div>
      </dl>

      {row.description && <p className="relative mx-4 mt-3 line-clamp-2 text-xs text-muted-foreground">{row.description}</p>}

      <div className="relative mt-4 flex items-center justify-between border-t border-border px-4 py-2.5 dark:border-white/10 dark:bg-black/10 mt-auto">
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Users2 className="h-3.5 w-3.5" /> {st.people} active</span>
        {actions.open && (
          <button type="button" onClick={actions.open} className="inline-flex items-center gap-1 text-xs font-medium text-primary transition hover:gap-1.5">
            Employees <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}

export default function DesignationsPage() {
  const { company, companyCurrency } = useCompanyContext();
  const navigate = useNavigate();
  const by = useDesignationStats(company);
  const currency = companyCurrency ?? "PKR";

  const columns: ColumnDef<DesignationRow>[] = useMemo(() => [
    { key: "mm_urdu_name", label: "Urdu", getValue: (r) => r.mm_urdu_name ?? "", render: (r) => <span className="urdu text-sm">{r.mm_urdu_name || "—"}</span> },
    { key: "mm_abbr", label: "Abbr", getValue: (r) => r.mm_abbr ?? "" },
    { key: "people", label: "People", align: "right", getValue: (r) => statsFor(by, r).people },
    { key: "avg_basic", label: "Avg basic", align: "right", getValue: (r) => statsFor(by, r).avgBasic,
      render: (r) => <span className="text-sm tabular-nums">{statsFor(by, r).avgBasic ? formatMoney(statsFor(by, r).avgBasic, currency) : "—"}</span> },
    { key: "departments", label: "Departments", align: "right", getValue: (r) => statsFor(by, r).departments },
  ], [by, currency]);

  const config: CrmManagementConfig<DesignationRow> = useMemo(() => ({
    title: "Designations",
    subtitle: "Job titles across the mill — headcount, pay and where each one works",
    icon: <IdCard className="h-5 w-5" />,
    doctype: "Designation",
    fields: ["name", "designation_name", "mm_urdu_name", "mm_abbr", "description"],
    formFields: [{ fieldname: "designation_name", label: "Designation Name", fieldtype: "Data", reqd: true }],
    kanbanField: "mm_abbr",
    hideKanban: true,
    orderBy: { field: "designation_name", order: "asc" },
    searchField: "designation_name",
    statusField: "mm_abbr",
    statusAllLabel: "All abbreviations",
    columns,
    exportFilename: "designations",
    stats: (rows) => {
      const used = rows.filter((r) => statsFor(by, r).people > 0);
      const top = [...rows].sort((a, b) => statsFor(by, b).people - statsFor(by, a).people)[0];
      const staff = used.reduce((n, r) => n + statsFor(by, r).people, 0);
      const pay = used.reduce((n, r) => n + statsFor(by, r).avgBasic * statsFor(by, r).people, 0);
      return [
        countStat(rows, { label: "Designations", icon: <IdCard className="h-4 w-4" />, tone: "sky", clear: true }),
        countStat(rows, { label: "In use", icon: <Users2 className="h-4 w-4" />, tone: "emerald", predicate: (r) => statsFor(by, r).people > 0, valueSuffix: `${staff} people` }),
        { label: "Most staffed", value: top && statsFor(by, top).people ? (top.designation_name || top.name) : "—", icon: <Trophy className="h-4 w-4" />, tone: "amber",
          valueSuffix: top && statsFor(by, top).people ? `${statsFor(by, top).people}` : undefined },
        { label: "Avg basic salary", value: staff ? compactNumber(pay / staff) : "—", icon: <Banknote className="h-4 w-4" />, tone: "indigo" },
        countStat(rows, { label: "Not used", icon: <CircleSlash className="h-4 w-4" />, tone: "rose", predicate: (r) => !statsFor(by, r).people }),
      ];
    },
    rowName: (r) => r.designation_name || r.name,
    rowSubtitle: (r) => `${statsFor(by, r).people} active · ${statsFor(by, r).departments} departments`,
    onOpen: (r) => navigate(`/hr/employees?designation=${encodeURIComponent(r.name)}`),
    onCreate: () => navigate("/hr/designations/new"),
    onEdit: (r) => navigate(`/hr/designations/${encodeURIComponent(r.name)}`),
    renderGridCard: (r, actions) => <DesignationCard row={r} st={statsFor(by, r)} currency={currency} actions={actions} />,
    defaultView: "grid",
    emptyTitle: "No designations",
    emptyDescription: "Add your first job title",
    newLabel: "New Designation",
  }), [by, columns, currency, navigate]);

  return <CrmManagementPage config={config} />;
}

