import { BookOpen, FileText, NotebookPen, SlidersHorizontal } from "lucide-react";
import type { ChildTableSpec, DocConfig, DocValues } from "@/components/doc/doc-config";
import {
  sec, colBreak, tab, data, date, float, currency, check, text, link, select, ro, req, when,
  nameCol, textCol, dateCol, moneyCol, statusCol, fmtMoney,
} from "@/components/doc/doc-helpers";
import { InsightsPanel } from "@/components/doc/insights-panel";
import { LedgerPanel } from "@/components/doc/ledger-panel";
import { postCall } from "@/services/frappe";
import { todayISO } from "@/utils/dates";
import { asNumber } from "@/utils/cn";

const VOUCHER_TYPES = ["Journal Entry", "Bank Entry", "Cash Entry", "Credit Card Entry", "Debit Note", "Credit Note", "Contra Entry", "Excise Entry", "Write Off Entry",
  "Opening Entry", "Depreciation Entry", "Exchange Rate Revaluation", "Exchange Gain Or Loss", "Deferred Revenue", "Deferred Expense", "Inter Company Journal Entry"];

const ACCOUNTS: ChildTableSpec = {
  tab: "Entry",
  key: "accounts",
  label: "Accounting Entries",
  description: "Debits must equal credits. Party and reference link a line to a customer / supplier and the invoice it settles.",
  doctype: "Journal Entry Account",
  minRows: 2,
  wide: true,
  columns: [
    req(link("account", "Account", "Account")),
    select("party_type", "Party Type", ["", "Customer", "Supplier", "Employee", "Shareholder"]),
    { fieldname: "party", label: "Party", fieldtype: "Dynamic Link", options: "party_type" },
    currency("debit_in_account_currency", "Debit"),
    currency("credit_in_account_currency", "Credit"),
    link("cost_center", "Cost Center", "Cost Center"),
  ],
  dialogColumns: [
    select("reference_type", "Reference Type", ["", "Sales Invoice", "Purchase Invoice", "Journal Entry", "Sales Order", "Purchase Order", "Expense Claim", "Asset", "Loan", "Payroll Entry", "Employee Advance"]),
    { fieldname: "reference_name", label: "Reference Name", fieldtype: "Dynamic Link", options: "reference_type" },
    link("project", "Project", "Project"),
    ro(link("account_currency", "Account Currency", "Currency")),
    float("exchange_rate", "Exchange Rate"),
    select("is_advance", "Is Advance", ["No", "Yes"]),
    link("bank_account", "Bank Account", "Bank Account"),
    text("user_remark", "Line Remark"),
  ],
  newRow: (v, rows) => {
    // Pre-fill the balancing amount on the new line.
    const dr = rows.reduce((s, r) => s + asNumber(r.debit_in_account_currency), 0);
    const cr = rows.reduce((s, r) => s + asNumber(r.credit_in_account_currency), 0);
    return { cost_center: v.cost_center, exchange_rate: 1, debit_in_account_currency: cr > dr ? cr - dr : 0, credit_in_account_currency: dr > cr ? dr - cr : 0, is_advance: "No" };
  },
  linkEffects: {
    account: async (acc) => {
      const v = await postCall<DocValues>("frappe.client.get_value", { doctype: "Account", filters: acc, fieldname: JSON.stringify(["account_currency", "account_type"]) }).catch(() => ({}) as DocValues);
      const party_type = v.account_type === "Receivable" ? "Customer" : v.account_type === "Payable" ? "Supplier" : undefined;
      return { account_currency: v.account_currency, ...(party_type ? { party_type } : {}) };
    },
  },
  totals: (rows) => {
    const dr = rows.reduce((s, r) => s + asNumber(r.debit_in_account_currency) * (asNumber(r.exchange_rate) || 1), 0);
    const cr = rows.reduce((s, r) => s + asNumber(r.credit_in_account_currency) * (asNumber(r.exchange_rate) || 1), 0);
    return [
      { label: "Debit", value: fmtMoney(dr), align: "right" },
      { label: "Credit", value: fmtMoney(cr), align: "right" },
      { label: Math.abs(dr - cr) < 0.005 ? "Balanced" : "Difference", value: fmtMoney(dr - cr), align: "right" },
    ];
  },
};

