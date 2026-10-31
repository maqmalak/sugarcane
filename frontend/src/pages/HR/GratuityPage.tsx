import { useMemo } from "react";
import { Award, CheckCircle2, Clock } from "lucide-react";
import { CrmManagementPage, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import type { ColumnDef } from "@/components/tables/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { formatMoney } from "@/utils/currency";
import { formatDate, todayISO } from "@/utils/dates";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { useEmployeeQueryFilter } from "@/hooks/useEmployeeQueryFilter";

interface GratuityRow {
  name: string;
  employee?: string;
  employee_name?: string;
  department?: string;
  posting_date?: string;
  company?: string;
  gratuity_rule?: string;
  amount?: number;
  paid_amount?: number;
  status?: string;
}

const STATUSES = ["Draft", "Unpaid", "Paid", "Submitted", "Cancelled"];

const columns: ColumnDef<GratuityRow>[] = [
  { key: "posting_date", label: "Date", render: (r) => <span className="text-sm">{formatDate(r.posting_date)}</span> },
  { key: "gratuity_rule", label: "Rule", getValue: (r) => r.gratuity_rule },
  { key: "amount", label: "Amount", align: "right", render: (r) => <span className="text-sm">{formatMoney(r.amount)}</span> },
  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, getValue: (r) => r.status },
];

export default function GratuityPage() {
  const { company } = useCompanyContext();
  const { employee, filter: employeeFilter } = useEmployeeQueryFilter();

  const config: CrmManagementConfig<GratuityRow> = useMemo(
    () => ({
      title: "Gratuity",
      subtitle: "End-of-service gratuity payments",
      icon: <Award className="h-5 w-5" />,
      doctype: "Gratuity",
      fields: ["name", "employee", "employee_name", "department", "posting_date", "company", "gratuity_rule", "amount", "paid_amount", "status"],
      filters: [...companyFilter(company), ...employeeFilter],
      formFields: [
        { fieldname: "employee", label: "Employee", fieldtype: "Link", options: "Employee", reqd: true },
        { fieldname: "posting_date", label: "Posting Date", fieldtype: "Date", reqd: true },
        { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
        { fieldname: "gratuity_rule", label: "Gratuity Rule", fieldtype: "Link", options: "Gratuity Rule", reqd: true },
        { fieldname: "amount", label: "Total Amount", fieldtype: "Currency", reqd: true },
      ],
      defaults: { company, posting_date: todayISO(), status: "Draft", employee: employee ?? undefined },
      kanbanField: "status",
      kanbanColumns: STATUSES.map((s) => ({ value: s })),
      searchField: "employee_name",
      statusField: "status",
      statusOptions: STATUSES,
      columns,
      stats: (rows) => [
        { label: "Total", value: rows.length, icon: <Award className="h-4 w-4" />, tone: "sky" },
        { label: "Paid", value: rows.filter((r) => r.status === "Paid").length, icon: <CheckCircle2 className="h-4 w-4" />, tone: "emerald" },
        { label: "Unpaid", value: rows.filter((r) => r.status === "Unpaid").length, icon: <Clock className="h-4 w-4" />, tone: "amber" },
      ],
      rowName: (r) => r.employee_name || r.employee || r.name,
      rowSubtitle: (r) => formatDate(r.posting_date),
      emptyTitle: "No gratuity records",
      emptyDescription: "Gratuity payments will appear here",
      newLabel: "New Gratuity",
    }),
    [company, employee],
  );

  return <CrmManagementPage config={config} />;
}
