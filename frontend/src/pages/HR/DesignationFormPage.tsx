import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Award, Banknote, Building2, ExternalLink, IdCard, Network, Sparkles, Users2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FrappeForm } from "@/components/forms/frappe-form";
import type { FormFieldMeta } from "@/components/forms/field-primitives";
import { FormHero, HeroChip, LinkChips, Panel, SaveBar } from "@/components/hr/form-kit";
import { useAggregate, useDocMutations, useDocument, count, avg, type Doc } from "@/hooks/useDoc";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { formatMoney } from "@/utils/currency";
import { asNumber } from "@/utils/cn";
import { deptLabel } from "./department-look";
import { designationLook } from "./designation-look";

const DETAILS = (isNew: boolean): FormFieldMeta[] => [
  // The designation's name is its ID (autoname from designation_name): fixed once created.
  { fieldname: "designation_name", label: "Designation Name", fieldtype: "Data", reqd: true, read_only: !isNew },
  { fieldname: "mm_urdu_name", label: "Designation (Urdu)", fieldtype: "Data" },
  { fieldname: "mm_abbr", label: "Abbreviation", fieldtype: "Data" },
];
const DESCRIPTION: FormFieldMeta[] = [{ fieldname: "description", label: "Description", fieldtype: "Text" }];
const APPRAISAL: FormFieldMeta[] = [{ fieldname: "appraisal_template", label: "Appraisal Template", fieldtype: "Link", options: "Appraisal Template" }];

