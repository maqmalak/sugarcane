/**
 * The ERP apps of the React app, ported from the MicroMax ERP frontend (buying, stores, selling, stock, masters, finance)
 * and from Baogee Textile (HR and payroll). Their pages link to each other by these same paths.
 */
import { lazy, Suspense } from "react";
import { Navigate, Route } from "react-router-dom";
import { FullPageLoader } from "@/pages/common/ComingSoonPage";

const AccountCategoriesPage = lazy(() => import("@/pages/Accounting/AccountCategoriesPage").then((m) => ({ default: m.AccountCategoriesPage })));
const AccountingDimensionsPage = lazy(() => import("@/pages/Accounting/AccountingDimensionsPage").then((m) => ({ default: m.AccountingDimensionsPage })));
const AccountsSettingsPage = lazy(() => import("@/pages/Accounting/AccountsSettingsPage").then((m) => ({ default: m.AccountsSettingsPage })));
const BankClearancePage = lazy(() => import("@/pages/Accounting/BankClearancePage"));
const BuyingSettingsPage = lazy(() => import("@/pages/Purchase/BuyingSettingsPage").then((m) => ({ default: m.BuyingSettingsPage })));
const ChartOfAccountsPage = lazy(() => import("@/pages/Accounting/ChartOfAccountsPage").then((m) => ({ default: m.ChartOfAccountsPage })));
const ChequeTrackingPage = lazy(() => import("@/pages/Accounting/ChequeTrackingPage"));
const CostCentersPage = lazy(() => import("@/pages/Accounting/CostCentersPage").then((m) => ({ default: m.CostCentersPage })));
const CustomerFormPage = lazy(() => import("@/pages/Masters/CustomerFormPage").then((m) => ({ default: m.CustomerFormPage })));
const CustomerGroupFormPage = lazy(() => import("@/pages/Masters/CustomerGroupFormPage").then((m) => ({ default: m.CustomerGroupFormPage })));
const CustomerGroupsPage = lazy(() => import("@/pages/Masters/CustomerGroupsPage").then((m) => ({ default: m.CustomerGroupsPage })));
const CustomersPage = lazy(() => import("@/pages/Masters/CustomersPage").then((m) => ({ default: m.CustomersPage })));
const DeliveryNoteDetailPage = lazy(() => import("@/pages/Selling/DeliveryNoteDetailPage").then((m) => ({ default: m.DeliveryNoteDetailPage })));
const DeliveryNoteFormPage = lazy(() => import("@/pages/Selling/DeliveryNoteFormPage").then((m) => ({ default: m.DeliveryNoteFormPage })));
const DeliveryNotesPage = lazy(() => import("@/pages/Selling/DeliveryNotesPage").then((m) => ({ default: m.DeliveryNotesPage })));
const FiscalYearsPage = lazy(() => import("@/pages/Accounting/FiscalYearsPage").then((m) => ({ default: m.FiscalYearsPage })));
const GettingStartedPage = lazy(() => import("@/pages/Accounting/GettingStartedPage").then((m) => ({ default: m.GettingStartedPage })));
const HrAttendancePage = lazy(() => import("@/pages/HR/AttendancePage").then((m) => ({ default: m.default })));
const HrBranchesPage = lazy(() => import("@/pages/HR/BranchesPage").then((m) => ({ default: m.default })));
const HrDepartmentFormPage = lazy(() => import("@/pages/HR/DepartmentFormPage"));
const HrDepartmentsPage = lazy(() => import("@/pages/HR/DepartmentsPage").then((m) => ({ default: m.default })));
const HrDesignationFormPage = lazy(() => import("@/pages/HR/DesignationFormPage"));
const HrDesignationsPage = lazy(() => import("@/pages/HR/DesignationsPage").then((m) => ({ default: m.default })));
const HrEmployeeAdvancesPage = lazy(() => import("@/pages/HR/EmployeeAdvancesPage").then((m) => ({ default: m.default })));
const HrEmployeeDetailPage = lazy(() => import("@/pages/HR/EmployeeDetailPage").then((m) => ({ default: m.default })));
const HrEmployeeNewPage = lazy(() => import("@/pages/HR/EmployeeNewPage"));
const HrEmployeesPage = lazy(() => import("@/pages/HR/EmployeesPage").then((m) => ({ default: m.default })));
const HrExpenseClaimsPage = lazy(() => import("@/pages/HR/ExpenseClaimsPage").then((m) => ({ default: m.default })));
const HrGratuityPage = lazy(() => import("@/pages/HR/GratuityPage").then((m) => ({ default: m.default })));
const HrHolidayListsPage = lazy(() => import("@/pages/HR/HolidayListsPage").then((m) => ({ default: m.default })));
const HrHomePage = lazy(() => import("@/pages/HR/HRHomePage"));
const HrLeaveAllocationsPage = lazy(() => import("@/pages/HR/LeaveAllocationsPage").then((m) => ({ default: m.default })));
const HrLeaveApplicationsPage = lazy(() => import("@/pages/HR/LeaveApplicationsPage").then((m) => ({ default: m.default })));
const HrRosterPage = lazy(() => import("@/pages/HR/RosterPage"));
const HrSalaryLoansPage = lazy(() => import("@/pages/HR/SalaryLoansPage"));
const HrSetupPage = lazy(() => import("@/pages/HR/HRSetupPage"));
const HrShiftsOverviewPage = lazy(() => import("@/pages/HR/ShiftsOverviewPage"));
const ItemFormPage = lazy(() => import("@/pages/Masters/ItemFormPage").then((m) => ({ default: m.ItemFormPage })));
const ItemGroupFormPage = lazy(() => import("@/pages/Masters/ItemGroupFormPage").then((m) => ({ default: m.ItemGroupFormPage })));
const ItemGroupsPage = lazy(() => import("@/pages/Masters/ItemGroupsPage").then((m) => ({ default: m.ItemGroupsPage })));
const ItemsPage = lazy(() => import("@/pages/Masters/ItemsPage").then((m) => ({ default: m.ItemsPage })));
const JournalEntriesPage = lazy(() => import("@/pages/Accounting/JournalEntriesPage").then((m) => ({ default: m.JournalEntriesPage })));
const JournalEntryFormPage = lazy(() => import("@/pages/Accounting/JournalEntryFormPage").then((m) => ({ default: m.JournalEntryFormPage })));
const JournalEntryTemplatePage = lazy(() => import("@/pages/Accounting/JournalEntryTemplatePage").then((m) => ({ default: m.JournalEntryTemplatePage })));
const LandedCostVoucherDetailPage = lazy(() => import("@/pages/Purchase/LandedCostVoucherDetailPage").then((m) => ({ default: m.LandedCostVoucherDetailPage })));
const LandedCostVoucherFormPage = lazy(() => import("@/pages/Purchase/LandedCostVoucherFormPage").then((m) => ({ default: m.LandedCostVoucherFormPage })));
const LandedCostVouchersPage = lazy(() => import("@/pages/Purchase/LandedCostVouchersPage").then((m) => ({ default: m.LandedCostVouchersPage })));
const MaterialRequestDetailPage = lazy(() => import("@/pages/Import/MaterialRequestDetailPage").then((m) => ({ default: m.MaterialRequestDetailPage })));
const MaterialRequestFormPage = lazy(() => import("@/pages/Import/MaterialRequestFormPage").then((m) => ({ default: m.MaterialRequestFormPage })));
const MaterialRequestsPage = lazy(() => import("@/pages/Import/MaterialRequestsPage").then((m) => ({ default: m.MaterialRequestsPage })));
const ModeOfPaymentPage = lazy(() => import("@/pages/Accounting/ModeOfPaymentPage").then((m) => ({ default: m.ModeOfPaymentPage })));
const PaymentEntriesPage = lazy(() => import("@/pages/Accounting/PaymentEntriesPage").then((m) => ({ default: m.PaymentEntriesPage })));
const PaymentEntryFormPage = lazy(() => import("@/pages/Accounting/PaymentEntryFormPage").then((m) => ({ default: m.PaymentEntryFormPage })));
const PaymentTermsPage = lazy(() => import("@/pages/Accounting/PaymentTermsPage").then((m) => ({ default: m.PaymentTermsPage })));
const PayrollHomePage = lazy(() => import("@/pages/Payroll/PayrollHomePage"));
const PayrollSalaryComponentsPage = lazy(() => import("@/pages/Payroll/SalaryComponentsPage").then((m) => ({ default: m.default })));
const PayrollSalarySlipDetailPage = lazy(() => import("@/pages/Payroll/SalarySlipDetailPage").then((m) => ({ default: m.default })));
const PayrollSalarySlipsPage = lazy(() => import("@/pages/Payroll/SalarySlipsPage").then((m) => ({ default: m.default })));
const PayrollSalaryStructureAssignmentsPage = lazy(() => import("@/pages/Payroll/SalaryStructureAssignmentsPage").then((m) => ({ default: m.default })));
const PayrollSalaryStructuresPage = lazy(() => import("@/pages/Payroll/SalaryStructuresPage").then((m) => ({ default: m.default })));
const PurchaseInvoiceDetailPage = lazy(() => import("@/pages/Purchase/PurchaseInvoiceDetailPage").then((m) => ({ default: m.PurchaseInvoiceDetailPage })));
const PurchaseInvoiceFormPage = lazy(() => import("@/pages/Purchase/PurchaseInvoiceFormPage").then((m) => ({ default: m.PurchaseInvoiceFormPage })));
const PurchaseInvoicesPage = lazy(() => import("@/pages/Purchase/PurchaseInvoicesPage").then((m) => ({ default: m.PurchaseInvoicesPage })));
const PurchaseOrderDetailPage = lazy(() => import("@/pages/Import/PurchaseOrderDetailPage").then((m) => ({ default: m.PurchaseOrderDetailPage })));
const PurchaseOrderFormPage = lazy(() => import("@/pages/Import/PurchaseOrderFormPage").then((m) => ({ default: m.PurchaseOrderFormPage })));
const PurchaseOrdersPage = lazy(() => import("@/pages/Import/PurchaseOrdersPage").then((m) => ({ default: m.PurchaseOrdersPage })));
const PurchaseReceiptDetailPage = lazy(() => import("@/pages/Purchase/PurchaseReceiptDetailPage").then((m) => ({ default: m.PurchaseReceiptDetailPage })));
const PurchaseReceiptFormPage = lazy(() => import("@/pages/Purchase/PurchaseReceiptFormPage").then((m) => ({ default: m.PurchaseReceiptFormPage })));
const PurchaseReceiptsPage = lazy(() => import("@/pages/Purchase/PurchaseReceiptsPage").then((m) => ({ default: m.PurchaseReceiptsPage })));
const ReportBalanceSheetPage = lazy(() => import("@/pages/Accounting/ReportBalanceSheetPage").then((m) => ({ default: m.ReportBalanceSheetPage })));
const ReportCashFlowPage = lazy(() => import("@/pages/Accounting/ReportCashFlowPage").then((m) => ({ default: m.ReportCashFlowPage })));
const ReportGeneralLedgerPage = lazy(() => import("@/pages/Accounting/ReportGeneralLedgerPage").then((m) => ({ default: m.ReportGeneralLedgerPage })));
const ReportProfitAndLossPage = lazy(() => import("@/pages/Accounting/ReportProfitAndLossPage").then((m) => ({ default: m.ReportProfitAndLossPage })));
const ReportStockLedgerPage = lazy(() => import("@/pages/Inventory/ReportStockLedgerPage").then((m) => ({ default: m.ReportStockLedgerPage })));
const ReportTrialBalancePage = lazy(() => import("@/pages/Accounting/ReportTrialBalancePage").then((m) => ({ default: m.ReportTrialBalancePage })));
const RequestForQuotationDetailPage = lazy(() => import("@/pages/Import/RequestForQuotationDetailPage").then((m) => ({ default: m.RequestForQuotationDetailPage })));
const RequestForQuotationFormPage = lazy(() => import("@/pages/Import/RequestForQuotationFormPage").then((m) => ({ default: m.RequestForQuotationFormPage })));
const RequestForQuotationsPage = lazy(() => import("@/pages/Import/RequestForQuotationsPage").then((m) => ({ default: m.RequestForQuotationsPage })));
const SalesInvoiceDetailPage = lazy(() => import("@/pages/Selling/SalesInvoiceDetailPage").then((m) => ({ default: m.SalesInvoiceDetailPage })));
const SalesInvoiceFormPage = lazy(() => import("@/pages/Selling/SalesInvoiceFormPage").then((m) => ({ default: m.SalesInvoiceFormPage })));
const SalesInvoicesPage = lazy(() => import("@/pages/Selling/SalesInvoicesPage").then((m) => ({ default: m.SalesInvoicesPage })));
const SalesOrderDetailPage = lazy(() => import("@/pages/Selling/SalesOrderDetailPage").then((m) => ({ default: m.SalesOrderDetailPage })));
const SalesOrderFormPage = lazy(() => import("@/pages/Selling/SalesOrderFormPage").then((m) => ({ default: m.SalesOrderFormPage })));
const SalesOrdersPage = lazy(() => import("@/pages/Selling/SalesOrdersPage").then((m) => ({ default: m.SalesOrdersPage })));
const SellingSettingsPage = lazy(() => import("@/pages/Selling/SellingSettingsPage").then((m) => ({ default: m.SellingSettingsPage })));
const StockEntriesPage = lazy(() => import("@/pages/Inventory/StockEntriesPage").then((m) => ({ default: m.StockEntriesPage })));
const StockEntryDetailPage = lazy(() => import("@/pages/Inventory/StockEntryDetailPage").then((m) => ({ default: m.StockEntryDetailPage })));
const StockEntryFormPage = lazy(() => import("@/pages/Inventory/StockEntryFormPage").then((m) => ({ default: m.StockEntryFormPage })));
const SupplierFormPage = lazy(() => import("@/pages/Masters/SupplierFormPage").then((m) => ({ default: m.SupplierFormPage })));
const SupplierGroupFormPage = lazy(() => import("@/pages/Masters/SupplierGroupFormPage").then((m) => ({ default: m.SupplierGroupFormPage })));
const SupplierGroupsPage = lazy(() => import("@/pages/Masters/SupplierGroupsPage").then((m) => ({ default: m.SupplierGroupsPage })));
const SuppliersPage = lazy(() => import("@/pages/Masters/SuppliersPage").then((m) => ({ default: m.SuppliersPage })));
const TermsAndConditionsPage = lazy(() => import("@/pages/Accounting/TermsAndConditionsPage").then((m) => ({ default: m.TermsAndConditionsPage })));

