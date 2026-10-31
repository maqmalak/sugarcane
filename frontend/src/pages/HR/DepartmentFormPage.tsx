import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft, Building2, CalendarCheck, ExternalLink, Network, Save, ShieldCheck, Trash2, UserCheck, Users2, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FrappeForm } from "@/components/forms/frappe-form";
import type { FormFieldMeta } from "@/components/forms/field-primitives";
import { ICON_GRADIENT } from "@/components/ui/app-icon";
import { useAggregate, useDocList, useDocMutations, useDocument, count, type Doc } from "@/hooks/useDoc";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { asNumber, cn } from "@/utils/cn";
import { deptLabel, deptLook } from "./department-look";
import { LinkChips, Panel, ToggleTile } from "@/components/hr/form-kit";

/** The three approver tables on a Department (child doctype Department Approver, field `approver` → User). */
const APPROVER_TABLES = [
  { field: "leave_approvers", title: "Leave approvers", hint: "Approve leave applications from this department", icon: CalendarCheck },
  { field: "expense_approvers", title: "Expense approvers", hint: "Approve expense claims and advances", icon: Wallet },
  { field: "shift_request_approver", title: "Shift request approvers", hint: "Approve shift change requests", icon: UserCheck },
] as const;
type ApproverField = (typeof APPROVER_TABLES)[number]["field"];

const DETAILS: FormFieldMeta[] = [
  { fieldname: "department_name", label: "Department Name", fieldtype: "Data", reqd: true },
  { fieldname: "mm_urdu_name", label: "Department Name (Urdu)", fieldtype: "Data" },
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "parent_department", label: "Parent Department", fieldtype: "Link", options: "Department" },
  { fieldname: "mm_code", label: "Code", fieldtype: "Data" },
  { fieldname: "mm_level", label: "Level", fieldtype: "Select", options: "\nDivision\nDepartment\nSub Department" },
];
const ACCOUNTING: FormFieldMeta[] = [
  { fieldname: "payroll_cost_center", label: "Payroll Cost Center", fieldtype: "Link", options: "Cost Center" },
  { fieldname: "leave_block_list", label: "Leave Block List", fieldtype: "Link", options: "Leave Block List" },
];

