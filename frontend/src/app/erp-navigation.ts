/**
 * Sidebars of the ERP apps: buying & stores, selling, finance (pages from MicroMax ERP) and HR & payroll (from Baogee).
 * Built from those apps' menus, keeping only the links that have a page here. Several URL prefixes share one sidebar.
 */
import {
  ArrowLeftRight, ArrowRightLeft, Award, BadgeCheck, Banknote, BarChart3, Barcode, BookOpen, Boxes, Briefcase, Building, Building2, CalendarCheck, CalendarClock, CalendarDays, CalendarHeart, CalendarOff, CalendarPlus2, CalendarRange, ClipboardList, Clock3, Coins, CreditCard, DoorOpen, FileCheck2, FileSignature, FileSpreadsheet, FileText, GitBranch, HandCoins, Handshake, Hash, Hourglass, IdCard, Layers, LayoutDashboard, LayoutGrid, LayoutTemplate, Link2, ListChecks, ListTree, LogIn, MapIcon, MapPin, NotebookTabs, Package, Percent, PieChart, PlayCircle, PlusCircle, Quote, Receipt, Repeat, Rocket, Scale, ScanSearch, ScrollText, ShieldCheck, ShoppingCart, Sliders, Sparkles, Tag, Tags, Timer, TrendingUp, UserCircle, Users, Users2, Wallet, Warehouse, XCircle,
} from "lucide-react";
import type { NavGroup } from "@/app/navigation";

const MANAGERS = ["Cane Manager", "Cane Admin"];
const STORE_ROLES = [...MANAGERS, "Stock Manager", "Stock User", "Purchase Manager", "Purchase User", "MIS Viewer", "Accounts User"];
const SALES_ROLES = [...MANAGERS, "Sales Manager", "Sales User", "Stock Manager", "MIS Viewer", "Accounts User", "Gross Weighman", "Tare Weighman"];
const FIN_ROLES = [...MANAGERS, "Accounts Manager", "Accounts User", "MIS Viewer"];
const HR_ROLES = [...MANAGERS, "HR Manager", "HR User"];

export const STORE_NAV: NavGroup[] = [
  { title: "Purchase & stores", items: [
    { label: "Dashboard", to: "/purchase", icon: Sparkles, roles: STORE_ROLES },
  ] },
  { title: "Procurement", items: [
    { label: "Purchase Demands", to: "/import/material-requests", icon: ClipboardList, roles: STORE_ROLES },
    { label: "Inquiries (RFQ)", to: "/import/rfqs", icon: Quote, roles: STORE_ROLES },
    { label: "Supplier Quotations", to: "/import/supplier-quotations", icon: FileText, roles: STORE_ROLES },
    { label: "Purchase Orders", to: "/import/purchase-orders", icon: ShoppingCart, roles: STORE_ROLES },
  ] },
  { title: "Purchase", items: [
    { label: "Goods Receipts (GRN)", to: "/purchase/receipts", icon: Package, roles: STORE_ROLES },
    { label: "Purchase Invoices", to: "/purchase/invoices", icon: Receipt, roles: STORE_ROLES },
    { label: "Landed Cost Vouchers", to: "/purchase/landed-costs", icon: Coins, roles: STORE_ROLES },
  ] },
  { title: "Setup", items: [
    { label: "Buying Settings", to: "/purchase/settings", icon: Sliders, roles: STORE_ROLES },
  ] },
  { title: "Stock", items: [
    { label: "Stock Balance", to: "/inventory/stock", icon: Warehouse, roles: STORE_ROLES },
    { label: "Material Movement", to: "/inventory/stock-entries", icon: ArrowLeftRight, roles: STORE_ROLES },
    { label: "Stock Reconciliation", to: "/inventory/reconciliations", icon: Scale, roles: STORE_ROLES },
    { label: "Pick Lists", to: "/inventory/pick-lists", icon: ClipboardList, roles: STORE_ROLES },
    { label: "Stock Ledger", to: "/inventory/reports/stock-ledger", icon: BookOpen, roles: STORE_ROLES },
  ] },
  { title: "Stock masters", items: [
    { label: "Warehouses", to: "/inventory/warehouses", icon: Warehouse, roles: STORE_ROLES },
    { label: "Item Prices", to: "/inventory/item-prices", icon: Tag, roles: STORE_ROLES },
    { label: "Batches", to: "/inventory/batches", icon: Hash, roles: STORE_ROLES },
    { label: "Serial Numbers", to: "/inventory/serial-nos", icon: Barcode, roles: STORE_ROLES },
  ] },
  { title: "Items & suppliers", items: [
    { label: "Items", to: "/masters/items", icon: Boxes, roles: STORE_ROLES },
    { label: "Item Groups", to: "/masters/item-groups", icon: ListTree, roles: STORE_ROLES },
    { label: "Suppliers", to: "/masters/suppliers", icon: Users, roles: STORE_ROLES },
    { label: "Supplier Groups", to: "/masters/supplier-groups", icon: ListTree, roles: STORE_ROLES },
  ] },
  { title: "Reports", items: [
    { label: "Purchase & stores reports", to: "/reports?g=Purchase%20%26%20Stores", icon: BarChart3, roles: STORE_ROLES },
  ] },
];