/** /hr/designations/new and /hr/designations/:name — the designation form on a full page. */
export default function DesignationFormPage() {
  const { name: routeName } = useParams();
  const isNew = !routeName || routeName === "new";
  const name = isNew ? undefined : decodeURIComponent(routeName);
  const navigate = useNavigate();
  const { company, companyCurrency } = useCompanyContext();
  const currency = companyCurrency ?? "PKR";
  const { data: doc, isLoading, error, mutate } = useDocument("Designation", name);
  const { createDoc, updateDoc, deleteDoc, loading } = useDocMutations("Designation");

  const [values, setValues] = useState<Doc>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (isNew) setValues({ skills: [] });
    else if (doc) setValues({ ...doc });
    setDirty(false);
  }, [isNew, doc]);

  const set = (field: string, value: unknown) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => { const { [field]: _, ...rest } = e; return rest; });
    setDirty(true);
  };

  // Who holds this designation: active employees by department, with basic salary range.
  const filters = useMemo(() => (name ? [...companyFilter(company), ["designation", "=", name], ["status", "=", "Active"]] : []), [name, company]);
  const { data: byDept } = useAggregate("Employee", {
    fields: ["department", count("name", "n"), avg("mm_basic_salary", "basic")], filters, groupBy: "department", enabled: Boolean(name),
  });
  const { data: range } = useAggregate("Employee", {
    fields: [{ fn: "MIN", field: "mm_basic_salary", as: "lo" }, { fn: "MAX", field: "mm_basic_salary", as: "hi" }, avg("mm_basic_salary", "avg")],
    filters, enabled: Boolean(name),
  });
  const depts = [...(byDept ?? [])].sort((a, b) => asNumber(b.n) - asNumber(a.n));
  const people = depts.reduce((n, r) => n + asNumber(r.n), 0);
  const lo = asNumber(range?.[0]?.lo), hi = asNumber(range?.[0]?.hi), mean = asNumber(range?.[0]?.avg);
  const maxDept = Math.max(1, ...depts.map((d) => asNumber(d.n)));

  const display = String(values.designation_name || name || "New designation");
  const { icon, hue } = designationLook(display);

  const save = async () => {
    if (!values.designation_name) { setErrors({ designation_name: "Designation Name is required" }); return; }
    const payload: Doc = {
      designation_name: values.designation_name, mm_urdu_name: values.mm_urdu_name || "", mm_abbr: values.mm_abbr || "",
      description: values.description || "", appraisal_template: values.appraisal_template || "",
      skills: (values.skills ?? []).map((r: Doc) => ({ skill: r.skill })),
    };
    setSaving(true);
    try {
      if (isNew) {
        const created = await createDoc(payload);
        toast.success("Designation created");
        notifyDataChanged();
        navigate(`/hr/designations/${encodeURIComponent(created.name)}`, { replace: true });
      } else {
        const { designation_name: _, ...rest } = payload;
        await updateDoc(name!, rest);
        toast.success("Designation saved");
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
      toast.success("Designation deleted");
      notifyDataChanged();
      navigate("/hr/designations");
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  if (!isNew && error) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-16 text-center">
        <p className="font-medium">Designation not found</p>
        <p className="mt-1 text-sm text-muted-foreground">{humanizeError(error)}</p>
        <Link to="/hr/designations" className="mt-4 inline-block text-sm font-medium text-primary">Back to designations</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FormHero
        backTo="/hr/designations" backLabel="Back to designations" icon={icon} hue={hue}
        kicker={isNew ? "New designation" : "Designation"}
        title={isLoading && !isNew ? "Loading…" : display}
        urdu={values.mm_urdu_name}
        chips={<>
          {values.mm_abbr && <HeroChip><span className="font-mono">{values.mm_abbr}</span></HeroChip>}
          {!isNew && <HeroChip tone={people ? "bg-emerald-500/10 font-semibold text-emerald-600 dark:text-emerald-400" : "bg-muted font-semibold"}>{people ? "In use" : "Not used"}</HeroChip>}
        </>}
        figures={isNew ? undefined : [
          { label: "Active people", value: people },
          { label: "Departments", value: depts.filter((d) => d.department).length },
          { label: "Avg basic", value: mean ? formatMoney(mean, currency, { compact: true }) : "—", tone: "text-emerald-500" },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel icon={IdCard} title="Designation details" description={isNew ? "Job title, its Urdu name and short code" : "The title is the record's ID and can't be changed here"}>
            <div className="form-flat"><FrappeForm fields={DETAILS(isNew)} values={values} onChange={set} errors={errors} /></div>
          </Panel>

          <Panel icon={Sparkles} title="Role description" description="What the job involves — shown to HR and on job openings">
            <div className="form-flat"><FrappeForm fields={DESCRIPTION} values={values} onChange={set} /></div>
          </Panel>

          <Panel icon={Award} title="Skills & appraisal" description="Skills this role needs, and the template its appraisals use">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">Required skills</p>
                <LinkChips rows={(values.skills ?? []) as { skill: string }[]} field="skill" doctype="Skill" label="Add skill"
                  empty="No skills listed yet." onChange={(rows) => set("skills", rows)} />
              </div>
              <div className="form-flat form-single"><FrappeForm fields={APPRAISAL} values={values} onChange={set} /></div>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          {!isNew && (
            <Panel icon={Network} title="Where they work" description="Active employees with this designation, by department">
              {depts.length ? (
                <ul className="space-y-2.5">
                  {depts.slice(0, 12).map((d) => (
                    <li key={d.department ?? "none"} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">{d.department ? deptLabel(d.department) : "No department"}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{asNumber(d.n)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60" style={{ width: `${(asNumber(d.n) / maxDept) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                  {depts.length > 12 && <li className="text-xs text-muted-foreground">+ {depts.length - 12} more departments</li>}
                </ul>
              ) : <p className="text-xs text-muted-foreground">Nobody holds this designation yet.</p>}
            </Panel>
          )}

          {!isNew && (
            <Panel icon={Banknote} title="Basic salary" description="Across active employees with this designation">
              {people ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[["Lowest", lo], ["Average", mean], ["Highest", hi]].map(([l, v]) => (
                    <div key={l as string} className="surface-inset rounded-xl px-2 py-2.5">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{l}</p>
                      <p className="truncate text-sm font-semibold tabular-nums" title={formatMoney(v as number, currency)}>{formatMoney(v as number, currency, { compact: true })}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground">No salary data yet.</p>}
            </Panel>
          )}

          {!isNew && (
            <Panel icon={Users2} title="Links">
              <div className="flex flex-col gap-2 text-sm">
                <Link to={`/hr/employees?designation=${encodeURIComponent(name!)}`} className="inline-flex items-center gap-2 font-medium text-primary">
                  <Users2 className="h-4 w-4" /> View employees
                </Link>
                <Link to="/hr/departments" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
                  <Building2 className="h-4 w-4" /> Departments
                </Link>
                <a href={`/desk/designation/${encodeURIComponent(name!)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-4 w-4" /> Open in ERPNext desk
                </a>
              </div>
            </Panel>
          )}
        </div>
      </div>

      <SaveBar isNew={isNew} dirty={dirty} saving={saving} createLabel="Create designation"
        onSave={save} onCancel={() => navigate("/hr/designations")} onDelete={() => setConfirmDelete(true)} />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${display}?`}
        description={people ? `${people} employees hold this designation — reassign them first, or the delete will be refused.` : "This cannot be undone."}
        confirmLabel="Delete"
        destructive
        loading={loading}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
