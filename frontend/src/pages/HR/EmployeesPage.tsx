import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Users2, UserCheck, UserX, Building2, UserPlus } from "lucide-react";
import { CrmManagementPage, countStat, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import { EmployeePhotoField } from "@/components/hr/employee-photo";
import { fileURL } from "@/services/frappe";
import type { ColumnDef } from "@/components/tables/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDate } from "@/utils/dates";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";

interface EmployeeRow {
  name: string;
  employee_name?: string;
  mm_urdu_name?: string;
  employee_number?: string;
  employee_cnic?: string;
  first_name?: string;
  last_name?: string;
  gender?: string;
  date_of_birth?: string;
  date_of_joining?: string;
  status?: string;
  company?: string;
  department?: string;
  designation?: string;
  branch?: string;
  cell_number?: string;
  company_email?: string;
  user_id?: string;
  image?: string;
}

const STATUSES = ["Active", "Inactive", "Suspended", "Left"];

const columns: ColumnDef<EmployeeRow>[] = [
  { key: "mm_urdu_name", label: "Urdu Name", getValue: (r) => r.mm_urdu_name, render: (r) => <span className="urdu text-sm">{r.mm_urdu_name || "—"}</span> },
  { key: "employee_number", label: "Code", getValue: (r) => r.employee_number },
  { key: "department", label: "Department", getValue: (r) => r.department },
  { key: "designation", label: "Designation", getValue: (r) => r.designation },
  { key: "branch", label: "Branch", getValue: (r) => r.branch },
  { key: "cell_number", label: "Mobile", getValue: (r) => r.cell_number },
  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, getValue: (r) => r.status },
  { key: "date_of_joining", label: "Joined", render: (r) => <span className="text-sm">{formatDate(r.date_of_joining)}</span> },
];

export default function EmployeesPage() {
  const { company } = useCompanyContext();
  const navigate = useNavigate();
  // ?branch= / ?department= narrow the directory (links from the Branches and Departments pages).
  const [params] = useSearchParams();
  const branch = params.get("branch");
  const department = params.get("department");
  const designation = params.get("designation");

  const config: CrmManagementConfig<EmployeeRow> = useMemo(
    () => ({
      title: "Employees",
      subtitle: branch ? `Employees at ${branch}` : department ? `Employees in ${department}` : designation ? `Employees working as ${designation}` : "Employee directory across departments and branches",
      icon: <Users2 className="h-5 w-5" />,
      doctype: "Employee",
      fields: [
        "name", "employee_name", "mm_urdu_name", "employee_number", "employee_cnic", "first_name", "last_name", "gender", "date_of_birth", "date_of_joining",
        "status", "company", "department", "designation", "branch", "cell_number", "company_email", "user_id", "image",
      ],
      filters: [...companyFilter(company), ...(branch ? [["branch", "=", branch]] : []), ...(department ? [["department", "descendants of (inclusive)", department]] : []), ...(designation ? [["designation", "=", designation]] : [])],
      formFields: [
        { fieldname: "image", label: "Photo", fieldtype: "Attach Image" },
        { fieldname: "first_name", label: "First Name", fieldtype: "Data", reqd: true },
        { fieldname: "last_name", label: "Last Name", fieldtype: "Data" },
        { fieldname: "mm_urdu_name", label: "Full Name (Urdu)", fieldtype: "Data" },
        { fieldname: "employee_number", label: "Employee Code", fieldtype: "Data" },
        { fieldname: "employee_cnic", label: "CNIC", fieldtype: "Data" },
        { fieldname: "gender", label: "Gender", fieldtype: "Link", options: "Gender", reqd: true },
        { fieldname: "date_of_birth", label: "Date of Birth", fieldtype: "Date", reqd: true },
        { fieldname: "date_of_joining", label: "Date of Joining", fieldtype: "Date", reqd: true },
        { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
        { fieldname: "department", label: "Department", fieldtype: "Link", options: "Department" },
        { fieldname: "designation", label: "Designation", fieldtype: "Link", options: "Designation" },
        { fieldname: "branch", label: "Branch", fieldtype: "Link", options: "Branch" },
        { fieldname: "status", label: "Status", fieldtype: "Select", options: STATUSES.join("\n"), default: "Active" },
        { fieldname: "cell_number", label: "Mobile", fieldtype: "Data" },
        { fieldname: "company_email", label: "Company Email", fieldtype: "Data" },
        { fieldname: "user_id", label: "User ID", fieldtype: "Link", options: "User" },
      ],
      defaults: { status: "Active", company },
      // New employees are created on a full page (pages/HR/EmployeeNewPage), not in a dialog.
      onCreate: () => navigate("/hr/employees/new"),
      renderField: (meta, { values, onChange }) =>
        meta.fieldname === "image" ? (
          <EmployeePhotoField
            name={`${values.first_name ?? ""} ${values.last_name ?? ""}`.trim()}
            value={values.image}
            docname={values.name}
            onChange={(url) => onChange("image", url)}
          />
        ) : undefined,
      dateField: "date_of_joining",
      dateLabel: "Joined",
      exportFilename: "employees",
      kanbanField: "status",
      kanbanColumns: STATUSES.map((s) => ({ value: s })),
      searchField: "employee_name",
      statusField: "status",
      statusOptions: STATUSES,
      columns,
      stats: (rows) => {
        const monthStart = new Date().toISOString().slice(0, 8) + "01";
        return [
          countStat(rows, { label: "Total", icon: <Users2 className="h-4 w-4" />, tone: "sky", clear: true }),
          countStat(rows, { label: "Active", icon: <UserCheck className="h-4 w-4" />, tone: "emerald", predicate: (r) => r.status === "Active" }),
          countStat(rows, { label: "Joined this month", icon: <UserPlus className="h-4 w-4" />, tone: "teal", predicate: (r) => (r.date_of_joining ?? "") >= monthStart }),
          countStat(rows, { label: "Left / Inactive", icon: <UserX className="h-4 w-4" />, tone: "rose", predicate: (r) => r.status === "Left" || r.status === "Inactive" }),
          { label: "Departments", value: new Set(rows.map((r) => r.department).filter(Boolean)).size, icon: <Building2 className="h-4 w-4" />, tone: "indigo" },
        ];
      },
      rowName: (r) => r.employee_name || `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.name,
      rowImage: (r) => (r.image ? fileURL(r.image) : undefined),
      rowSubtitle: (r) => r.designation || r.department,
      onOpen: (r) => navigate(`/hr/employees/${encodeURIComponent(r.name)}`),
      emptyTitle: "No employees",
      emptyDescription: "Add your first employee to get started",
      newLabel: "New Employee",
    }),
    [company, navigate, branch, department, designation],
  );

  return <CrmManagementPage config={config} />;
}
