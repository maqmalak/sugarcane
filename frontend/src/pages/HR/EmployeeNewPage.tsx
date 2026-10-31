import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Banknote, Briefcase, Building2, IdCard, Phone, UserRound, UserPlus } from "lucide-react";
import { FrappeForm } from "@/components/forms/frappe-form";
import type { FormFieldMeta } from "@/components/forms/field-primitives";
import { FormHero, HeroChip, Panel, SaveBar } from "@/components/hr/form-kit";
import { EmployeePhotoField } from "@/components/hr/employee-photo";
import { useDocMutations, type Doc } from "@/hooks/useDoc";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { todayISO } from "@/utils/dates";
import { deptLabel } from "./department-look";

const PERSON: FormFieldMeta[] = [
  { fieldname: "first_name", label: "First Name", fieldtype: "Data", reqd: true },
  { fieldname: "middle_name", label: "Middle Name", fieldtype: "Data" },
  { fieldname: "last_name", label: "Last Name", fieldtype: "Data" },
  { fieldname: "mm_urdu_name", label: "Full Name (Urdu)", fieldtype: "Data" },
  { fieldname: "employee_cnic", label: "CNIC", fieldtype: "Data", placeholder: "00000-0000000-0" },
  { fieldname: "gender", label: "Gender", fieldtype: "Link", options: "Gender", reqd: true },
  { fieldname: "date_of_birth", label: "Date of Birth", fieldtype: "Date", reqd: true },
  { fieldname: "salutation", label: "Salutation", fieldtype: "Link", options: "Salutation" },
  { fieldname: "marital_status", label: "Marital Status", fieldtype: "Select", options: "\nSingle\nMarried\nDivorced\nWidowed" },
];
const JOB: FormFieldMeta[] = [
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "department", label: "Department", fieldtype: "Link", options: "Department" },
  { fieldname: "designation", label: "Designation", fieldtype: "Link", options: "Designation" },
  { fieldname: "employee_number", label: "Employee Code", fieldtype: "Data", placeholder: "e.g. LP/STM/HLP-450" },
  { fieldname: "date_of_joining", label: "Date of Joining", fieldtype: "Date", reqd: true },
  { fieldname: "status", label: "Status", fieldtype: "Select", options: "Active\nInactive\nSuspended\nLeft", reqd: true },
  { fieldname: "branch", label: "Branch", fieldtype: "Link", options: "Branch" },
  { fieldname: "reports_to", label: "Reports To", fieldtype: "Link", options: "Employee" },
  { fieldname: "employment_type", label: "Employment Type", fieldtype: "Link", options: "Employment Type" },
  { fieldname: "grade", label: "Grade", fieldtype: "Link", options: "Employee Grade" },
  { fieldname: "default_shift", label: "Default Shift", fieldtype: "Link", options: "Shift Type" },
  { fieldname: "holiday_list", label: "Holiday List", fieldtype: "Link", options: "Holiday List" },
  { fieldname: "attendance_device_id", label: "Attendance Device ID", fieldtype: "Data" },
];
const CONTACT: FormFieldMeta[] = [
  { fieldname: "cell_number", label: "Mobile", fieldtype: "Data", placeholder: "03xx-xxxxxxx" },
  { fieldname: "personal_email", label: "Personal Email", fieldtype: "Data" },
  { fieldname: "company_email", label: "Company Email", fieldtype: "Data" },
  { fieldname: "current_address", label: "Current Address", fieldtype: "Text" },
  { fieldname: "person_to_be_contacted", label: "Emergency Contact", fieldtype: "Data" },
  { fieldname: "emergency_phone_number", label: "Emergency Phone", fieldtype: "Data" },
];
const PAY: FormFieldMeta[] = [
  { fieldname: "mm_basic_salary", label: "Basic Salary", fieldtype: "Currency" },
  { fieldname: "salary_mode", label: "Salary Mode", fieldtype: "Select", options: "\nBank\nCash\nCheque" },
  { fieldname: "bank_name", label: "Bank Name", fieldtype: "Data" },
  { fieldname: "bank_ac_no", label: "Bank A/C No.", fieldtype: "Data" },
  { fieldname: "iban", label: "IBAN", fieldtype: "Data" },
];
const REQUIRED = [...PERSON, ...JOB].filter((f) => f.reqd);

