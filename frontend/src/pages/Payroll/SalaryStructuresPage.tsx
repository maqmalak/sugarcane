import { useMemo } from "react";
import { FileSpreadsheet } from "lucide-react";
import { CrmManagementPage, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import type { ColumnDef } from "@/components/tables/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { formatMoney } from "@/utils/currency";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";

interface SalaryStructureRow {
  name: string;
  company?: string;
  is_active?: string;
  currency?: string;
  payroll_frequency?: string;
  net_pay?: number;
}

const columns: ColumnDef<SalaryStructureRow>[] = [
  { key: "payroll_frequency", label: "Frequency", getValue: (r) => r.payroll_frequency },
  { key: "net_pay", label: "Net Pay", align: "right", render: (r) => <span className="text-sm">{formatMoney(r.net_pay, r.currency)}</span> },
  { key: "is_active", label: "Active", render: (r) => <StatusBadge status={r.is_active} />, getValue: (r) => r.is_active },
];

export default function SalaryStructuresPage() {
  const { company } = useCompanyContext();

  const config: CrmManagementConfig<SalaryStructureRow> = useMemo(
    () => ({
      title: "Salary Structures",
      subtitle: "Earning/deduction templates assigned to employees",
      icon: <FileSpreadsheet className="h-5 w-5" />,
      doctype: "Salary Structure",
      fields: ["name", "company", "is_active", "currency", "payroll_frequency", "net_pay"],
      filters: companyFilter(company),
      formFields: [
        { fieldname: "name", label: "Structure Name", fieldtype: "Data", reqd: true },
        { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
        { fieldname: "currency", label: "Currency", fieldtype: "Link", options: "Currency", reqd: true },
        { fieldname: "payroll_frequency", label: "Payroll Frequency", fieldtype: "Select", options: "\nMonthly\nFortnightly\nBimonthly\nWeekly\nDaily" },
        { fieldname: "is_active", label: "Is Active", fieldtype: "Select", options: "\nYes\nNo", default: "Yes" },
      ],
      defaults: { company, is_active: "Yes" },
      kanbanField: "is_active",
      kanbanColumns: [{ value: "Yes", title: "Active" }, { value: "No", title: "Inactive" }],
      searchField: "name",
      statusField: "is_active",
      statusOptions: ["Yes", "No"],
      columns,
      rowName: (r) => r.name,
      rowSubtitle: (r) => r.payroll_frequency,
      emptyTitle: "No salary structures",
      emptyDescription: "Create a salary structure to assign to employees",
      newLabel: "New Salary Structure",
    }),
    [company],
  );

  return <CrmManagementPage config={config} />;
}
