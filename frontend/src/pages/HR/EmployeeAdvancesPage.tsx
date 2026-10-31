import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, CheckCircle2, Clock } from "lucide-react";
import { CrmManagementPage, type CrmManagementConfig } from "@/components/crm/CrmManagementPage";
import type { ColumnDef } from "@/components/tables/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { formatMoney } from "@/utils/currency";
import { formatDate, todayISO } from "@/utils/dates";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { useEmployeeQueryFilter } from "@/hooks/useEmployeeQueryFilter";

interface EmployeeAdvanceRow {
  name: string;
  employee?: string;
  employee_name?: string;
  posting_date?: string;
  company?: string;
  currency?: string;
  purpose?: string;
  advance_amount?: number;
  paid_amount?: number;
  pending_amount?: number;
  status?: string;
  return_amount?: number;
  mm_is_loan?: number;
  mm_installment_months?: number;
  mm_monthly_installment?: number;
}

const STATUSES = ["Draft", "Paid", "Partially Paid", "Unpaid", "Claimed", "Returned", "Partly Claimed and Returned", "Cancelled"];

const columns: ColumnDef<EmployeeAdvanceRow>[] = [
  { key: "posting_date", label: "Date", render: (r) => <span className="text-sm">{formatDate(r.posting_date)}</span> },
  { key: "purpose", label: "Purpose", render: (r) => <span className="truncate text-sm text-muted-foreground">{r.purpose || "—"}</span> },
  { key: "advance_amount", label: "Advance", align: "right", render: (r) => <span className="text-sm">{formatMoney(r.advance_amount, r.currency)}</span> },
  {
    key: "mm_is_loan", label: "Loan", getValue: (r) => (r.mm_is_loan ? "Loan" : "Advance"),
    render: (r) => r.mm_is_loan
      ? <span className="text-xs"><span className="rounded bg-indigo-500/10 px-1.5 py-0.5 font-medium text-indigo-600 dark:text-indigo-400">Loan</span>
          <span className="ml-1.5 text-muted-foreground">{r.mm_installment_months} × {formatMoney(r.mm_monthly_installment, r.currency)}</span></span>
      : <span className="text-xs text-muted-foreground">Advance</span>,
  },
  { key: "return_amount", label: "Repaid", align: "right", render: (r) => <span className="text-sm">{formatMoney(r.return_amount, r.currency)}</span> },
  { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, getValue: (r) => r.status },
];

export default function EmployeeAdvancesPage() {
  const { company } = useCompanyContext();
  const navigate = useNavigate();
  const { employee, filter: employeeFilter } = useEmployeeQueryFilter();

  const config: CrmManagementConfig<EmployeeAdvanceRow> = useMemo(
    () => ({
      title: "Employee Advances",
      subtitle: "Cash advances given to employees",
      icon: <Wallet className="h-5 w-5" />,
      doctype: "Employee Advance",
      fields: ["name", "employee", "employee_name", "posting_date", "company", "currency", "purpose", "advance_amount", "paid_amount", "pending_amount", "status", "mm_is_loan", "mm_installment_months", "mm_monthly_installment", "return_amount"],
      filters: [...companyFilter(company), ...employeeFilter],
      formFields: [
        { fieldname: "employee", label: "Employee", fieldtype: "Link", options: "Employee", reqd: true },
        { fieldname: "posting_date", label: "Posting Date", fieldtype: "Date", reqd: true },
        { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
        { fieldname: "currency", label: "Currency", fieldtype: "Link", options: "Currency", reqd: true },
        { fieldname: "purpose", label: "Purpose", fieldtype: "Text", reqd: true },
        { fieldname: "advance_amount", label: "Advance Amount", fieldtype: "Currency", reqd: true },
        { fieldname: "mm_is_loan", label: "Salary loan (repay in instalments from salary)", fieldtype: "Check" },
        { fieldname: "mm_installment_months", label: "Instalments (months)", fieldtype: "Int" },
        { fieldname: "mm_guarantor", label: "Guarantor", fieldtype: "Link", options: "Employee" },
      ],
      onOpen: (r) => navigate(`/hr/advances/${encodeURIComponent(r.name)}`),
      defaults: { company, posting_date: todayISO(), status: "Draft", employee: employee ?? undefined },
      kanbanField: "status",
      kanbanColumns: STATUSES.map((s) => ({ value: s })),
      searchField: "employee_name",
      statusField: "status",
      statusOptions: STATUSES,
      columns,
      stats: (rows) => [
        { label: "Total", value: rows.length, icon: <Wallet className="h-4 w-4" />, tone: "sky" },
        { label: "Paid", value: rows.filter((r) => r.status === "Paid").length, icon: <CheckCircle2 className="h-4 w-4" />, tone: "emerald" },
        { label: "Pending", value: rows.filter((r) => r.status === "Unpaid" || r.status === "Draft").length, icon: <Clock className="h-4 w-4" />, tone: "amber" },
      ],
      rowName: (r) => r.employee_name || r.employee || r.name,
      rowSubtitle: (r) => r.purpose,
      emptyTitle: "No employee advances",
      emptyDescription: "Employee cash advances will appear here",
      newLabel: "New Employee Advance",
    }),
    [company, employee, navigate],
  );

  return <CrmManagementPage config={config} />;
}