/** /hr/employees/new — the new-employee form on a full page (the saved employee opens on its own page). */
export default function EmployeeNewPage() {
  const navigate = useNavigate();
  const { company } = useCompanyContext();
  const { createDoc } = useDocMutations("Employee");
  const [values, setValues] = useState<Doc>(() => ({ company, status: "Active", date_of_joining: todayISO(), salary_mode: "Cash" }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const set = (field: string, value: unknown) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => { const { [field]: _, ...rest } = e; return rest; });
    setDirty(true);
  };

  const fullName = [values.first_name, values.middle_name, values.last_name].filter(Boolean).join(" ");

  const save = async () => {
    const errs: Record<string, string> = {};
    REQUIRED.forEach((f) => { if (!values[f.fieldname]) errs[f.fieldname] = `${f.label} is required`; });
    if (values.employee_cnic && !/^\d{5}-\d{7}-\d$/.test(String(values.employee_cnic))) errs.employee_cnic = "CNIC must look like 00000-0000000-0";
    if (Object.keys(errs).length) {
      setErrors(errs);
      toast.error("Please fill in the highlighted fields");
      return;
    }
    const payload = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== ""));
    setSaving(true);
    try {
      const created = await createDoc(payload);
      toast.success(`${created.employee_name || fullName} added`);
      notifyDataChanged();
      navigate(`/hr/employees/${encodeURIComponent(created.name)}`, { replace: true });
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <FormHero
        backTo="/hr/employees" backLabel="Back to employees" icon={UserPlus} hue="violet"
        kicker="New employee"
        title={fullName || "New employee"}
        urdu={values.mm_urdu_name}
        chips={<>
          {values.designation && <HeroChip>{values.designation}</HeroChip>}
          {values.department && <HeroChip>{deptLabel(String(values.department))}</HeroChip>}
          {values.employee_number && <HeroChip><span className="font-mono">{values.employee_number}</span></HeroChip>}
          {values.employee_cnic && <HeroChip>CNIC <span className="font-mono">{values.employee_cnic}</span></HeroChip>}
        </>}
      />

      {/* Row 1: personal details beside a photo card of the same height */}
      <div className="grid items-stretch gap-6 xl:grid-cols-3">
        <Panel icon={UserRound} title="Personal details" description="Name in English and Urdu, identity card and date of birth" className="xl:col-span-2">
          <div className="form-flat"><FrappeForm fields={PERSON} values={values} onChange={set} errors={errors} /></div>
        </Panel>
        <Panel icon={IdCard} title="Photo" description="Passport size, 35 × 45 mm" className="flex flex-col" bodyClassName="flex flex-1 items-center justify-center">
          <EmployeePhotoField name={fullName} value={values.image} onChange={(url) => set("image", url)} passport />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel icon={Briefcase} title="Job" description="Where they work, their role, code and shift">
            <div className="form-flat"><FrappeForm fields={JOB} values={values} onChange={set} errors={errors} /></div>
          </Panel>

          <Panel icon={Phone} title="Contact" description="Phone, email, address and who to call in an emergency">
            <div className="form-flat"><FrappeForm fields={CONTACT} values={values} onChange={set} /></div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel icon={Banknote} title="Pay" description="Basic salary and how it is paid">
            <div className="form-flat form-single"><FrappeForm fields={PAY} values={values} onChange={set} /></div>
          </Panel>

          <Panel icon={Building2} title="After saving">
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>• The employee opens on their own page — Insights, Connections and Activity.</li>
              <li>• Assign a salary structure (Payroll) and a shift so payroll and attendance include them.</li>
              <li>• Required: first name, gender, date of birth, company, date of joining and status.</li>
            </ul>
          </Panel>
        </div>
      </div>

      <SaveBar isNew dirty={dirty} saving={saving} createLabel="Create employee" onSave={save} onCancel={() => navigate("/hr/employees")} />
    </div>
  );
}
