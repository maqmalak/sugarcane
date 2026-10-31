import { StatusBadge } from "@/components/common/status-badge";
import { PlayCircle, PlusCircle, CalendarRange, Percent, Users2 } from "lucide-react";
import type { ChildTableSpec, DocConfig } from "@/components/doc/doc-config";
import {
  sec, colBreak, data, date, float, currency, check, link, select, ro, req, when,
  nameCol, textCol, dateCol, moneyCol, docstatusCol, yesNoCol, numCol, fmt,
} from "@/components/doc/doc-helpers";
import { getLinkedValues } from "@/hooks/useDoc";
import { getCall } from "@/services/frappe";
import { endOfMonthISO, formatDate, startOfMonthISO, todayISO } from "@/utils/dates";
import { formatMoney } from "@/utils/currency";
import { asNumber } from "@/utils/cn";
import { PayrollEntryDefaults, PayrollRunPanel } from "./PayrollPanels";
import { PayrollRunInsights } from "./PayrollRunInsights";

/** Older entries never got a `status` — derive it from docstatus. */
export const entryStatus = (r: { status?: string; docstatus?: number }) => r.status || ["Draft", "Submitted", "Cancelled"][r.docstatus ?? 0];

/** Compact period for a summary card (the page title already carries the full dates): "Jun 2027" for a whole
 *  calendar month, otherwise "1–15 Jun 27" / "28 Jun – 4 Jul 27". */
function shortPeriod(start?: string, end?: string) {
  if (!start) return "—";
  const s = new Date(`${start}T00:00:00`);
  const e = end ? new Date(`${end}T00:00:00`) : s;
  const lastOfMonth = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
  if (s.getDate() === 1 && e.getDate() === lastOfMonth && s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return s.toLocaleString("en-US", { month: "short", year: "numeric" });
  }
  const mon = (d: Date) => d.toLocaleString("en-US", { month: "short" });
  const yy = `${String(e.getFullYear()).slice(2)}`;
  return s.getMonth() === e.getMonth() ? `${s.getDate()}–${e.getDate()} ${mon(e)} ${yy}` : `${s.getDate()} ${mon(s)} – ${e.getDate()} ${mon(e)} ${yy}`;
}

const FREQUENCIES = ["", "Monthly", "Fortnightly", "Bimonthly", "Weekly", "Daily"];

/** HRMS works out the period end from its start and the payroll frequency. */
async function endDateFor(start?: string, frequency?: string) {
  if (!start || !frequency) return undefined;
  try {
    const r = await getCall<{ end_date?: string }>("hrms.payroll.doctype.payroll_entry.payroll_entry.get_end_date", { start_date: start, frequency });
    return r?.end_date ? { end_date: r.end_date } : undefined;
  } catch {
    return undefined;
  }
}

/* ============================================================================ Payroll Entry */

const PAYROLL_EMPLOYEES: ChildTableSpec = {
  key: "employees",
  label: "Employees",
  description: "Filled by “Get employees” in the payroll run below.",
  doctype: "Payroll Employee Detail",
  columns: [link("employee", "Employee", "Employee"), ro(data("employee_name", "Name")), ro(link("department", "Department", "Department")), ro(data("designation", "Designation")), check("is_salary_withheld", "Withheld")],
  readOnly: true,
  wide: true,
};