export const SALES_NAV: NavGroup[] = [
  { title: "Sugar sales", items: [
    { label: "Dashboard & dispatch", to: "/sales", icon: Sparkles, roles: SALES_ROLES },
  ] },
  { title: "Selling", items: [
    { label: "Quotations", to: "/selling/quotations", icon: FileText, roles: SALES_ROLES },
    { label: "Sales Orders", to: "/selling/sales-orders", icon: Handshake, roles: SALES_ROLES },
    { label: "Delivery Notes", to: "/selling/delivery-notes", icon: Package, roles: SALES_ROLES },
    { label: "Sales Invoices", to: "/selling/sales-invoices", icon: Receipt, roles: SALES_ROLES },
    { label: "Blanket Orders", to: "/selling/blanket-orders", icon: CalendarRange, roles: SALES_ROLES },
  ] },
  { title: "Pricing", items: [
    { label: "Price Lists", to: "/selling/price-lists", icon: Tag, roles: SALES_ROLES },
    { label: "Item Prices", to: "/inventory/item-prices", icon: Tag, roles: SALES_ROLES },
    { label: "Pricing Rules", to: "/selling/pricing-rules", icon: Percent, roles: SALES_ROLES },
    { label: "Product Bundles", to: "/selling/product-bundles", icon: Boxes, roles: SALES_ROLES },
    { label: "Sales Taxes Templates", to: "/selling/tax-templates", icon: Receipt, roles: SALES_ROLES },
  ] },
  { title: "Sales Team", items: [
    { label: "Customers", to: "/masters/customers", icon: Users2, roles: SALES_ROLES },
    { label: "Sales Persons", to: "/selling/sales-persons", icon: UserCircle, roles: SALES_ROLES },
    { label: "Sales Partners", to: "/selling/sales-partners", icon: Users2, roles: SALES_ROLES },
    { label: "Territories", to: "/selling/territories", icon: MapIcon, roles: SALES_ROLES },
  ] },
  { title: "Setup", items: [
    { label: "Selling Settings", to: "/selling/settings", icon: Sliders, roles: SALES_ROLES },
  ] },
  { title: "Customers", items: [
    { label: "Customers", to: "/masters/customers", icon: Users, roles: SALES_ROLES },
    { label: "Customer Groups", to: "/masters/customer-groups", icon: ListTree, roles: SALES_ROLES },
  ] },
  { title: "Reports", items: [
    { label: "Sales reports", to: "/reports?g=Sugar%20Sales", icon: BarChart3, roles: SALES_ROLES },
  ] },
];

