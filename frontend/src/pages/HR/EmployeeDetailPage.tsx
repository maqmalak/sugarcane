import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { ConnectionsPanel } from "@/components/doc/connections-panel";
import { ActivityTimeline, DocActionsPanel } from "@/components/common/activity-panel";
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft, Trash2, UserRound, Sparkles, LayoutList, MapPin, CalendarCheck, Wallet, HeartPulse, GraduationCap, LogIn, LogOut,
  Link2, History, type LucideIcon,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { EmployeeInsights } from "@/components/hr/employee-insights";
import { EmployeeProfileHero } from "@/components/hr/employee-profile-hero";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FrappeForm } from "@/components/forms/frappe-form";
import { EditableChildTable } from "@/components/tables/child-table";
import { type FormFieldMeta } from "@/components/forms/field-primitives";
import { useEmployee, useEmployeeMutations } from "@/hooks/useEmployee";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";

const sb = (fieldname: string, label?: string): FormFieldMeta => ({ fieldname, fieldtype: "Section Break", label });
const cb = (fieldname: string): FormFieldMeta => ({ fieldname, fieldtype: "Column Break" });

const TABS: { key: string; label: string; fields: FormFieldMeta[] }[] = [
  {
    key: "overview",
    label: "Overview",
    fields: [
      sb("sb_basic", "Basic Details"),
      { fieldname: "first_name", label: "First Name", fieldtype: "Data", reqd: true },
      { fieldname: "middle_name", label: "Middle Name", fieldtype: "Data" },
      { fieldname: "last_name", label: "Last Name", fieldtype: "Data" },
      { fieldname: "mm_urdu_name", label: "Full Name (Urdu)", fieldtype: "Data" },
      { fieldname: "employee_cnic", label: "CNIC", fieldtype: "Data", placeholder: "00000-0000000-0" },
      cb("cb_basic1"),
      { fieldname: "gender", label: "Gender", fieldtype: "Link", options: "Gender", reqd: true },
      { fieldname: "date_of_birth", label: "Date of Birth", fieldtype: "Date", reqd: true },
      { fieldname: "salutation", label: "Salutation", fieldtype: "Link", options: "Salutation" },
      cb("cb_basic2"),
      { fieldname: "date_of_joining", label: "Date of Joining", fieldtype: "Date", reqd: true },
      { fieldname: "status", label: "Status", fieldtype: "Select", options: "Active\nInactive\nSuspended\nLeft", reqd: true },
      { fieldname: "mm_placeholder_data", label: "Gender / date of birth / joining date not confirmed", fieldtype: "Check" },
      sb("sb_user", "User Details"),
      { fieldname: "user_id", label: "User ID", fieldtype: "Link", options: "User" },
      { fieldname: "create_user_permission", label: "Create User Permission", fieldtype: "Check" },
      { fieldname: "create_user_automatically", label: "Create User Automatically", fieldtype: "Check" },
      sb("sb_company", "Company Details"),
      { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
      { fieldname: "department", label: "Department", fieldtype: "Link", options: "Department" },
      { fieldname: "employee_number", label: "Employee Number", fieldtype: "Data" },
      cb("cb_company1"),
      { fieldname: "designation", label: "Designation", fieldtype: "Link", options: "Designation" },
      { fieldname: "reports_to", label: "Reports to", fieldtype: "Link", options: "Employee" },
      { fieldname: "employment_type", label: "Employment Type", fieldtype: "Link", options: "Employment Type" },
      { fieldname: "grade", label: "Grade", fieldtype: "Link", options: "Employee Grade" },
      cb("cb_company2"),
      { fieldname: "branch", label: "Branch", fieldtype: "Link", options: "Branch" },
      { fieldname: "cell_number", label: "Mobile", fieldtype: "Data" },
      cb("cb_company3"),
      { fieldname: "company_email", label: "Company Email", fieldtype: "Data" },
      { fieldname: "personal_email", label: "Personal Email", fieldtype: "Data" },
      cb("cb_company4"),
      { fieldname: "prefered_contact_email", label: "Preferred Contact Email", fieldtype: "Select", options: "\nCompany Email\nPersonal Email\nUser ID" },
      { fieldname: "prefered_email", label: "Preferred Email", fieldtype: "Data" },
      { fieldname: "unsubscribed", label: "Unsubscribed", fieldtype: "Check" },
    ],
  },
  {
    key: "address",
    label: "Address & Contacts",
    fields: [
      sb("sb_address", "Address"),
      { fieldname: "current_address", label: "Current Address", fieldtype: "Text" },
      { fieldname: "current_accommodation_type", label: "Current Address Is", fieldtype: "Select", options: "\nRented\nOwned" },
      cb("cb_address"),
      { fieldname: "permanent_address", label: "Permanent Address", fieldtype: "Text" },
      { fieldname: "permanent_accommodation_type", label: "Permanent Address Is", fieldtype: "Select", options: "\nRented\nOwned" },
      sb("sb_emergency", "Emergency Contact"),
      { fieldname: "person_to_be_contacted", label: "Emergency Contact Name", fieldtype: "Data" },
      cb("cb_emergency1"),
      { fieldname: "emergency_phone_number", label: "Emergency Phone", fieldtype: "Data" },
      cb("cb_emergency2"),
      { fieldname: "relation", label: "Relation", fieldtype: "Data" },
    ],
  },
  {
    key: "attendance",
    label: "Attendance & Leaves",
    fields: [
      { fieldname: "attendance_device_id", label: "Attendance Device ID (Biometric/RF tag ID)", fieldtype: "Data" },
      cb("cb_att"),
      { fieldname: "holiday_list", label: "Holiday List", fieldtype: "Link", options: "Holiday List" },
      { fieldname: "default_shift", label: "Default Shift", fieldtype: "Link", options: "Shift Type" },
      sb("sb_approvers", "Approvers"),
      { fieldname: "leave_approver", label: "Leave Approver", fieldtype: "Link", options: "User" },
      cb("cb_appr1"),
      { fieldname: "expense_approver", label: "Expense Approver", fieldtype: "Link", options: "User" },
      cb("cb_appr2"),
      { fieldname: "shift_request_approver", label: "Shift Request Approver", fieldtype: "Link", options: "User" },
    ],
  },
  {
    key: "salary",
    label: "Salary",
    fields: [
      { fieldname: "mm_basic_salary", label: "Basic Salary", fieldtype: "Currency" },
      { fieldname: "ctc", label: "Cost to Company (CTC)", fieldtype: "Currency" },
      { fieldname: "salary_currency", label: "Salary Currency", fieldtype: "Link", options: "Currency" },
      { fieldname: "salary_mode", label: "Salary Mode", fieldtype: "Select", options: "\nBank\nCash\nCheque" },
      sb("sb_bank", "Bank Details"),
      { fieldname: "bank_name", label: "Bank Name", fieldtype: "Data" },
      cb("cb_bank"),
      { fieldname: "bank_ac_no", label: "Bank A/C No.", fieldtype: "Data" },
      { fieldname: "iban", label: "IBAN", fieldtype: "Data" },
      sb("sb_accounting", "Accounting"),
      { fieldname: "payroll_cost_center", label: "Payroll Cost Center", fieldtype: "Link", options: "Cost Center" },
      cb("cb_accounting"),
      { fieldname: "employee_advance_account", label: "Employee Advance Account", fieldtype: "Link", options: "Account" },
    ],
  },
  {
    key: "personal",
    label: "Personal Details",
    fields: [
      { fieldname: "marital_status", label: "Marital Status", fieldtype: "Select", options: "\nSingle\nMarried\nDivorced\nWidowed" },
      { fieldname: "family_background", label: "Family Background", fieldtype: "Text" },
      cb("cb_personal"),
      { fieldname: "blood_group", label: "Blood Group", fieldtype: "Select", options: "\nA+\nA-\nB+\nB-\nAB+\nAB-\nO+\nO-" },
      { fieldname: "health_details", label: "Health Details", fieldtype: "Text" },
      sb("sb_health", "Health Insurance"),
      { fieldname: "health_insurance_provider", label: "Health Insurance Provider", fieldtype: "Link", options: "Employee Health Insurance" },
      cb("cb_health"),
      { fieldname: "health_insurance_no", label: "Health Insurance No", fieldtype: "Data" },
      sb("sb_passport", "Passport Details"),
      { fieldname: "passport_number", label: "Passport Number", fieldtype: "Data" },
      { fieldname: "valid_upto", label: "Valid Up To", fieldtype: "Date" },
      cb("cb_passport"),
      { fieldname: "date_of_issue", label: "Date of Issue", fieldtype: "Date" },
      { fieldname: "place_of_issue", label: "Place of Issue", fieldtype: "Data" },
      sb("sb_bio", "Bio"),
      { fieldname: "bio", label: "Bio / Cover Letter", fieldtype: "Text Editor" },
    ],
  },
  {
    key: "profile",
    label: "Profile",
    fields: [
      { fieldname: "education", label: "Education", fieldtype: "Table", options: "Employee Education" },
      { fieldname: "external_work_history", label: "Previous Work Experience", fieldtype: "Table", options: "Employee External Work History" },
      { fieldname: "internal_work_history", label: "History in Company", fieldtype: "Table", options: "Employee Internal Work History" },
    ],
  },
  {
    key: "joining",
    label: "Joining",
    fields: [
      { fieldname: "job_applicant", label: "Job Applicant", fieldtype: "Link", options: "Job Applicant" },
      { fieldname: "scheduled_confirmation_date", label: "Offer Date", fieldtype: "Date" },
      cb("cb_join1"),
      { fieldname: "final_confirmation_date", label: "Confirmation Date", fieldtype: "Date" },
      { fieldname: "contract_end_date", label: "Contract End Date", fieldtype: "Date" },
      cb("cb_join2"),
      { fieldname: "notice_number_of_days", label: "Notice (days)", fieldtype: "Int" },
      { fieldname: "date_of_retirement", label: "Date Of Retirement", fieldtype: "Date" },
    ],
  },
  {
    key: "exit",
    label: "Exit",
    fields: [
      { fieldname: "resignation_letter_date", label: "Resignation Letter Date", fieldtype: "Date" },
      { fieldname: "relieving_date", label: "Relieving Date", fieldtype: "Date" },
      cb("cb_exit1"),
      { fieldname: "held_on", label: "Exit Interview Held On", fieldtype: "Date" },
      { fieldname: "new_workplace", label: "New Workplace", fieldtype: "Data" },
      cb("cb_exit2"),
      { fieldname: "leave_encashed", label: "Leave Encashed?", fieldtype: "Select", options: "\nYes\nNo" },
      { fieldname: "encashment_date", label: "Encashment Date", fieldtype: "Date" },
      sb("sb_feedback", "Feedback"),
      { fieldname: "reason_for_leaving", label: "Reason for Leaving", fieldtype: "Text" },
      cb("cb_feedback"),
      { fieldname: "feedback", label: "Feedback", fieldtype: "Text" },
    ],
  },
];

/** Columns of the Profile tab's child tables (Employee Education / External / Internal Work History). */
const CHILD_COLUMNS: Record<string, FormFieldMeta[]> = {
  education: [
    { fieldname: "school_univ", label: "School / University", fieldtype: "Data" },
    { fieldname: "qualification", label: "Qualification", fieldtype: "Data" },
    { fieldname: "level", label: "Level", fieldtype: "Select", options: "\nGraduate\nPost Graduate\nUnder Graduate" },
    { fieldname: "year_of_passing", label: "Year", fieldtype: "Int" },
    { fieldname: "class_per", label: "Class / %", fieldtype: "Data" },
    { fieldname: "maj_opt_subj", label: "Major / Subjects", fieldtype: "Data" },
  ],
  external_work_history: [
    { fieldname: "company_name", label: "Company", fieldtype: "Data" },
    { fieldname: "designation", label: "Designation", fieldtype: "Data" },
    { fieldname: "salary", label: "Salary", fieldtype: "Currency" },
    { fieldname: "address", label: "Address", fieldtype: "Data" },
    { fieldname: "contact", label: "Contact", fieldtype: "Data" },
    { fieldname: "total_experience", label: "Experience", fieldtype: "Data" },
  ],
  internal_work_history: [
    { fieldname: "branch", label: "Branch", fieldtype: "Link", options: "Branch" },
    { fieldname: "department", label: "Department", fieldtype: "Link", options: "Department" },
    { fieldname: "designation", label: "Designation", fieldtype: "Link", options: "Designation" },
    { fieldname: "from_date", label: "From", fieldtype: "Date" },
    { fieldname: "to_date", label: "To", fieldtype: "Date" },
  ],
};

/** The Profile tab: education and work history as editable grids. */
function ProfileTables({ fields, values, onChange }: { fields: FormFieldMeta[]; values: Record<string, any>; onChange: (fieldname: string, value: any) => void }) {
  return (
    <div className="space-y-6">
      {fields.filter((f) => f.fieldtype === "Table").map((f) => {
        const rows: Record<string, any>[] = Array.isArray(values[f.fieldname]) ? values[f.fieldname] : [];
        return (
          <section key={f.fieldname} className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><span className="h-4 w-1 rounded-full bg-primary" /> {f.label}</h3>
            <EditableChildTable
              columns={CHILD_COLUMNS[f.fieldname]}
              rows={rows}
              onChange={(i, fn, v) => onChange(f.fieldname, rows.map((r, k) => (k === i ? { ...r, [fn]: v } : r)))}
              onAddRow={() => onChange(f.fieldname, [...rows, {}])}
              onRemoveRow={(i) => onChange(f.fieldname, rows.filter((_, k) => k !== i))}
              emptyMessage={`No ${String(f.label).toLowerCase()} yet — click Add Row.`}
            />
          </section>
        );
      })}
    </div>
  );
}

const TABLE_FIELDS = new Set(Object.keys(CHILD_COLUMNS));

const ALL_EDITABLE_FIELDNAMES = TABS.flatMap((t) => t.fields)
  .filter((f) => f.fieldtype !== "Section Break" && f.fieldtype !== "Column Break")
  .map((f) => f.fieldname);

/** One row of tabs (as in the desk form): the form sections, then Connections, Activity and Insights. */
const TAB_LOOK: Record<string, { icon: LucideIcon; color: string }> = {
  overview: { icon: LayoutList, color: "text-sky-500" },
  address: { icon: MapPin, color: "text-rose-500" },
  attendance: { icon: CalendarCheck, color: "text-indigo-500" },
  salary: { icon: Wallet, color: "text-emerald-500" },
  personal: { icon: HeartPulse, color: "text-pink-500" },
  profile: { icon: GraduationCap, color: "text-violet-500" },
  joining: { icon: LogIn, color: "text-teal-500" },
  exit: { icon: LogOut, color: "text-orange-500" },
  connections: { icon: Link2, color: "text-cyan-500" },
  activity: { icon: History, color: "text-amber-500" },
  insights: { icon: Sparkles, color: "text-fuchsia-500" },
};
const ALL_TABS = [...TABS.map((t) => ({ key: t.key, label: t.label })),
  { key: "connections", label: "Connections" }, { key: "activity", label: "Activity" }, { key: "insights", label: "Insights" }];

/**
 * Employee view/edit page — tabbed like ERPNext's own desk form, instead of
 * the flat single-dialog editor the generic management-page list uses.
 * Related records (attendance, leave, payroll …) are on the Connections tab and comments / changes / files on the
 * Activity tab (DocPageTabs — the same panels as the real-estate app's forms).
 */
export default function EmployeeDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { data: doc, error, isLoading, mutate } = useEmployee(name);
  const { updateDoc, deleteDoc, saving, deleting } = useEmployeeMutations();

  const [activeTab, setActiveTab] = useState(TABS[0].key);
  const [values, setValues] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (doc) {
      const picked: Record<string, any> = {};
      ALL_EDITABLE_FIELDNAMES.forEach((f) => {
        picked[f] = doc[f] ?? (TABLE_FIELDS.has(f) ? [] : "");
      });
      setValues(picked);
      setDirty(false);
    }
  }, [doc]);

  const tab = useMemo(() => TABS.find((t) => t.key === activeTab) ?? TABS[0], [activeTab]);

  const handleChange = (fieldname: string, value: any) => {
    setValues((v) => ({ ...v, [fieldname]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!name) return;
    try {
      await updateDoc(name, values);
      toast.success("Employee updated");
      setDirty(false);
      await mutate();
      notifyDataChanged();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  const handleDelete = async () => {
    if (!name) return;
    try {
      await deleteDoc(name);
      toast.success("Employee deleted");
      notifyDataChanged();
      navigate("/hr/employees");
    } catch (err) {
      toast.error(humanizeError(err));
      setConfirmDelete(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="space-y-4">
        <PageHeader title="Employee" />
        <Card className="p-4">
          <p className="text-sm text-destructive">Failed to load employee {name}.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void mutate()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const displayName = doc.employee_name || `${doc.first_name ?? ""} ${doc.last_name ?? ""}`.trim() || doc.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title={displayName}
        subtitle="Employee"
        icon={<UserRound className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/hr/employees" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Employees
          </Link>
        }
        actions={
          <>
            <DocActionsMenu doctype="Employee" doc={doc as any} onChanged={() => void mutate()} />
            <StatusBadge status={doc.status} />
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={deleting}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving} disabled={!dirty}>
              Save
            </Button>
          </>
        }
      />
      <EmployeeProfileHero
        doc={doc}
        displayName={displayName}
        onPhotoChange={async (url) => {
          try {
            await updateDoc(doc.name, { image: url });
            toast.success(url ? "Photo updated" : "Photo removed");
            await mutate();
            notifyDataChanged();
          } catch (err) {
            toast.error(humanizeError(err));
          }
        }}
      />

      {/* all tabs in one row — underlined, coloured icons, sticky under the header */}
      <div className="surface sticky top-14 z-20 -mx-1 overflow-x-auto overflow-y-hidden rounded-xl px-2 scrollbar-thin">
        <div role="tablist" className="flex min-w-max gap-1">
          {ALL_TABS.map((t) => {
            const look = TAB_LOOK[t.key];
            const on = activeTab === t.key;
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setActiveTab(t.key)}
                className={cn("relative flex items-center gap-2 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors",
                  on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {look && <look.icon className={cn("h-4 w-4 transition", look.color, !on && "opacity-60")} />}
                {t.label}
                <span aria-hidden className={cn("absolute inset-x-2 -bottom-px h-[3px] rounded-full transition-all",
                  on ? "bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500" : "bg-transparent")} />
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "insights" ? (
        <EmployeeInsights employee={doc.name} />
      ) : activeTab === "connections" ? (
        <ConnectionsPanel doctype="Employee" name={doc.name} />
      ) : activeTab === "activity" ? (
        // comments, changes and emails beside assignments / attachments / tags / sharing — as on the real-estate forms
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0"><ActivityTimeline doctype="Employee" docname={doc.name} /></div>
          <aside className="xl:sticky xl:top-28">
            <DocActionsPanel doctype="Employee" docname={doc.name} title={doc.employee_name} caption="Employee · assignments, files & sharing" />
          </aside>
        </div>
      ) : (
        <Card className="p-5">
          {tab.key === "profile"
            ? <ProfileTables fields={tab.fields} values={values} onChange={handleChange} />
            : <FrappeForm fields={tab.fields} values={values} onChange={handleChange} />}
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this employee?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