export const PAYROLL_ENTRY_CONFIG: DocConfig = {
  doctype: "Payroll Entry",
  base: "/payroll/entries",
  singular: "Payroll Entry",
  plural: "Payroll Entries",
  subtitle: "Payroll runs — fetch employees, create and submit salary slips, then pay",
  icon: PlayCircle,
  submittable: true,
  listFields: ["name", "posting_date", "payroll_frequency", "start_date", "end_date", "department", "branch", "number_of_employees", "status", "docstatus", "modified"],
  columns: [
    nameCol("Payroll Entry", (r) => `${formatDate(r.start_date)} – ${formatDate(r.end_date)}`),
    textCol("payroll_frequency", "Frequency"),
    textCol("branch", "Branch"),
    textCol("department", "Department"),
    numCol("number_of_employees", "Employees", 0),
    { key: "status", label: "Status", render: (r) => <StatusBadge status={entryStatus(r)} /> },
  ],
  searchFields: ["name", "department", "branch"],
  statusField: "status",
  statuses: ["Draft", "Queued", "Submitted", "Failed", "Cancelled"],
  dateField: "posting_date",
  dateLabel: "Posting date",
  sort: { key: "posting_date", dir: "desc" },
  filters: [
    { field: "branch", label: "Branch", optionsFrom: "Branch" },
    { field: "department", label: "Department", optionsFrom: "Department" },
  ],
  fields: [
    sec("Payroll period"),
    req(date("posting_date", "Posting Date")),
    req(link("company", "Company", "Company")),
    req(link("currency", "Currency", "Currency")),
    when(req(float("exchange_rate", "Exchange Rate")), (v) => Boolean(v.currency) && v.currency !== "PKR"),
    colBreak(),
    select("payroll_frequency", "Payroll Frequency", FREQUENCIES),
    req(date("start_date", "Start Date")),
    req(date("end_date", "End Date")),
    sec("Which employees"),
    link("branch", "Branch", "Branch"),
    link("department", "Department", "Department"),
    colBreak(),
    link("designation", "Designation", "Designation"),
    link("grade", "Employee Grade", "Employee Grade"),
    colBreak(),
    check("validate_attendance", "Validate Attendance"),
    check("salary_slip_based_on_timesheet", "Salary Slip Based on Timesheet"),
    sec("Accounting"),
    req(link("payroll_payable_account", "Payroll Payable Account", "Account")),
    req(link("cost_center", "Cost Center", "Cost Center")),
    colBreak(),
    link("payment_account", "Payment Account", "Account"),
    link("bank_account", "Bank Account", "Bank Account"),
    link("project", "Project", "Project"),
    when(ro(data("error_message", "Error")), (v) => v.status === "Failed"),
  ],
  children: [PAYROLL_EMPLOYEES],
  defaults: ({ company }) => ({
    company,
    posting_date: todayISO(),
    payroll_frequency: "Monthly",
    start_date: startOfMonthISO(),
    end_date: endOfMonthISO(),
    exchange_rate: 1,
  }),
  linkEffects: {
    start_date: (v, values) => endDateFor(v, values.payroll_frequency),
    payroll_frequency: (v, values) => endDateFor(values.start_date, v),
    company: async (company) => {
      const c = await getLinkedValues("Company", company, ["default_currency", "default_payroll_payable_account", "cost_center"]);
      return { currency: c.default_currency, payroll_payable_account: c.default_payroll_payable_account, cost_center: c.cost_center, exchange_rate: 1 };
    },
  },
  summary: (v, rows) => [
    { label: "Period", value: shortPeriod(v.start_date, v.end_date), tone: "sky" },
    { label: "Employees", value: (rows.employees ?? []).length || asNumber(v.number_of_employees), tone: "indigo" },
    { label: "Frequency", value: v.payroll_frequency || "—", tone: "teal" },
  ],
  titleOf: (v) => (v.start_date ? `${v.payroll_frequency || "Payroll"} run · ${formatDate(v.start_date)} – ${formatDate(v.end_date)}` : "New payroll run"),
  // The run checklist sits above the form so it isn't buried under a long employee table.
  tabPanels: {
    Details: {
      before: (ctx) =>
        ctx.isNew ? (
          <PayrollEntryDefaults ctx={ctx} />
        ) : (
          <>
            <PayrollRunPanel ctx={ctx} />
            {ctx.docstatus === 1 && ctx.name && <PayrollRunInsights name={ctx.name} />}
          </>
        ),
    },
  },
  omitOnSave: ["number_of_employees", "status", "salary_slips_created", "salary_slips_submitted"],
};

