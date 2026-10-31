import { useMemo } from "react";
import { FileSignature } from "lucide-react";
import { CrmManagementPage, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import type { ColumnDef } from "@/components/tables/data-table";
import { formatMoney } from "@/utils/currency";
import { formatDate, todayISO } from "@/utils/dates";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { useEmployeeQueryFilter } from "@/hooks/useEmployeeQueryFilter";

interface SalaryStructureAssignmentRow {
  name: string;
  employee?: string;
  employee_name?: string;
  company?: string;
  department?: string;
  designation?: string;
  salary_structure?: string;
  from_date?: string;
  currency?: string;
  base?: number;
}

const columns: ColumnDef<SalaryStructureAssignmentRow>[] = [
  { key: "salary_structure", label: "Salary Structure", getValue: (r) => r.salary_structure },
  { key: "from_date", label: "From", render: (r) => <span className="text-sm">{formatDate(r.from_date)}</span> },
  { key: "base", label: "Base", align: "right", render: (r) => <span className="text-sm">{formatMoney(r.base, r.currency)}</span> },
];

export default function SalaryStructureAssignmentsPage() {
  const { company } = useCompanyContext();
  const { employee, filter: employeeFilter } = useEmployeeQueryFilter();

  const config: CrmManagementConfig<SalaryStructureAssignmentRow> = useMemo(
    () => ({
      title: "Salary Structure Assignments",
      subtitle: "Which salary structure applies to which employee, and from when",
      icon: <FileSignature className="h-5 w-5" />,
      doctype: "Salary Structure Assignment",
      fields: ["name", "employee", "employee_name", "company", "department", "designation", "salary_structure", "from_date", "currency", "base"],
      filters: [...companyFilter(company), ...employeeFilter],
      formFields: [
        { fieldname: "employee", label: "Employee", fieldtype: "Link", options: "Employee", reqd: true },
        { fieldname: "salary_structure", label: "Salary Structure", fieldtype: "Link", options: "Salary Structure", reqd: true },
        { fieldname: "from_date", label: "From Date", fieldtype: "Date", reqd: true },
        { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
        { fieldname: "currency", label: "Currency", fieldtype: "Link", options: "Currency", reqd: true },
        { fieldname: "base", label: "Base", fieldtype: "Currency" },
      ],
      defaults: { company, from_date: todayISO(), employee: employee ?? undefined },
      kanbanField: "salary_structure",
      searchField: "employee_name",
      statusField: "salary_structure",
      columns,
      rowName: (r) => r.employee_name || r.employee || r.name,
      rowSubtitle: (r) => `${r.salary_structure ?? ""} · from ${formatDate(r.from_date)}`,
      emptyTitle: "No salary structure assignments",
      emptyDescription: "Assign a salary structure to an employee to see it here",
      newLabel: "New Assignment",
    }),
    [company, employee],
  );

  return <CrmManagementPage config={config} />;
}