export const FINANCE_NAV: NavGroup[] = [
  { title: "Finance", items: [
    { label: "Dashboard & vouchers", to: "/finance", icon: Sparkles, roles: FIN_ROLES },
  ] },
  { title: "Overview", items: [
    { label: "Getting Started", to: "/accounting/getting-started", icon: Rocket, roles: FIN_ROLES },
  ] },
  { title: "Masters", items: [
    { label: "Chart of Accounts", to: "/accounting/chart-of-accounts", icon: ListTree, roles: FIN_ROLES },
    { label: "Cost Centers", to: "/accounting/cost-centers", icon: Scale, roles: FIN_ROLES },
    { label: "Account Categories", to: "/accounting/account-categories", icon: Tags, roles: FIN_ROLES },
    { label: "Fiscal Years", to: "/accounting/fiscal-years", icon: CalendarRange, roles: FIN_ROLES },
  ] },
  { title: "Templates", items: [
    { label: "Mode of Payment", to: "/accounting/mode-of-payment", icon: Wallet, roles: FIN_ROLES },
    { label: "Payment Terms", to: "/accounting/payment-terms", icon: ScrollText, roles: FIN_ROLES },
    { label: "Terms and Conditions", to: "/accounting/terms-and-conditions", icon: FileSignature, roles: FIN_ROLES },
    { label: "Journal Entry Templates", to: "/accounting/journal-entry-templates", icon: LayoutTemplate, roles: FIN_ROLES },
    { label: "Sales Tax Templates", to: "/accounting/tax-templates/sales", icon: Receipt, roles: FIN_ROLES },
    { label: "Purchase Tax Templates", to: "/accounting/tax-templates/purchase", icon: Receipt, roles: FIN_ROLES },
  ] },
  { title: "Banking", items: [
    { label: "Banks", to: "/accounting/banks", icon: Building, roles: FIN_ROLES },
    { label: "Bank Accounts", to: "/accounting/bank-accounts", icon: CreditCard, roles: FIN_ROLES },
    { label: "Cheque Books", to: "/accounting/cheque-books", icon: NotebookTabs, roles: FIN_ROLES },
    { label: "Cheque Tracking", to: "/accounting/cheque-tracking", icon: ScanSearch, roles: FIN_ROLES },
    { label: "Bank Clearance", to: "/accounting/bank-clearance", icon: CalendarCheck, roles: FIN_ROLES },
    { label: "Plaid Settings", to: "/accounting/plaid-settings", icon: Link2, roles: FIN_ROLES },
  ] },
  { title: "Transactions", items: [
    { label: "Journal Entries", to: "/accounting/journal-entries", icon: BookOpen, roles: FIN_ROLES },
    { label: "Payment Entries", to: "/accounting/payment-entries", icon: CreditCard, roles: FIN_ROLES },
  ] },
  { title: "Reports", items: [
    { label: "General Ledger", to: "/accounting/reports/general-ledger", icon: FileText, roles: FIN_ROLES },
    { label: "Trial Balance", to: "/accounting/reports/trial-balance", icon: Scale, roles: FIN_ROLES },
    { label: "Profit and Loss", to: "/accounting/reports/profit-and-loss", icon: TrendingUp, roles: FIN_ROLES },
    { label: "Balance Sheet", to: "/accounting/reports/balance-sheet", icon: PieChart, roles: FIN_ROLES },
    { label: "Cash Flow", to: "/accounting/reports/cash-flow", icon: Wallet, roles: FIN_ROLES },
  ] },
  { title: "Setup", items: [
    { label: "Accounts Settings", to: "/accounting/setup/settings", icon: Sliders, roles: FIN_ROLES },
    { label: "Accounting Dimensions", to: "/accounting/setup/dimensions", icon: Sliders, roles: FIN_ROLES },
  ] },
  { title: "More reports", items: [
    { label: "Finance reports", to: "/reports?g=Finance", icon: BarChart3, roles: FIN_ROLES },
  ] },
];

