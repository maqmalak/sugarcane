import { useMemo } from "react";
import { Receipt, CheckCircle2, XCircle, Clock } from "lucide-react";
import { CrmManagementPage, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import type { ColumnDef } from "@/components/tables/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { formatMoney } from "@/utils/currency";
import { formatDate, todayISO } from "@/utils/dates";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { useEmployeeQueryFilter } from "@/hooks/useEmployeeQueryFilter";

interface ExpenseClaimRow {
  name: string;
  employee?: string;
  employee_name?: string;
  department?: string;
  company?: string;
  currency?: string;
  posting_date?: string;
  grand_total?: number;
  total_claimed_amount?: number;
  total_amount_reimbursed?: number;
  approval_status?: string;
  status?: string;
  remark?: string;
}

const STATUSES = ["Draft", "Paid", "Unpaid", "Rejected", "Submitted", "Cancelled"];

const columns: ColumnDef<ExpenseClaimRow>[] = [
  { key: "posting_date", label: "Date", render: (r) => <span className="text-sm">{formatDate(r.posting_date)}</span> },
  { key: "grand_total", label: "Amount", align: "right", render: (r) => <span className="text-sm">{formatMoney(r.grand_total, r.currency)}</span> },
  { key: "approval_status", label: "Approval", render: (r) => <StatusBadge status={r.approval_status} /> },
  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, getValue: (r) => r.status },
];

export default function ExpenseClaimsPage() {
  const { company } = useCompanyContext();
  const { employee, filter: employeeFilter } = useEmployeeQueryFilter();

  const config: CrmManagementConfig<ExpenseClaimRow> = useMemo(
    () => ({
      title: "Expense Claims",
      subtitle: "Employee expense reimbursement claims",
      icon: <Receipt className="h-5 w-5" />,
      doctype: "Expense Claim",
      fields: [
        "name", "employee", "employee_name", "department", "company", "currency", "posting_date",
        "grand_total", "total_claimed_amount", "total_amount_reimbursed", "approval_status", "status", "remark",
      ],
      filters: [...companyFilter(company), ...employeeFilter],
      formFields: [
        { fieldname: "employee", label: "Employee", fieldtype: "Link", options: "Employee", reqd: true },
        { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
        { fieldname: "currency", label: "Currency", fieldtype: "Link", options: "Currency", reqd: true },
        { fieldname: "posting_date", label: "Posting Date", fieldtype: "Date", reqd: true },
        { fieldname: "remark", label: "Remark", fieldtype: "Text" },
        { fieldname: "status", label: "Status", fieldtype: "Select", options: STATUSES.join("\n"), default: "Draft" },
      ],
      defaults: { company, status: "Draft", posting_date: todayISO(), employee: employee ?? undefined },
      kanbanField: "status",
      kanbanColumns: STATUSES.map((s) => ({ value: s })),
      searchField: "employee_name",
      statusField: "status",
      statusOptions: STATUSES,
      columns,
      stats: (rows) => [
        { label: "Total", value: rows.length, icon: <Receipt className="h-4 w-4" />, tone: "sky" },
        { label: "Paid", value: rows.filter((r) => r.status === "Paid").length, icon: <CheckCircle2 className="h-4 w-4" />, tone: "emerald" },
        { label: "Unpaid", value: rows.filter((r) => r.status === "Unpaid").length, icon: <Clock className="h-4 w-4" />, tone: "amber" },
        { label: "Rejected", value: rows.filter((r) => r.status === "Rejected").length, icon: <XCircle className="h-4 w-4" />, tone: "rose" },
      ],
      rowName: (r) => r.employee_name || r.employee || r.name,
      rowSubtitle: (r) => formatDate(r.posting_date),
      emptyTitle: "No expense claims",
      emptyDescription: "Expense claims will appear here",
      newLabel: "New Expense Claim",
    }),
    [company, employee],
  );

  return <CrmManagementPage config={config} />;
}