export const JOURNAL_ENTRY_CONFIG: DocConfig = {
  doctype: "Journal Entry",
  base: "/accounting/journal-entries",
  singular: "Journal Entry",
  plural: "Journal Entries",
  subtitle: "Double-entry vouchers — bank, cash, adjustments, depreciation and opening balances",
  icon: NotebookPen,
  submittable: true,
  listFields: ["name", "voucher_type", "posting_date", "total_debit", "cheque_no", "user_remark", "remark", "docstatus", "modified"],
  columns: [nameCol("Entry", (r) => r.voucher_type), dateCol("posting_date", "Date"), moneyCol("total_debit", "Amount"), textCol("cheque_no", "Reference"), statusCol("voucher_type", "Type", "Journal Entry")],
  searchFields: ["name", "cheque_no", "bill_no", "remark"],
  statusField: "voucher_type",
  statuses: ["Journal Entry", "Bank Entry", "Cash Entry", "Depreciation Entry", "Opening Entry", "Contra Entry", "Credit Note", "Debit Note", "Write Off Entry"],
  dateField: "posting_date",
  sort: { key: "posting_date", dir: "desc" },
  fields: [
    tab("Entry"),
    sec("Voucher"),
    data("title", "Title"), // editable after submit too; ERPNext fills it from the first party / account when left empty
    req(select("voucher_type", "Entry Type", VOUCHER_TYPES)),
    req(select("naming_series", "Series", ["ACC-JV-.FY.-"])),
    req(date("posting_date", "Posting Date")),
    colBreak(),
    req(link("company", "Company", "Company")),
    link("from_template", "From Template", "Journal Entry Template"),
    link("cost_center", "Default Cost Center", "Cost Center"),
    link("mode_of_payment", "Mode of Payment", "Mode of Payment"),
    tab("Reference"),
    sec("Cheque / reference"),
    data("cheque_no", "Reference Number"),
    date("cheque_date", "Reference Date"),
    ro(date("clearance_date", "Clearance Date")),
    colBreak(),
    data("bill_no", "Bill No"),
    date("bill_date", "Bill Date"),
    date("due_date", "Due Date"),
    sec("Pay to / received from"),
    data("pay_to_recd_from", "Pay To / Received From"),
    tab("Ledger"),
    tab("More"),
    sec("Options"),
    check("multi_currency", "Multi Currency"),
    select("is_opening", "Is Opening", ["No", "Yes"]),
    link("finance_book", "Finance Book", "Finance Book"),
    colBreak(),
    check("apply_tds", "Apply Tax Withholding"),
    when(link("tax_withholding_category", "Tax Withholding Category", "Tax Withholding Category"), (v) => Boolean(v.apply_tds)),
    when(select("write_off_based_on", "Write Off Based On", ["Accounts Receivable", "Accounts Payable"]), (v) => v.voucher_type === "Write Off Entry"),
    when(currency("write_off_amount", "Write Off Amount"), (v) => v.voucher_type === "Write Off Entry"),
    sec("Remarks"),
    text("user_remark", "User Remark"),
    ro(text("remark", "Remark (system)")),
  ],
  children: [ACCOUNTS],
  linkEffects: {
    // Template → its voucher type and account lines (amounts left for the user).
    from_template: async (t: string) => {
      if (!t) return;
      const tpl = await postCall<DocValues>("frappe.client.get", { doctype: "Journal Entry Template", name: t });
      return {
        voucher_type: tpl.voucher_type, multi_currency: tpl.multi_currency, is_opening: tpl.is_opening,
        accounts: (tpl.accounts ?? []).map((r: DocValues) => ({ account: r.account, party_type: r.party_type, party: r.party, cost_center: r.cost_center, exchange_rate: 1, debit_in_account_currency: 0, credit_in_account_currency: 0 })),
      };
    },
  },
  // Company-currency debit / credit from the account-currency amounts, and the voucher totals.
  compute: (_v, rows) => {
    const accounts: DocValues[] = (rows.accounts ?? []).map((r) => {
      const x = asNumber(r.exchange_rate) || 1;
      return { ...r, debit: asNumber(r.debit_in_account_currency) * x, credit: asNumber(r.credit_in_account_currency) * x };
    });
    const dr = accounts.reduce((s, r) => s + asNumber(r.debit), 0);
    const cr = accounts.reduce((s, r) => s + asNumber(r.credit), 0);
    return { rows: { accounts }, values: { total_debit: dr, total_credit: cr, difference: Math.round((dr - cr) * 100) / 100 } };
  },
  validate: (v): Record<string, string> => (Math.abs(asNumber(v.difference)) > 0.005 ? { difference: `Debits and credits differ by ${fmtMoney(v.difference)}` } : {}),
  tabIcons: { Entry: NotebookPen, Reference: FileText, Ledger: BookOpen, More: SlidersHorizontal },
  tabPanels: {
    Entry: { before: (c) => <InsightsPanel method="sugarcane.erp_insights.accounting_insights.get_je_insights" args={{ name: c.name }} cacheKey={!c.isNew && c.name ? `je-insights:${c.name}:${c.values.modified ?? ""}` : null} /> },
    Ledger: { before: (c) => <LedgerPanel doctype="Journal Entry" name={c.name} docstatus={c.docstatus} /> },
  },
  defaults: ({ company }) => ({ company, voucher_type: "Journal Entry", naming_series: "ACC-JV-.FY.-", posting_date: todayISO(), is_opening: "No" }),
  summary: (v) => [
    { label: "Debit", value: fmtMoney(v.total_debit), tone: "sky" },
    { label: "Credit", value: fmtMoney(v.total_credit), tone: "emerald" },
    { label: Math.abs(asNumber(v.difference)) < 0.005 ? "Balanced" : "Difference", value: fmtMoney(v.difference), tone: Math.abs(asNumber(v.difference)) < 0.005 ? "teal" : "rose" },
  ],
  titleOf: (v) => (v.name ? `${v.name} · ${v.voucher_type ?? ""}` : "New Journal Entry"),
};