const StockMasterList = lazy(() => import("@/pages/Inventory/StockMasters").then((m) => ({ default: m.StockMasterList })));
const StockMasterForm = lazy(() => import("@/pages/Inventory/StockMasters").then((m) => ({ default: m.StockMasterForm })));
const SellingMasterList = lazy(() => import("@/pages/Selling/SellingMasters").then((m) => ({ default: m.SellingMasterList })));
const SellingMasterForm = lazy(() => import("@/pages/Selling/SellingMasters").then((m) => ({ default: m.SellingMasterForm })));
const TaxTemplatesPage = lazy(() => import("@/pages/Accounting/TaxTemplatesPage").then((m) => ({ default: m.TaxTemplatesPage })));
/** Selling DocConfigs (quotations, pricing, sales team…) under /selling. Kept in sync with selling-masters-configs.tsx. */
const SELLING_MASTER_BASES = ["/selling/quotations", "/selling/blanket-orders", "/selling/pricing-rules", "/selling/product-bundles", "/selling/price-lists", "/selling/tax-templates",
  "/selling/sales-partners", "/selling/sales-persons", "/selling/territories"];
/** Stock masters (DocConfig): list + form routes under /inventory. Kept in sync with stock-configs.tsx. */
const STOCK_MASTER_BASES = ["/inventory/stock", "/inventory/warehouses", "/inventory/reconciliations", "/inventory/item-prices", "/inventory/batches", "/inventory/serial-nos", "/inventory/pick-lists"];