/* ============================================================================ Additional Salary */

export const ADDITIONAL_SALARY_CONFIG: DocConfig = {
  doctype: "Additional Salary",
  base: "/payroll/additional-salary",
  singular: "Additional Salary",
  plural: "Additional Salaries",
  subtitle: "One-off or recurring bonuses, arrears, overtime and deductions added to salary slips",
  icon: PlusCircle,
  submittable: true,
  listFields: ["name", "employee", "employee_name", "salary_component", "type", "amount", "currency", "payroll_date", "is_recurring", "from_date", "to_date", "docstatus", "modified"],
  columns: [
    nameCol("Employee", (r) => r.employee_name),
    textCol("salary_component", "Component"),
    textCol("type", "Type"),
    { key: "amount", label: "Amount", align: "right", getValue: (r) => asNumber(r.amount), render: (r) => formatMoney(r.amount, r.currency) },
    { key: "payroll_date", label: "Payroll Date", render: (r) => (r.is_recurring ? `${formatDate(r.from_date)} – ${formatDate(r.to_date)}` : formatDate(r.payroll_date)) },
    docstatusCol(),
  ],
  searchFields: ["name", "employee", "employee_name", "salary_component"],
  dateField: "payroll_date",
  dateLabel: "Payroll date",
  sort: { key: "modified", dir: "desc" },
  filters: [
    { field: "type", label: "Type", options: ["Earning", "Deduction"] },
    { field: "salary_component", label: "Component", optionsFrom: "Salary Component" },
  ],
  fields: [
    sec("Employee"),
    select("naming_series", "Series", ["HR-ADS-.YY.-.MM.-"]),
    req(link("employee", "Employee", "Employee")),
    ro(data("employee_name", "Employee Name")),
    ro(link("department", "Department", "Department")),
    colBreak(),
    req(link("company", "Company", "Company")),
    req(link("currency", "Currency", "Currency")),
    sec("Amount"),
    req(link("salary_component", "Salary Component", "Salary Component")),
    ro(data("type", "Type")),
    req(currency("amount", "Amount")),
    colBreak(),
    check("is_recurring", "Is Recurring"),
    when(date("payroll_date", "Payroll Date"), (v) => !v.is_recurring),
    when(date("from_date", "From Date"), (v) => Boolean(v.is_recurring)),
    when(date("to_date", "To Date"), (v) => Boolean(v.is_recurring)),
    check("overwrite_salary_structure_amount", "Overwrite Salary Structure Amount"),
    check("deduct_full_tax_on_selected_payroll_date", "Deduct Full Tax on Selected Payroll Date"),
  ],
  defaults: ({ company, params }) => ({ company, naming_series: "HR-ADS-.YY.-.MM.-", payroll_date: todayISO(), overwrite_salary_structure_amount: 1, employee: params.get("employee") ?? undefined }),
  linkEffects: {
    employee: async (emp) => {
      const e = await getLinkedValues("Employee", emp, ["employee_name", "department", "company", "salary_currency"]);
      return { employee_name: e.employee_name, department: e.department, ...(e.company ? { company: e.company } : {}), ...(e.salary_currency ? { currency: e.salary_currency } : {}) };
    },
    salary_component: async (c) => {
      const s = await getLinkedValues("Salary Component", c, ["type"]);
      return { type: s.type };
    },
    company: async (company, v) => {
      if (v.currency) return undefined;
      const c = await getLinkedValues("Company", company, ["default_currency"]);
      return { currency: c.default_currency };
    },
  },
  summary: (v) => [
    { label: "Employee", value: v.employee_name || v.employee || "—", tone: "sky" },
    { label: "Component", value: v.salary_component || "—", tone: "indigo" },
    { label: "Type", value: v.type || "—", tone: v.type === "Deduction" ? "rose" : "emerald" },
    { label: "Amount", value: formatMoney(asNumber(v.amount), v.currency), tone: "amber" },
  ],
  titleOf: (v) => [v.employee_name, v.salary_component].filter(Boolean).join(" · "),
};