/** /hr/departments/new and /hr/departments/:name — the department form on a full page. */
export default function DepartmentFormPage() {
  const { name: routeName } = useParams();
  const isNew = !routeName || routeName === "new";
  const name = isNew ? undefined : decodeURIComponent(routeName);
  const navigate = useNavigate();
  const { company } = useCompanyContext();
  const { data: doc, isLoading, error, mutate } = useDocument("Department", name);
  const { createDoc, updateDoc, deleteDoc, loading } = useDocMutations("Department");

  const [values, setValues] = useState<Doc>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (isNew) setValues({ company, is_group: 0, disabled: 0, leave_approvers: [], expense_approvers: [], shift_request_approver: [] });
    else if (doc) setValues({ ...doc });
    setDirty(false);
  }, [isNew, doc, company]);

  const set = (field: string, value: unknown) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => { const { [field]: _, ...rest } = e; return rest; });
    setDirty(true);
  };

  // Live figures for an existing department.
  const active = useMemo(() => (name ? [["department", "=", name], ["status", "=", "Active"]] : []), [name]);
  const { data: heads } = useAggregate("Employee", { fields: ["gender", count("name", "n")], filters: active, groupBy: "gender", enabled: Boolean(name) });
  const { data: children } = useDocList("Department", { fields: ["name", "department_name"], filters: name ? [["parent_department", "=", name]] : [], limit: 50, enabled: Boolean(name) });
  const total = (heads ?? []).reduce((n, r) => n + asNumber(r.n), 0);
  const male = asNumber((heads ?? []).find((r) => r.gender === "Male")?.n);
  const female = asNumber((heads ?? []).find((r) => r.gender === "Female")?.n);

  const display = String(values.department_name || (name ? deptLabel(name) : "New department"));
  const { icon: Icon, hue } = deptLook(display);
  const gradient = ICON_GRADIENT[hue] ?? ICON_GRADIENT.blue;

  const save = async () => {
    const errs: Record<string, string> = {};
    DETAILS.forEach((f) => { if (f.reqd && !values[f.fieldname]) errs[f.fieldname] = `${f.label} is required`; });
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const payload: Doc = {
      department_name: values.department_name, mm_urdu_name: values.mm_urdu_name || "", mm_code: values.mm_code || "", mm_level: values.mm_level || "",
      company: values.company, parent_department: values.parent_department || "",
      is_group: values.is_group ? 1 : 0, disabled: values.disabled ? 1 : 0,
      payroll_cost_center: values.payroll_cost_center || "", leave_block_list: values.leave_block_list || "",
      ...Object.fromEntries(APPROVER_TABLES.map((t) => [t.field, (values[t.field] ?? []).map((r: Doc) => ({ approver: r.approver }))])),
    };
    setSaving(true);
    try {
      if (isNew) {
        const created = await createDoc(payload);
        toast.success("Department created");
        notifyDataChanged();
        navigate(`/hr/departments/${encodeURIComponent(created.name)}`, { replace: true });
      } else {
        await updateDoc(name!, payload);
        toast.success("Department saved");
        notifyDataChanged();
        await mutate();
      }
      setDirty(false);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await deleteDoc(name!);
      toast.success("Department deleted");
      notifyDataChanged();
      navigate("/hr/departments");
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  if (!isNew && error) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-16 text-center">
        <p className="font-medium">Department not found</p>
        <p className="mt-1 text-sm text-muted-foreground">{humanizeError(error)}</p>
        <Link to="/hr/departments" className="mt-4 inline-block text-sm font-medium text-primary">Back to departments</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="surface relative overflow-hidden rounded-3xl p-6">
        <div aria-hidden className={cn("pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-gradient-to-br opacity-25 blur-3xl", gradient)} />
        <div aria-hidden className={cn("pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-gradient-to-br opacity-10 blur-3xl", gradient)} />
        <div className="relative flex flex-wrap items-center gap-5">
          <Link to="/hr/departments" className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background/60 text-muted-foreground transition hover:text-foreground" aria-label="Back to departments">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className={cn("relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-gradient-to-b text-white shadow-xl ring-1 ring-inset ring-white/25", gradient)}>
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-white/0" />
            <Icon className="relative h-8 w-8 drop-shadow-sm" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{isNew ? "New department" : "Department"}</p>
            <h1 className="truncate text-2xl font-bold leading-tight">{isLoading && !isNew ? "Loading…" : display}</h1>
            {values.mm_urdu_name && <p className="urdu text-left text-lg leading-[2.2] text-muted-foreground" dir="rtl">{values.mm_urdu_name}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {values.company && <span className="rounded-full border border-border bg-background/60 px-2 py-0.5">{values.company}</span>}
              {values.parent_department && <span className="rounded-full border border-border bg-background/60 px-2 py-0.5">under {deptLabel(values.parent_department)}</span>}
              <span className={cn("rounded-full px-2 py-0.5 font-semibold", values.disabled ? "bg-muted" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
                {values.disabled ? "Disabled" : "Active"}
              </span>
            </div>
          </div>
          {!isNew && (
            <div className="surface-inset flex gap-6 rounded-2xl px-5 py-3 text-center">
              <div><p className="text-2xl font-bold tabular-nums">{total}</p><p className="text-[11px] text-muted-foreground">Active people</p></div>
              <div><p className="text-2xl font-bold tabular-nums text-sky-500">{male}</p><p className="text-[11px] text-muted-foreground">Male</p></div>
              <div><p className="text-2xl font-bold tabular-nums text-pink-500">{female}</p><p className="text-[11px] text-muted-foreground">Female</p></div>
              <div><p className="text-2xl font-bold tabular-nums">{children?.length ?? 0}</p><p className="text-[11px] text-muted-foreground">Sub-departments</p></div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel icon={Building2} title="Department details" description="Name, company and where it sits in the organisation">
            <div className="form-flat"><FrappeForm fields={DETAILS} values={values} onChange={set} errors={errors} /></div>
          </Panel>

          <Panel icon={ShieldCheck} title="Settings">
            <div className="grid gap-3 md:grid-cols-2">
              <ToggleTile checked={Boolean(values.is_group)} onChange={(v) => set("is_group", v ? 1 : 0)} tone="border-primary/50 bg-primary/5"
                title="Group department" hint="Holds other departments (e.g. Production → Weaving, Dyeing)" />
              <ToggleTile checked={Boolean(values.disabled)} onChange={(v) => set("disabled", v ? 1 : 0)} tone="border-rose-500/50 bg-rose-500/5"
                title="Disabled" hint="Hidden when picking a department for new records" />
            </div>
          </Panel>

          <Panel icon={Wallet} title="Payroll & leave" description="Where this department's salary cost is booked, and blocked leave days">
            <div className="form-flat"><FrappeForm fields={ACCOUNTING} values={values} onChange={set} /></div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel icon={UserCheck} title="Approvers" description="Who approves requests raised in this department">
            <div className="space-y-5">
              {APPROVER_TABLES.map((t) => (
                <div key={t.field}>
                  <div className="mb-2 flex items-center gap-2">
                    <t.icon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium leading-tight">{t.title}</p>
                      <p className="text-[11px] text-muted-foreground">{t.hint}</p>
                    </div>
                  </div>
                  <LinkChips rows={(values[t.field as ApproverField] ?? []) as { approver: string }[]} field="approver" doctype="User"
                    label="Add approver" empty="No approvers — the HR defaults apply." onChange={(rows) => set(t.field, rows)} />
                </div>
              ))}
            </div>
          </Panel>

          {!isNew && (
            <Panel icon={Network} title="Organisation">
              <div className="space-y-3 text-sm">
                {children?.length ? (
                  <ul className="space-y-1.5">
                    {children.map((c) => (
                      <li key={c.name}>
                        <Link to={`/hr/departments/${encodeURIComponent(c.name)}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-accent">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> {c.department_name || deptLabel(c.name)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">No sub-departments.</p>}
                <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                  <Link to={`/hr/employees?department=${encodeURIComponent(name!)}`} className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                    <Users2 className="h-4 w-4" /> View employees
                  </Link>
                  <a href={`/desk/department/${encodeURIComponent(name!)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-4 w-4" /> Open in ERPNext desk
                  </a>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-30 -mx-3 border-t border-border bg-background/90 backdrop-blur sm:-mx-5 lg:-mx-6 dark:border-white/10">
        <div className="flex items-center gap-3 px-6 py-3">
          <span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : isNew ? "Fill in the details and create" : "All changes saved"}</span>
          <div className="ml-auto flex gap-2">
            {!isNew && (
              <Button variant="outline" onClick={() => setConfirmDelete(true)} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate("/hr/departments")}>Cancel</Button>
            <Button variant="create" onClick={save} loading={saving} disabled={!isNew && !dirty}>
              <Save className="h-4 w-4" /> {isNew ? "Create department" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${display}?`}
        description="This cannot be undone. Employees in this department keep the name until you change it."
        confirmLabel="Delete"
        destructive
        loading={loading}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