export const HR_NAV: NavGroup[] = [
  { items: [
    { label: "Overview", to: "/hr", icon: LayoutDashboard, roles: HR_ROLES },
    { label: "Setup", to: "/hr/setup", icon: ListChecks, roles: HR_ROLES },
  ] },
  { title: "Employees", items: [
    { label: "Employees", to: "/hr/employees", icon: Users2, roles: HR_ROLES },
    { label: "Departments", to: "/hr/departments", icon: Building2, roles: HR_ROLES },
    { label: "Designations", to: "/hr/designations", icon: IdCard, roles: HR_ROLES },
    { label: "Branches", to: "/hr/branches", icon: GitBranch, roles: HR_ROLES },
    { label: "Employment Types", to: "/hr/employment-types", icon: Briefcase, roles: HR_ROLES },
    { label: "Employee Grades", to: "/hr/employee-grades", icon: Layers, roles: HR_ROLES },
  ] },
  { title: "Lifecycle", items: [
    { label: "Promotions", to: "/hr/promotions", icon: TrendingUp, roles: HR_ROLES },
    { label: "Transfers", to: "/hr/transfers", icon: ArrowRightLeft, roles: HR_ROLES },
    { label: "Separations", to: "/hr/separations", icon: DoorOpen, roles: HR_ROLES },
  ] },
  { title: "Shifts & Attendance", items: [
    { label: "Shifts", to: "/hr/shifts", icon: Clock3, roles: HR_ROLES },
    { label: "Shift Types", to: "/hr/shift-types", icon: Timer, roles: HR_ROLES },
    { label: "Shift Assignments", to: "/hr/shift-assignments", icon: CalendarClock, roles: HR_ROLES },
    { label: "Shift Requests", to: "/hr/shift-requests", icon: Repeat, roles: HR_ROLES },
    { label: "Shift Locations", to: "/hr/shift-locations", icon: MapPin, roles: HR_ROLES },
    { label: "Shift Schedules", to: "/hr/shift-schedules", icon: CalendarRange, roles: HR_ROLES },
    { label: "Schedule Assignments", to: "/hr/shift-schedule-assignments", icon: CalendarClock, roles: HR_ROLES },
    { label: "Roster", to: "/hr/roster", icon: LayoutGrid, roles: HR_ROLES },
    { label: "Attendance", to: "/hr/attendance", icon: CalendarCheck, roles: HR_ROLES },
    { label: "Attendance Requests", to: "/hr/attendance-requests", icon: FileCheck2, roles: HR_ROLES },
    { label: "Checkins", to: "/hr/checkins", icon: LogIn, roles: HR_ROLES },
  ] },
  { title: "Leave", items: [
    { label: "Leave Applications", to: "/hr/leave-applications", icon: CalendarOff, roles: HR_ROLES },
    { label: "Leave Allocations", to: "/hr/leave-allocations", icon: CalendarPlus2, roles: HR_ROLES },
    { label: "Leave Policies", to: "/hr/leave-policies", icon: ShieldCheck, roles: HR_ROLES },
    { label: "Policy Assignments", to: "/hr/leave-policy-assignments", icon: ListChecks, roles: HR_ROLES },
    { label: "Leave Types", to: "/hr/leave-types", icon: Tags, roles: HR_ROLES },
    { label: "Leave Periods", to: "/hr/leave-periods", icon: CalendarRange, roles: HR_ROLES },
    { label: "Compensatory Leave", to: "/hr/compensatory-leave", icon: CalendarHeart, roles: HR_ROLES },
    { label: "Leave Encashment", to: "/hr/leave-encashment", icon: Coins, roles: HR_ROLES },
    { label: "Holiday Lists", to: "/hr/holiday-lists", icon: CalendarDays, roles: HR_ROLES },
    { label: "Holiday Assignments", to: "/hr/holiday-list-assignments", icon: CalendarRange, roles: HR_ROLES },
  ] },
  { title: "Claims & Extras", items: [
    { label: "Expense Claims", to: "/hr/expense-claims", icon: Receipt, roles: HR_ROLES },
    { label: "Expense Claim Types", to: "/hr/expense-claim-types", icon: Tags, roles: HR_ROLES },
    { label: "Employee Advances", to: "/hr/advances", icon: Wallet, roles: HR_ROLES },
    { label: "Salary Loans", to: "/hr/loans", icon: HandCoins, roles: HR_ROLES },
    { label: "Gratuity", to: "/hr/gratuity", icon: Award, roles: HR_ROLES },
  ] },
  { title: "Tools", items: [
    { label: "Roster", to: "/hr/roster", icon: LayoutGrid, roles: HR_ROLES },
  ] },
  { title: "Setup", items: [
    { label: "HR Setup", to: "/hr/setup", icon: ListChecks, roles: HR_ROLES },
    { label: "HR Settings", to: "/hr/settings", icon: Sliders, roles: HR_ROLES },
  ] },
  { title: "Reports", items: [
    { label: "HR reports", to: "/reports?g=HR%20%26%20Payroll", icon: BarChart3, roles: HR_ROLES },
  ] },
];