const SupplierQuotationsPage = lazy(() => import("@/pages/Import/SupplierQuotationPages").then((m) => ({ default: m.SupplierQuotationsPage })));
const SupplierQuotationPage = lazy(() => import("@/pages/Import/SupplierQuotationPages").then((m) => ({ default: m.SupplierQuotationPage })));
const ExecutiveDashboardPage = lazy(() => import("@/pages/Dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const AnalyticsDashboardPage = lazy(() => import("@/pages/Analytics/AnalyticsDashboardPage").then((m) => ({ default: m.AnalyticsDashboardPage })));
const AnalyticsSuitePage = lazy(() => import("@/pages/Analytics/AnalyticsSuitePage").then((m) => ({ default: m.AnalyticsSuitePage })));
const PnlSimulatorPage = lazy(() => import("@/pages/Analytics/PnlSimulatorPage").then((m) => ({ default: m.PnlSimulatorPage })));
const BankingDoc = lazy(() => import("@/pages/Accounting/BankingDocPage"));
const HrDocPage = lazy(() => import("@/pages/HR/HrDocPage"));

const HR_DOC_ROUTES: [string, import("@/pages/HR/HrDocPage").HrDocKey][] = [
  ["hr/leave-types", "leaveTypes"],
  ["hr/shift-types", "shiftTypes"],
  ["hr/shift-assignments", "shiftAssignments"],
  ["hr/shift-requests", "shiftRequests"],
  ["hr/shift-locations", "shiftLocations"],
  ["hr/shift-schedules", "shiftSchedules"],
  ["hr/shift-schedule-assignments", "shiftScheduleAssignments"],
  ["hr/attendance-requests", "attendanceRequests"],
  ["hr/checkins", "checkins"],
  ["hr/leave-policies", "leavePolicies"],
  ["hr/leave-policy-assignments", "leavePolicyAssignments"],
  ["hr/leave-periods", "leavePeriods"],
  ["hr/compensatory-leave", "compensatoryLeave"],
  ["hr/leave-encashment", "leaveEncashment"],
  ["hr/holiday-list-assignments", "holidayListAssignments"],
  ["hr/employment-types", "employmentTypes"],
  ["hr/employee-grades", "employeeGrades"],
  ["hr/promotions", "promotions"],
  ["hr/transfers", "transfers"],
  ["hr/separations", "separations"],
  ["hr/expense-claim-types", "expenseClaimTypes"],
  ["payroll/entries", "entries"],
  ["payroll/additional-salary", "additionalSalary"],
  ["payroll/periods", "periods"],
  ["payroll/income-tax-slabs", "taxSlabs"],
  ["payroll/gratuity-rules", "gratuityRules"],
  ["payroll/incentives", "incentives"],
  ["payroll/retention-bonus", "retentionBonus"],
  ["payroll/salary-withholding", "salaryWithholding"],
  ["payroll/tax-declarations", "taxDeclarations"],
  ["payroll/overtime-types", "overtimeTypes"],
  ["payroll/overtime-slips", "overtimeSlips"],
];

/** Route elements for the ERP apps; placed inside the AppShell route in routes.tsx. */
export function erpRoutes() {
  return [
    <Route key="import/material-requests" path="import/material-requests" element={<Suspense fallback={<FullPageLoader />}><MaterialRequestsPage /></Suspense>} />,
    <Route key="import/material-requests/new" path="import/material-requests/new" element={<Suspense fallback={<FullPageLoader />}><MaterialRequestFormPage /></Suspense>} />,
    <Route key="import/material-requests/:name" path="import/material-requests/:name" element={<Suspense fallback={<FullPageLoader />}><MaterialRequestDetailPage /></Suspense>} />,
    <Route key="import/material-requests/:name/edit" path="import/material-requests/:name/edit" element={<Suspense fallback={<FullPageLoader />}><MaterialRequestFormPage /></Suspense>} />,
    <Route key="import/rfqs" path="import/rfqs" element={<Suspense fallback={<FullPageLoader />}><RequestForQuotationsPage /></Suspense>} />,
    <Route key="import/rfqs/new" path="import/rfqs/new" element={<Suspense fallback={<FullPageLoader />}><RequestForQuotationFormPage /></Suspense>} />,
    <Route key="import/rfqs/:name" path="import/rfqs/:name" element={<Suspense fallback={<FullPageLoader />}><RequestForQuotationDetailPage /></Suspense>} />,
    <Route key="import/rfqs/:name/edit" path="import/rfqs/:name/edit" element={<Suspense fallback={<FullPageLoader />}><RequestForQuotationFormPage /></Suspense>} />,
    <Route key="purchase/settings" path="purchase/settings" element={<Suspense fallback={<FullPageLoader />}><BuyingSettingsPage /></Suspense>} />,
    <Route key="import/purchase-orders" path="import/purchase-orders" element={<Suspense fallback={<FullPageLoader />}><PurchaseOrdersPage /></Suspense>} />,
    <Route key="import/purchase-orders/new" path="import/purchase-orders/new" element={<Suspense fallback={<FullPageLoader />}><PurchaseOrderFormPage /></Suspense>} />,
    <Route key="import/purchase-orders/:name" path="import/purchase-orders/:name" element={<Suspense fallback={<FullPageLoader />}><PurchaseOrderDetailPage /></Suspense>} />,
    <Route key="import/purchase-orders/:name/edit" path="import/purchase-orders/:name/edit" element={<Suspense fallback={<FullPageLoader />}><PurchaseOrderFormPage /></Suspense>} />,
    <Route key="purchase/receipts" path="purchase/receipts" element={<Suspense fallback={<FullPageLoader />}><PurchaseReceiptsPage /></Suspense>} />,
    <Route key="purchase/receipts/new" path="purchase/receipts/new" element={<Suspense fallback={<FullPageLoader />}><PurchaseReceiptFormPage /></Suspense>} />,
    <Route key="purchase/receipts/:name" path="purchase/receipts/:name" element={<Suspense fallback={<FullPageLoader />}><PurchaseReceiptDetailPage /></Suspense>} />,
    <Route key="purchase/receipts/:name/edit" path="purchase/receipts/:name/edit" element={<Suspense fallback={<FullPageLoader />}><PurchaseReceiptFormPage /></Suspense>} />,
    <Route key="purchase/invoices" path="purchase/invoices" element={<Suspense fallback={<FullPageLoader />}><PurchaseInvoicesPage /></Suspense>} />,
    <Route key="purchase/invoices/new" path="purchase/invoices/new" element={<Suspense fallback={<FullPageLoader />}><PurchaseInvoiceFormPage /></Suspense>} />,
    <Route key="purchase/invoices/:name" path="purchase/invoices/:name" element={<Suspense fallback={<FullPageLoader />}><PurchaseInvoiceDetailPage /></Suspense>} />,
    <Route key="purchase/invoices/:name/edit" path="purchase/invoices/:name/edit" element={<Suspense fallback={<FullPageLoader />}><PurchaseInvoiceFormPage /></Suspense>} />,
    <Route key="purchase/landed-costs" path="purchase/landed-costs" element={<Suspense fallback={<FullPageLoader />}><LandedCostVouchersPage /></Suspense>} />,
    <Route key="purchase/landed-costs/new" path="purchase/landed-costs/new" element={<Suspense fallback={<FullPageLoader />}><LandedCostVoucherFormPage /></Suspense>} />,
    <Route key="purchase/landed-costs/:name" path="purchase/landed-costs/:name" element={<Suspense fallback={<FullPageLoader />}><LandedCostVoucherDetailPage /></Suspense>} />,
    <Route key="purchase/landed-costs/:name/edit" path="purchase/landed-costs/:name/edit" element={<Suspense fallback={<FullPageLoader />}><LandedCostVoucherFormPage /></Suspense>} />,
    <Route key="inventory/stock-entries" path="inventory/stock-entries" element={<Suspense fallback={<FullPageLoader />}><StockEntriesPage /></Suspense>} />,
    <Route key="inventory/stock-entries/new" path="inventory/stock-entries/new" element={<Suspense fallback={<FullPageLoader />}><StockEntryFormPage /></Suspense>} />,
    <Route key="inventory/stock-entries/:name" path="inventory/stock-entries/:name" element={<Suspense fallback={<FullPageLoader />}><StockEntryDetailPage /></Suspense>} />,
    <Route key="inventory/stock-entries/:name/edit" path="inventory/stock-entries/:name/edit" element={<Suspense fallback={<FullPageLoader />}><StockEntryFormPage /></Suspense>} />,
    <Route key="inventory/reports/stock-ledger" path="inventory/reports/stock-ledger" element={<Suspense fallback={<FullPageLoader />}><ReportStockLedgerPage /></Suspense>} />,
    <Route key="masters/items" path="masters/items" element={<Suspense fallback={<FullPageLoader />}><ItemsPage /></Suspense>} />,
    <Route key="masters/items/new" path="masters/items/new" element={<Suspense fallback={<FullPageLoader />}><ItemFormPage /></Suspense>} />,
    <Route key="masters/items/:name" path="masters/items/:name" element={<Suspense fallback={<FullPageLoader />}><ItemFormPage /></Suspense>} />,
    <Route key="masters/item-groups" path="masters/item-groups" element={<Suspense fallback={<FullPageLoader />}><ItemGroupsPage /></Suspense>} />,
    <Route key="masters/item-groups/new" path="masters/item-groups/new" element={<Suspense fallback={<FullPageLoader />}><ItemGroupFormPage /></Suspense>} />,
    <Route key="masters/item-groups/:name" path="masters/item-groups/:name" element={<Suspense fallback={<FullPageLoader />}><ItemGroupFormPage /></Suspense>} />,
    <Route key="masters/customers" path="masters/customers" element={<Suspense fallback={<FullPageLoader />}><CustomersPage /></Suspense>} />,
    <Route key="masters/customers/new" path="masters/customers/new" element={<Suspense fallback={<FullPageLoader />}><CustomerFormPage /></Suspense>} />,
    <Route key="masters/customers/:name" path="masters/customers/:name" element={<Suspense fallback={<FullPageLoader />}><CustomerFormPage /></Suspense>} />,
    <Route key="masters/customer-groups" path="masters/customer-groups" element={<Suspense fallback={<FullPageLoader />}><CustomerGroupsPage /></Suspense>} />,
    <Route key="masters/customer-groups/new" path="masters/customer-groups/new" element={<Suspense fallback={<FullPageLoader />}><CustomerGroupFormPage /></Suspense>} />,
    <Route key="masters/customer-groups/:name" path="masters/customer-groups/:name" element={<Suspense fallback={<FullPageLoader />}><CustomerGroupFormPage /></Suspense>} />,
    <Route key="masters/suppliers" path="masters/suppliers" element={<Suspense fallback={<FullPageLoader />}><SuppliersPage /></Suspense>} />,
    <Route key="masters/suppliers/new" path="masters/suppliers/new" element={<Suspense fallback={<FullPageLoader />}><SupplierFormPage /></Suspense>} />,
    <Route key="masters/suppliers/:name" path="masters/suppliers/:name" element={<Suspense fallback={<FullPageLoader />}><SupplierFormPage /></Suspense>} />,
    <Route key="masters/supplier-groups" path="masters/supplier-groups" element={<Suspense fallback={<FullPageLoader />}><SupplierGroupsPage /></Suspense>} />,
    <Route key="masters/supplier-groups/new" path="masters/supplier-groups/new" element={<Suspense fallback={<FullPageLoader />}><SupplierGroupFormPage /></Suspense>} />,
    <Route key="masters/supplier-groups/:name" path="masters/supplier-groups/:name" element={<Suspense fallback={<FullPageLoader />}><SupplierGroupFormPage /></Suspense>} />,
    <Route key="accounting" path="accounting" element={<Suspense fallback={<FullPageLoader />}><AnalyticsDashboardPage module="accounts" /></Suspense>} />,
    <Route key="accounting/banks" path="accounting/banks" element={<Suspense fallback={<FullPageLoader />}><BankingDoc which="bank" /></Suspense>} />,
    <Route key="accounting/banks/:name" path="accounting/banks/:name" element={<Suspense fallback={<FullPageLoader />}><BankingDoc which="bank" form /></Suspense>} />,
    <Route key="accounting/bank-accounts" path="accounting/bank-accounts" element={<Suspense fallback={<FullPageLoader />}><BankingDoc which="bankAccount" /></Suspense>} />,
    <Route key="accounting/bank-accounts/:name" path="accounting/bank-accounts/:name" element={<Suspense fallback={<FullPageLoader />}><BankingDoc which="bankAccount" form /></Suspense>} />,
    <Route key="accounting/cheque-books" path="accounting/cheque-books" element={<Suspense fallback={<FullPageLoader />}><BankingDoc which="chequeBook" /></Suspense>} />,
    <Route key="accounting/cheque-books/:name" path="accounting/cheque-books/:name" element={<Suspense fallback={<FullPageLoader />}><BankingDoc which="chequeBook" form /></Suspense>} />,
    <Route key="accounting/plaid-settings" path="accounting/plaid-settings" element={<Suspense fallback={<FullPageLoader />}><BankingDoc which="plaid" form /></Suspense>} />,
    <Route key="accounting/cheque-tracking" path="accounting/cheque-tracking" element={<Suspense fallback={<FullPageLoader />}><ChequeTrackingPage /></Suspense>} />,
    <Route key="accounting/bank-clearance" path="accounting/bank-clearance" element={<Suspense fallback={<FullPageLoader />}><BankClearancePage /></Suspense>} />,
    <Route key="accounting/getting-started" path="accounting/getting-started" element={<Suspense fallback={<FullPageLoader />}><GettingStartedPage /></Suspense>} />,
    <Route key="accounting/chart-of-accounts" path="accounting/chart-of-accounts" element={<Suspense fallback={<FullPageLoader />}><ChartOfAccountsPage /></Suspense>} />,
    <Route key="accounting/cost-centers" path="accounting/cost-centers" element={<Suspense fallback={<FullPageLoader />}><CostCentersPage /></Suspense>} />,
    <Route key="accounting/account-categories" path="accounting/account-categories" element={<Suspense fallback={<FullPageLoader />}><AccountCategoriesPage /></Suspense>} />,
    <Route key="accounting/fiscal-years" path="accounting/fiscal-years" element={<Suspense fallback={<FullPageLoader />}><FiscalYearsPage /></Suspense>} />,
    <Route key="accounting/payment-terms" path="accounting/payment-terms" element={<Suspense fallback={<FullPageLoader />}><PaymentTermsPage /></Suspense>} />,
    <Route key="accounting/mode-of-payment" path="accounting/mode-of-payment" element={<Suspense fallback={<FullPageLoader />}><ModeOfPaymentPage /></Suspense>} />,
    <Route key="accounting/terms-and-conditions" path="accounting/terms-and-conditions" element={<Suspense fallback={<FullPageLoader />}><TermsAndConditionsPage /></Suspense>} />,
    <Route key="accounting/journal-entry-templates" path="accounting/journal-entry-templates" element={<Suspense fallback={<FullPageLoader />}><JournalEntryTemplatePage /></Suspense>} />,
    <Route key="accounting/journal-entries" path="accounting/journal-entries" element={<Suspense fallback={<FullPageLoader />}><JournalEntriesPage /></Suspense>} />,
    <Route key="accounting/journal-entries/new" path="accounting/journal-entries/new" element={<Suspense fallback={<FullPageLoader />}><JournalEntryFormPage /></Suspense>} />,
    <Route key="accounting/journal-entries/:name" path="accounting/journal-entries/:name" element={<Suspense fallback={<FullPageLoader />}><JournalEntryFormPage /></Suspense>} />,
    <Route key="accounting/payment-entries" path="accounting/payment-entries" element={<Suspense fallback={<FullPageLoader />}><PaymentEntriesPage /></Suspense>} />,
    <Route key="accounting/payment-entries/new" path="accounting/payment-entries/new" element={<Suspense fallback={<FullPageLoader />}><PaymentEntryFormPage /></Suspense>} />,
    <Route key="accounting/payment-entries/:name" path="accounting/payment-entries/:name" element={<Suspense fallback={<FullPageLoader />}><PaymentEntryFormPage /></Suspense>} />,
    <Route key="accounting/reports/general-ledger" path="accounting/reports/general-ledger" element={<Suspense fallback={<FullPageLoader />}><ReportGeneralLedgerPage /></Suspense>} />,
    <Route key="accounting/reports/trial-balance" path="accounting/reports/trial-balance" element={<Suspense fallback={<FullPageLoader />}><ReportTrialBalancePage /></Suspense>} />,
    <Route key="accounting/reports/profit-and-loss" path="accounting/reports/profit-and-loss" element={<Suspense fallback={<FullPageLoader />}><ReportProfitAndLossPage /></Suspense>} />,
    <Route key="accounting/reports/balance-sheet" path="accounting/reports/balance-sheet" element={<Suspense fallback={<FullPageLoader />}><ReportBalanceSheetPage /></Suspense>} />,
    <Route key="accounting/reports/cash-flow" path="accounting/reports/cash-flow" element={<Suspense fallback={<FullPageLoader />}><ReportCashFlowPage /></Suspense>} />,
    <Route key="accounting/setup/settings" path="accounting/setup/settings" element={<Suspense fallback={<FullPageLoader />}><AccountsSettingsPage /></Suspense>} />,
    <Route key="accounting/setup/dimensions" path="accounting/setup/dimensions" element={<Suspense fallback={<FullPageLoader />}><AccountingDimensionsPage /></Suspense>} />,
    <Route key="selling/settings" path="selling/settings" element={<Suspense fallback={<FullPageLoader />}><SellingSettingsPage /></Suspense>} />,
    <Route key="selling/sales-orders" path="selling/sales-orders" element={<Suspense fallback={<FullPageLoader />}><SalesOrdersPage /></Suspense>} />,
    <Route key="selling/sales-orders/new" path="selling/sales-orders/new" element={<Suspense fallback={<FullPageLoader />}><SalesOrderFormPage /></Suspense>} />,
    <Route key="selling/sales-orders/:name" path="selling/sales-orders/:name" element={<Suspense fallback={<FullPageLoader />}><SalesOrderDetailPage /></Suspense>} />,
    <Route key="selling/sales-orders/:name/edit" path="selling/sales-orders/:name/edit" element={<Suspense fallback={<FullPageLoader />}><SalesOrderFormPage /></Suspense>} />,
    <Route key="selling/delivery-notes" path="selling/delivery-notes" element={<Suspense fallback={<FullPageLoader />}><DeliveryNotesPage /></Suspense>} />,
    <Route key="selling/delivery-notes/new" path="selling/delivery-notes/new" element={<Suspense fallback={<FullPageLoader />}><DeliveryNoteFormPage /></Suspense>} />,
    <Route key="selling/delivery-notes/:name" path="selling/delivery-notes/:name" element={<Suspense fallback={<FullPageLoader />}><DeliveryNoteDetailPage /></Suspense>} />,
    <Route key="selling/delivery-notes/:name/edit" path="selling/delivery-notes/:name/edit" element={<Suspense fallback={<FullPageLoader />}><DeliveryNoteFormPage /></Suspense>} />,
    <Route key="selling/sales-invoices" path="selling/sales-invoices" element={<Suspense fallback={<FullPageLoader />}><SalesInvoicesPage /></Suspense>} />,
    <Route key="selling/sales-invoices/new" path="selling/sales-invoices/new" element={<Suspense fallback={<FullPageLoader />}><SalesInvoiceFormPage /></Suspense>} />,
    <Route key="selling/sales-invoices/:name" path="selling/sales-invoices/:name" element={<Suspense fallback={<FullPageLoader />}><SalesInvoiceDetailPage /></Suspense>} />,
    <Route key="selling/sales-invoices/:name/edit" path="selling/sales-invoices/:name/edit" element={<Suspense fallback={<FullPageLoader />}><SalesInvoiceFormPage /></Suspense>} />,
    <Route key="hr" path="hr" element={<Suspense fallback={<FullPageLoader />}><HrHomePage /></Suspense>} />,
    <Route key="hr/settings" path="hr/settings" element={<Suspense fallback={<FullPageLoader />}><HrDocPage which="hrSettings" /></Suspense>} />,
    <Route key="hr/shifts" path="hr/shifts" element={<Suspense fallback={<FullPageLoader />}><HrShiftsOverviewPage /></Suspense>} />,
    <Route key="hr/setup" path="hr/setup" element={<Suspense fallback={<FullPageLoader />}><HrSetupPage /></Suspense>} />,
    <Route key="hr/employees" path="hr/employees" element={<Suspense fallback={<FullPageLoader />}><HrEmployeesPage /></Suspense>} />,
    <Route key="hr/employees/new" path="hr/employees/new" element={<Suspense fallback={<FullPageLoader />}><HrEmployeeNewPage /></Suspense>} />,
    <Route key="hr/employees/:name" path="hr/employees/:name" element={<Suspense fallback={<FullPageLoader />}><HrEmployeeDetailPage /></Suspense>} />,
    <Route key="hr/departments" path="hr/departments" element={<Suspense fallback={<FullPageLoader />}><HrDepartmentsPage /></Suspense>} />,
    <Route key="hr/departments/:name" path="hr/departments/:name" element={<Suspense fallback={<FullPageLoader />}><HrDepartmentFormPage /></Suspense>} />,
    <Route key="hr/designations" path="hr/designations" element={<Suspense fallback={<FullPageLoader />}><HrDesignationsPage /></Suspense>} />,
    <Route key="hr/designations/:name" path="hr/designations/:name" element={<Suspense fallback={<FullPageLoader />}><HrDesignationFormPage /></Suspense>} />,
    <Route key="hr/branches" path="hr/branches" element={<Suspense fallback={<FullPageLoader />}><HrBranchesPage /></Suspense>} />,
    <Route key="hr/attendance" path="hr/attendance" element={<Suspense fallback={<FullPageLoader />}><HrAttendancePage /></Suspense>} />,
    <Route key="hr/roster" path="hr/roster" element={<Suspense fallback={<FullPageLoader />}><HrRosterPage /></Suspense>} />,
    <Route key="hr/leave-applications" path="hr/leave-applications" element={<Suspense fallback={<FullPageLoader />}><HrLeaveApplicationsPage /></Suspense>} />,
    <Route key="hr/leave-applications/:name" path="hr/leave-applications/:name" element={<Suspense fallback={<FullPageLoader />}><HrDocPage which="leaveApplication" form /></Suspense>} />,
    <Route key="hr/leave-allocations" path="hr/leave-allocations" element={<Suspense fallback={<FullPageLoader />}><HrLeaveAllocationsPage /></Suspense>} />,
    <Route key="hr/holiday-lists" path="hr/holiday-lists" element={<Suspense fallback={<FullPageLoader />}><HrHolidayListsPage /></Suspense>} />,
    <Route key="hr/expense-claims" path="hr/expense-claims" element={<Suspense fallback={<FullPageLoader />}><HrExpenseClaimsPage /></Suspense>} />,
    <Route key="hr/expense-claims/:name" path="hr/expense-claims/:name" element={<Suspense fallback={<FullPageLoader />}><HrDocPage which="expenseClaim" form /></Suspense>} />,
    <Route key="hr/advances" path="hr/advances" element={<Suspense fallback={<FullPageLoader />}><HrEmployeeAdvancesPage /></Suspense>} />,
    <Route key="hr/loans" path="hr/loans" element={<Suspense fallback={<FullPageLoader />}><HrSalaryLoansPage /></Suspense>} />,
    <Route key="hr/advances/:name" path="hr/advances/:name" element={<Suspense fallback={<FullPageLoader />}><HrDocPage which="employeeAdvance" form /></Suspense>} />,
    <Route key="hr/gratuity" path="hr/gratuity" element={<Suspense fallback={<FullPageLoader />}><HrGratuityPage /></Suspense>} />,
    <Route key="payroll" path="payroll" element={<Suspense fallback={<FullPageLoader />}><PayrollHomePage /></Suspense>} />,
    <Route key="payroll/settings" path="payroll/settings" element={<Suspense fallback={<FullPageLoader />}><HrDocPage which="payrollSettings" /></Suspense>} />,
    <Route key="payroll/salary-components" path="payroll/salary-components" element={<Suspense fallback={<FullPageLoader />}><PayrollSalaryComponentsPage /></Suspense>} />,
    <Route key="payroll/salary-structures" path="payroll/salary-structures" element={<Suspense fallback={<FullPageLoader />}><PayrollSalaryStructuresPage /></Suspense>} />,
    <Route key="payroll/salary-structure-assignments" path="payroll/salary-structure-assignments" element={<Suspense fallback={<FullPageLoader />}><PayrollSalaryStructureAssignmentsPage /></Suspense>} />,
    <Route key="payroll/salary-slips" path="payroll/salary-slips" element={<Suspense fallback={<FullPageLoader />}><PayrollSalarySlipsPage /></Suspense>} />,
    <Route key="payroll/salary-slips/:name" path="payroll/salary-slips/:name" element={<Suspense fallback={<FullPageLoader />}><PayrollSalarySlipDetailPage /></Suspense>} />,
    <Route key="import/supplier-quotations" path="import/supplier-quotations" element={<Suspense fallback={<FullPageLoader />}><SupplierQuotationsPage /></Suspense>} />,
    <Route key="import/supplier-quotations/new" path="import/supplier-quotations/new" element={<Suspense fallback={<FullPageLoader />}><SupplierQuotationPage /></Suspense>} />,
    <Route key="import/supplier-quotations/:name" path="import/supplier-quotations/:name" element={<Suspense fallback={<FullPageLoader />}><SupplierQuotationPage /></Suspense>} />,
    <Route key="import/supplier-quotations/:name/edit" path="import/supplier-quotations/:name/edit" element={<Suspense fallback={<FullPageLoader />}><SupplierQuotationPage /></Suspense>} />,
    // Dashboards (mm_core.dashboards): the spinning-mill ones (production, work orders, export / import) are not used here.
    <Route key="analytics" path="analytics" element={<Navigate to="/analytics/accounts" replace />} />,
    ...["analytics/suite/production", "analytics/production", "analytics/wo_analysis", "analytics/jc_analysis", "analytics/export_analysis", "analytics/import_analysis", "analytics/suite/trade"]
      .map((path) => <Route key={path} path={path} element={<Navigate to="/production" replace />} />),
    <Route key="analytics/suite/:suite" path="analytics/suite/:suite" element={<Suspense fallback={<FullPageLoader />}><AnalyticsSuitePage /></Suspense>} />,
    <Route key="analytics/pnl-simulator" path="analytics/pnl-simulator" element={<Suspense fallback={<FullPageLoader />}><PnlSimulatorPage /></Suspense>} />,
    <Route key="dashboard" path="dashboard" element={<Suspense fallback={<FullPageLoader />}><ExecutiveDashboardPage /></Suspense>} />,
    <Route key="analytics/:module" path="analytics/:module" element={<Suspense fallback={<FullPageLoader />}><AnalyticsDashboardPage /></Suspense>} />,
    ...STOCK_MASTER_BASES.flatMap((base) => [
      <Route key={base} path={base.slice(1)} element={<Suspense fallback={<FullPageLoader />}><StockMasterList base={base} /></Suspense>} />,
      <Route key={`${base}/:name`} path={`${base.slice(1)}/:name`} element={<Suspense fallback={<FullPageLoader />}><StockMasterForm base={base} /></Suspense>} />,
    ]),
    ...SELLING_MASTER_BASES.flatMap((base) => [
      <Route key={base} path={base.slice(1)} element={<Suspense fallback={<FullPageLoader />}><SellingMasterList base={base} /></Suspense>} />,
      <Route key={`${base}/:name`} path={`${base.slice(1)}/:name`} element={<Suspense fallback={<FullPageLoader />}><SellingMasterForm base={base} /></Suspense>} />,
    ]),
    <Route key="accounting/tax-templates/sales" path="accounting/tax-templates/sales" element={<Suspense fallback={<FullPageLoader />}>
      <TaxTemplatesPage doctype="Sales Taxes and Charges Template" title="Sales Tax Templates" subtitle="Taxes and charges applied on sugar and by-product sales" /></Suspense>} />,
    <Route key="accounting/tax-templates/purchase" path="accounting/tax-templates/purchase" element={<Suspense fallback={<FullPageLoader />}>
      <TaxTemplatesPage doctype="Purchase Taxes and Charges Template" title="Purchase Tax Templates" subtitle="Taxes and charges applied on purchase invoices" /></Suspense>} />,
    ...HR_DOC_ROUTES.flatMap(([path, which]) => [
      <Route key={path} path={path} element={<Suspense fallback={<FullPageLoader />}><HrDocPage which={which} /></Suspense>} />,
      <Route key={`${path}/:name`} path={`${path}/:name`} element={<Suspense fallback={<FullPageLoader />}><HrDocPage which={which} form /></Suspense>} />,
    ]),
  ];
}