/* ============================================================================ Payroll Period */

export const PAYROLL_PERIOD_CONFIG: DocConfig = {
  doctype: "Payroll Period",
  base: "/payroll/periods",
  singular: "Payroll Period",
  plural: "Payroll Periods",
  subtitle: "Tax years for income tax projection, split into payroll months",
  icon: CalendarRange,
  listFields: ["name", "company", "start_date", "end_date", "modified"],
  columns: [nameCol("Payroll Period"), dateCol("start_date", "Start"), dateCol("end_date", "End")],
  searchFields: ["name"],
  sort: { key: "start_date", dir: "desc" },
  fields: [
    sec("Payroll Period"),
    when(req(data("__newname", "Name")), (v) => !v.name),
    req(link("company", "Company", "Company")),
    colBreak(),
    req(date("start_date", "Start Date")),
    req(date("end_date", "End Date")),
  ],
  children: [
    {
      key: "periods",
      label: "Payroll Months",
      description: "Optional — the sub-periods within the year.",
      doctype: "Payroll Period Date",
      columns: [req(date("start_date", "Start Date")), req(date("end_date", "End Date"))],
    },
  ],
  defaults: ({ company }) => {
    const y = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    return { company, __newname: `FY ${y}-${String(y + 1).slice(2)}`, start_date: `${y}-07-01`, end_date: `${y + 1}-06-30` };
  },
};

/* ============================================================================ Income Tax Slab */

export const INCOME_TAX_SLAB_CONFIG: DocConfig = {
  doctype: "Income Tax Slab",
  base: "/payroll/income-tax-slabs",
  singular: "Income Tax Slab",
  plural: "Income Tax Slabs",
  subtitle: "Annual taxable-income bands and rates used to deduct income tax from salaries",
  icon: Percent,
  submittable: true,
  listFields: ["name", "effective_from", "company", "currency", "standard_tax_exemption_amount", "disabled", "docstatus", "modified"],
  columns: [nameCol("Slab"), dateCol("effective_from", "Effective From"), textCol("currency", "Currency"), moneyCol("standard_tax_exemption_amount", "Std. Exemption"), yesNoCol("disabled", "Enabled", "Disabled", "Enabled"), docstatusCol()],
  searchFields: ["name"],
  sort: { key: "effective_from", dir: "desc" },
  fields: [
    sec("Slab"),
    when(req(data("__newname", "Name")), (v) => !v.name),
    req(date("effective_from", "Effective From")),
    link("company", "Company", "Company"),
    colBreak(),
    req(link("currency", "Currency", "Currency")),
    currency("standard_tax_exemption_amount", "Standard Tax Exemption Amount"),
    currency("tax_relief_limit", "Tax Relief Limit"),
    check("allow_tax_exemption", "Allow Tax Exemption"),
    check("disabled", "Disabled"),
  ],
  children: [
    {
      key: "slabs",
      label: "Taxable Salary Slabs",
      description: "Tax is percent × (annual taxable income − from amount), plus the bands below it.",
      doctype: "Taxable Salary Slab",
      columns: [req(currency("from_amount", "From Amount")), currency("to_amount", "To Amount"), req(float("percent_deduction", "Percent Deduction"))],
      minRows: 1,
      newRow: (_v, rows) => ({ from_amount: asNumber(rows[rows.length - 1]?.to_amount), percent_deduction: 0 }),
    },
  ],
  defaults: ({ company }) => ({ company, currency: "PKR", effective_from: todayISO() }),
  summary: (v, rows) => {
    const slabs = rows.slabs ?? [];
    const top = slabs.reduce((m, r) => Math.max(m, asNumber(r.percent_deduction)), 0);
    return [
      { label: "Bands", value: slabs.length, tone: "sky" },
      { label: "Tax-free up to", value: formatMoney(asNumber(slabs.find((r) => !asNumber(r.percent_deduction))?.to_amount), v.currency), tone: "emerald" },
      { label: "Top rate", value: `${fmt(top, 1)} %`, tone: "rose" },
      { label: "Effective", value: formatDate(v.effective_from), tone: "indigo" },
    ];
  },
};

