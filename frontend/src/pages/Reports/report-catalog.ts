import {
  BarChart3, BookOpen, Boxes, CalendarClock, CalendarDays, ClipboardList, FileSpreadsheet, HandCoins, Hourglass,
  Landmark, PackageSearch, Receipt, Scale, ScrollText, ShoppingCart, TrendingUp, Truck, Users2, Wallet, Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { FormFieldMeta } from "@/components/forms/field-primitives";
import { todayISO } from "@/utils/dates";

/** Filter values for a report run (company + dates prefilled from the current context). */
export type ReportFilters = Record<string, unknown>;

export interface ReportCard {
  /** URL key: /reports/run/<key> */
  key: string;
  /** The Frappe Report it runs (also used to check it exists here and the user may run it). */
  report: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** A dedicated React page for this report, instead of the generic runner. */
  to?: string;
  /** Filter boxes for the generic runner (FrappeForm field metas). */
  filters?: FormFieldMeta[];
  /** Initial filter values. */
  defaults?: (ctx: { company?: string }) => ReportFilters;
}

export interface ReportGroup {
  title: string;
  reports: ReportCard[];
}

/** Start of the current fiscal year (Jul–Jun, as configured for these sites). */
export function fiscalYearStart(today = todayISO()): string {
  const [y, m] = today.split("-").map(Number);
  return `${m >= 7 ? y : y - 1}-07-01`;
}

const company: FormFieldMeta = { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true };
const fromDate: FormFieldMeta = { fieldname: "from_date", label: "From Date", fieldtype: "Date", reqd: true };
const toDate: FormFieldMeta = { fieldname: "to_date", label: "To Date", fieldtype: "Date", reqd: true };
const col: FormFieldMeta = { fieldname: "col_break_filters", fieldtype: "Column Break" };

const period = (ctx: { company?: string }): ReportFilters => ({ company: ctx.company, from_date: fiscalYearStart(), to_date: todayISO() });
const periodFilters = [company, col, fromDate, toDate];

const ageingFilters: FormFieldMeta[] = [
  company,
  { fieldname: "report_date", label: "As On", fieldtype: "Date", reqd: true },
  col,
  { fieldname: "ageing_based_on", label: "Ageing Based On", fieldtype: "Select", options: "Due Date\nPosting Date" },
  { fieldname: "range", label: "Ageing Ranges (days)", fieldtype: "Data", description: "Comma-separated, e.g. 30, 60, 90, 120" },
];
const ageing = (ctx: { company?: string }): ReportFilters => ({ company: ctx.company, report_date: todayISO(), ageing_based_on: "Due Date", range: "30, 60, 90, 120" });

const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

/** The reports hub: dedicated React pages (`to`) and standard ERPNext / HRMS reports run generically. */
export const REPORT_GROUPS: ReportGroup[] = [
  {
    title: "Financial Statements",
    reports: [
      { key: "general-ledger", report: "General Ledger", title: "General Ledger", description: "Every posting by account, party and voucher, with running balances.", icon: BookOpen, to: "/accounting/reports/general-ledger" },
      { key: "trial-balance", report: "Trial Balance", title: "Trial Balance", description: "Opening, period debits / credits and closing balance of every account.", icon: Scale, to: "/accounting/reports/trial-balance" },
      { key: "profit-and-loss", report: "Profit and Loss Statement", title: "Profit and Loss", description: "Income and expenses for the period, with net profit.", icon: TrendingUp, to: "/accounting/reports/profit-and-loss" },
      { key: "balance-sheet", report: "Balance Sheet", title: "Balance Sheet", description: "Assets, liabilities and equity as on a date.", icon: Landmark, to: "/accounting/reports/balance-sheet" },
      { key: "bank-reconciliation-statement", report: "Bank Reconciliation Statement", title: "Bank Reconciliation Statement",
        description: "Bank balance per books vs per bank statement, with cheques issued but not yet cleared.", icon: Landmark,
        filters: [company, { fieldname: "account", label: "Bank Account (ledger)", fieldtype: "Link", options: "Account", reqd: true },
          { fieldname: "report_date", label: "Date", fieldtype: "Date", reqd: true }, { fieldname: "include_pos_transactions", label: "Include POS Transactions", fieldtype: "Check" }],
        defaults: ({ company: c }) => ({ company: c, report_date: todayISO() }) },
      { key: "cash-flow", report: "Cash Flow", title: "Cash Flow", description: "Cash from operating, investing and financing activities.", icon: Wallet, to: "/accounting/reports/cash-flow" },
    ],
  },
  {
    title: "Receivables & Payables",
    reports: [
      { key: "accounts-receivable", report: "Accounts Receivable", title: "Accounts Receivable", description: "Outstanding customer invoices by age bucket.", icon: HandCoins, filters: ageingFilters, defaults: ageing },
      { key: "accounts-receivable-summary", report: "Accounts Receivable Summary", title: "Receivable Summary", description: "Outstanding per customer, by age bucket.", icon: Users2, filters: ageingFilters, defaults: ageing },
      { key: "accounts-payable", report: "Accounts Payable", title: "Accounts Payable", description: "Outstanding supplier bills by age bucket.", icon: Receipt, filters: ageingFilters, defaults: ageing },
      { key: "accounts-payable-summary", report: "Accounts Payable Summary", title: "Payable Summary", description: "Outstanding per supplier, by age bucket.", icon: Users2, filters: ageingFilters, defaults: ageing },
      { key: "customer-ledger-summary", report: "Customer Ledger Summary", title: "Customer Ledger Summary", description: "Opening, invoiced, paid and closing balance per customer.", icon: ScrollText, filters: periodFilters, defaults: period },
      { key: "supplier-ledger-summary", report: "Supplier Ledger Summary", title: "Supplier Ledger Summary", description: "Opening, billed, paid and closing balance per supplier.", icon: ScrollText, filters: periodFilters, defaults: period },
    ],
  },
  {
    title: "Selling",
    reports: [
      { key: "sales-register", report: "Sales Register", title: "Sales Register", description: "Sales invoices with taxes and totals for the period.", icon: FileSpreadsheet, filters: periodFilters, defaults: period },
      { key: "item-wise-sales-register", report: "Item-wise Sales Register", title: "Item-wise Sales Register", description: "Every invoiced item line, with quantity, rate and amount.", icon: ClipboardList, filters: periodFilters, defaults: period },
      { key: "sales-order-analysis", report: "Sales Order Analysis", title: "Sales Order Analysis", description: "Ordered, delivered, billed and pending quantities per order.", icon: ShoppingCart, filters: periodFilters, defaults: period },
      {
        key: "gross-profit", report: "Gross Profit", title: "Gross Profit", description: "Selling vs buying cost and margin per invoice.", icon: BarChart3,
        filters: [...periodFilters, { fieldname: "group_by", label: "Group By", fieldtype: "Select", options: "Invoice\nItem Code\nItem Group\nCustomer\nCustomer Group\nTerritory\nSales Person" }],
        defaults: (ctx) => ({ ...period(ctx), group_by: "Invoice" }),
      },
    ],
  },
  {
    title: "Buying",
    reports: [
      { key: "purchase-register", report: "Purchase Register", title: "Purchase Register", description: "Purchase invoices with taxes and totals for the period.", icon: FileSpreadsheet, filters: periodFilters, defaults: period },
      { key: "item-wise-purchase-register", report: "Item-wise Purchase Register", title: "Item-wise Purchase Register", description: "Every billed item line, with quantity, rate and amount.", icon: ClipboardList, filters: periodFilters, defaults: period },
      { key: "purchase-order-analysis", report: "Purchase Order Analysis", title: "Purchase Order Analysis", description: "Ordered, received, billed and pending quantities per order.", icon: Truck, filters: periodFilters, defaults: period },
    ],
  },
  {
    title: "Stock",
    reports: [
      { key: "stock-ledger", report: "Stock Ledger", title: "Stock Ledger", description: "Every stock movement with running quantity and value.", icon: Boxes, to: "/inventory/reports/stock-ledger" },
      { key: "stock-balance", report: "Stock Balance", title: "Stock Balance", description: "Opening, in, out and closing quantity and value per item and warehouse.", icon: Warehouse, filters: periodFilters, defaults: period },
      { key: "stock-projected-qty", report: "Stock Projected Qty", title: "Projected Stock", description: "Actual, ordered, reserved and projected quantity per item.", icon: PackageSearch, filters: [company], defaults: (ctx) => ({ company: ctx.company }) },
      {
        key: "stock-ageing", report: "Stock Ageing", title: "Stock Ageing", description: "How long stock has been held, by age bucket.", icon: Hourglass,
        filters: [company, col, { fieldname: "to_date", label: "As On", fieldtype: "Date", reqd: true }, { fieldname: "range", label: "Ageing Ranges (days)", fieldtype: "Data" }],
        defaults: (ctx) => ({ company: ctx.company, to_date: todayISO(), range: "30, 60, 90" }),
      },
    ],
  },
  {
    title: "HR & Payroll",
    reports: [
      {
        key: "monthly-attendance-sheet", report: "Monthly Attendance Sheet", title: "Monthly Attendance Sheet", description: "Each employee's attendance for every day of a month.", icon: CalendarDays,
        filters: [company, col, { fieldname: "month", label: "Month", fieldtype: "Select", options: MONTHS.join("\n"), reqd: true }, { fieldname: "year", label: "Year", fieldtype: "Data", reqd: true }],
        defaults: (ctx) => ({ company: ctx.company, filter_based_on: "Month", month: String(Number(todayISO().slice(5, 7))), year: todayISO().slice(0, 4) }),
      },
      { key: "employee-leave-balance", report: "Employee Leave Balance", title: "Employee Leave Balance", description: "Leave allocated, taken and remaining per employee and leave type.", icon: CalendarClock, filters: periodFilters, defaults: period },
      {
        key: "salary-register", report: "Salary Register", title: "Salary Register", description: "Earnings, deductions and net pay per salary slip.", icon: Wallet,
        filters: periodFilters,
        defaults: (ctx) => ({ ...period(ctx), docstatus: "Submitted", currency: "PKR" }),
      },
    ],
  },
];

export const ALL_REPORTS: ReportCard[] = REPORT_GROUPS.flatMap((g) => g.reports);
export const reportByKey = (key?: string) => ALL_REPORTS.find((r) => r.key === key);
