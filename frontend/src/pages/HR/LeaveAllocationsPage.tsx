import { useMemo } from "react";
import { CalendarPlus2 } from "lucide-react";
import { CrmManagementPage, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import type { ColumnDef } from "@/components/tables/data-table";
import { formatDate } from "@/utils/dates";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { useEmployeeQueryFilter } from "@/hooks/useEmployeeQueryFilter";

interface LeaveAllocationRow {
  name: string;
  employee?: string;
  employee_name?: string;
  department?: string;
  company?: string;
  leave_type?: string;
  from_date?: string;
  to_date?: string;
  new_leaves_allocated?: number;
  total_leaves_allocated?: number;
}

const columns: ColumnDef<LeaveAllocationRow>[] = [
  { key: "leave_type", label: "Leave Type", getValue: (r) => r.leave_type },
  { key: "from_date", label: "From", render: (r) => <span className="text-sm">{formatDate(r.from_date)}</span> },
  { key: "to_date", label: "To", render: (r) => <span className="text-sm">{formatDate(r.to_date)}</span> },
  { key: "total_leaves_allocated", label: "Allocated", align: "right", getValue: (r) => r.total_leaves_allocated },
];

export default function LeaveAllocationsPage() {
  const { company } = useCompanyContext();
  const { employee, filter: employeeFilter } = useEmployeeQueryFilter();

  const config: CrmManagementConfig<LeaveAllocationRow> = useMemo(
    () => ({
      title: "Leave Allocations",
      subtitle: "Annual/period leave balances allocated per employee",
      icon: <CalendarPlus2 className="h-5 w-5" />,
      doctype: "Leave Allocation",
      fields: ["name", "employee", "employee_name", "department", "company", "leave_type", "from_date", "to_date", "new_leaves_allocated", "total_leaves_allocated"],
      filters: [...companyFilter(company), ...employeeFilter],
      formFields: [
        { fieldname: "employee", label: "Employee", fieldtype: "Link", options: "Employee", reqd: true },
        { fieldname: "leave_type", label: "Leave Type", fieldtype: "Link", options: "Leave Type", reqd: true },
        { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
        { fieldname: "from_date", label: "From Date", fieldtype: "Date", reqd: true },
        { fieldname: "to_date", label: "To Date", fieldtype: "Date", reqd: true },
        { fieldname: "new_leaves_allocated", label: "New Leaves Allocated", fieldtype: "Float" },
      ],
      defaults: { company, employee: employee ?? undefined },
      kanbanField: "leave_type",
      searchField: "employee_name",
      statusField: "leave_type",
      columns,
      rowName: (r) => r.employee_name || r.employee || r.name,
      rowSubtitle: (r) => `${r.leave_type ?? ""} · ${formatDate(r.from_date)} – ${formatDate(r.to_date)}`,
      emptyTitle: "No leave allocations",
      emptyDescription: "Allocate leave balances to see them here",
      newLabel: "New Leave Allocation",
    }),
    [company, employee],
  );

  return <CrmManagementPage config={config} />;
}