/* ============================================================================ Leave Type (HR) */

export const LEAVE_TYPE_CONFIG: DocConfig = {
  doctype: "Leave Type",
  base: "/hr/leave-types",
  singular: "Leave Type",
  plural: "Leave Types",
  subtitle: "Casual, sick, annual and unpaid leave — limits, carry forward and encashment rules",
  icon: Users2,
  companyScoped: false,
  listFields: ["name", "max_leaves_allowed", "max_continuous_days_allowed", "is_carry_forward", "is_lwp", "is_earned_leave", "allow_encashment", "modified"],
  columns: [
    nameCol("Leave Type"),
    numCol("max_leaves_allowed", "Max / Year", 1),
    numCol("max_continuous_days_allowed", "Max Continuous", 0),
    yesNoCol("is_carry_forward", "Carry Forward"),
    yesNoCol("is_lwp", "Without Pay"),
    yesNoCol("is_earned_leave", "Earned"),
  ],
  searchFields: ["name"],
  sort: { key: "name", dir: "asc" },
  fields: [
    sec("Leave Type"),
    when(req(data("leave_type_name", "Leave Type Name")), (v) => !v.name),
    float("max_leaves_allowed", "Maximum Leave Allocation Allowed per Year"),
    { fieldname: "applicable_after", label: "Applicable After (Working Days)", fieldtype: "Int" },
    { fieldname: "max_continuous_days_allowed", label: "Maximum Consecutive Leaves Allowed", fieldtype: "Int" },
    colBreak(),
    check("is_lwp", "Is Leave Without Pay"),
    check("is_ppl", "Is Partially Paid Leave"),
    when(float("fraction_of_daily_salary_per_leave", "Fraction of Daily Salary per Leave"), (v) => Boolean(v.is_ppl)),
    check("is_optional_leave", "Is Optional Leave"),
    check("allow_negative", "Allow Negative Balance"),
    check("include_holiday", "Include holidays within leaves as leaves"),
    check("is_compensatory", "Is Compensatory Leave"),
    sec("Carry Forward"),
    check("is_carry_forward", "Is Carry Forward"),
    when(float("maximum_carry_forwarded_leaves", "Maximum Carry Forwarded Leaves"), (v) => Boolean(v.is_carry_forward)),
    when({ fieldname: "expire_carry_forwarded_leaves_after_days", label: "Expire Carry Forwarded Leaves (Days)", fieldtype: "Int" }, (v) => Boolean(v.is_carry_forward)),
    colBreak(),
    check("is_earned_leave", "Is Earned Leave"),
    when(select("earned_leave_frequency", "Earned Leave Frequency", ["Monthly", "Quarterly", "Half-Yearly", "Yearly"]), (v) => Boolean(v.is_earned_leave)),
    when(select("allocate_on_day", "Allocate on Day", ["First Day", "Last Day", "Date of Joining"]), (v) => Boolean(v.is_earned_leave)),
    sec("Encashment"),
    check("allow_encashment", "Allow Encashment"),
    when(link("earning_component", "Earning Component", "Salary Component"), (v) => Boolean(v.allow_encashment)),
    colBreak(),
    when({ fieldname: "max_encashable_leaves", label: "Max Encashable Leaves", fieldtype: "Int" }, (v) => Boolean(v.allow_encashment)),
    when({ fieldname: "non_encashable_leaves", label: "Non-Encashable Leaves", fieldtype: "Int" }, (v) => Boolean(v.allow_encashment)),
  ],
  defaults: () => ({ max_leaves_allowed: 0 }),
  connections: false,
};