export const PAYROLL_NAV: NavGroup[] = [
  { items: [
    { label: "Overview", to: "/payroll", icon: LayoutDashboard, roles: HR_ROLES },
  ] },
  { title: "Run payroll", items: [
    { label: "Payroll Entries", to: "/payroll/entries", icon: PlayCircle, roles: HR_ROLES },
    { label: "Salary Slips", to: "/payroll/salary-slips", icon: Banknote, roles: HR_ROLES },
    { label: "Additional Salary", to: "/payroll/additional-salary", icon: PlusCircle, roles: HR_ROLES },
    { label: "Salary Loans", to: "/hr/loans", icon: HandCoins, roles: HR_ROLES },
    { label: "Incentives", to: "/payroll/incentives", icon: BadgeCheck, roles: HR_ROLES },
    { label: "Retention Bonus", to: "/payroll/retention-bonus", icon: Award, roles: HR_ROLES },
    { label: "Salary Withholding", to: "/payroll/salary-withholding", icon: XCircle, roles: HR_ROLES },
  ] },
  { title: "Overtime", items: [
    { label: "Overtime Types", to: "/payroll/overtime-types", icon: Hourglass, roles: HR_ROLES },
    { label: "Overtime Slips", to: "/payroll/overtime-slips", icon: Timer, roles: HR_ROLES },
  ] },
  { title: "Structures", items: [
    { label: "Salary Components", to: "/payroll/salary-components", icon: Coins, roles: HR_ROLES },
    { label: "Salary Structures", to: "/payroll/salary-structures", icon: FileSpreadsheet, roles: HR_ROLES },
    { label: "Structure Assignments", to: "/payroll/salary-structure-assignments", icon: FileSignature, roles: HR_ROLES },
    { label: "Gratuity Rules", to: "/payroll/gratuity-rules", icon: Award, roles: HR_ROLES },
  ] },
  { title: "Tax", items: [
    { label: "Payroll Periods", to: "/payroll/periods", icon: CalendarRange, roles: HR_ROLES },
    { label: "Income Tax Slabs", to: "/payroll/income-tax-slabs", icon: Percent, roles: HR_ROLES },
    { label: "Tax Declarations", to: "/payroll/tax-declarations", icon: ShieldCheck, roles: HR_ROLES },
  ] },
  { title: "Setup", items: [
    { label: "HR & Payroll Setup", to: "/hr/setup", icon: ListChecks, roles: HR_ROLES },
    { label: "Payroll Settings", to: "/payroll/settings", icon: Sliders, roles: HR_ROLES },
  ] },
  { title: "Reports", items: [
    { label: "Payroll reports", to: "/reports?g=HR%20%26%20Payroll", icon: BarChart3, roles: HR_ROLES },
  ] },
];
