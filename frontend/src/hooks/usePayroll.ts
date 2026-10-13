import { useFrappeGetDoc, useFrappeDeleteDoc } from "frappe-react-sdk";

export interface SalaryDetailRow {
  salary_component: string;
  abbr?: string;
  amount?: number;
  default_amount?: number;
}

export interface SalarySlipDoc {
  name: string;
  employee?: string;
  employee_name?: string;
  company?: string;
  department?: string;
  designation?: string;
  branch?: string;
  posting_date?: string;
  start_date?: string;
  end_date?: string;
  salary_structure?: string;
  payroll_entry?: string;
  currency?: string;
  status?: string;
  docstatus?: number;
  payment_days?: number;
  total_working_days?: number;
  leave_without_pay?: number;
  absent_days?: number;
  gross_pay?: number;
  total_deduction?: number;
  net_pay?: number;
  earnings?: SalaryDetailRow[];
  deductions?: SalaryDetailRow[];
}

/** Single Salary Slip fetch, including its `earnings`/`deductions` child tables — `get_doc` returns those nested, unlike the flat list query the management page uses. */
export function useSalarySlip(name?: string) {
  return useFrappeGetDoc<SalarySlipDoc>(
    "Salary Slip",
    name ?? undefined,
    name ? `micromax.payroll.salary-slip.${name}` : null,
  );
}

export function useSalarySlipDelete() {
  const del = useFrappeDeleteDoc();
  return { deleteDoc: (name: string) => del.deleteDoc("Salary Slip", name), loading: del.loading };
}
