import { Building, CreditCard, Link2, NotebookTabs, ScanSearch } from "lucide-react";
import { Link } from "react-router-dom";
import { useFrappeGetDocList } from "frappe-react-sdk";
import type { DocConfig } from "@/components/doc/doc-config";
import { docUrl } from "@/app/doc-routes";
import { BankInsights } from "./bank-insights";
import {
  check, colBreak, currency, data, date, dateCol, int, link, moneyCol, nameCol, ro, req, sec, select, statusCol, text, textCol, when,
  yesNoCol,
} from "@/components/doc/doc-helpers";
import { getLinkedValues } from "@/hooks/useDoc";
import { todayISO } from "@/utils/dates";

/* ============================================================================ Bank */
export const BANK_CONFIG: DocConfig = {
  doctype: "Bank",
  base: "/accounting/banks",
  singular: "Bank",
  plural: "Banks",
  subtitle: "Bank balances, money in and out, uncleared items and cheques — then the banks list",
  icon: Building,
  companyScoped: false,
  listFields: ["name", "bank_name", "swift_number", "website", "modified"],
  columns: [nameCol("Bank", (r) => r.swift_number), textCol("swift_number", "SWIFT"), textCol("website", "Website")],
  searchFields: ["name", "bank_name", "swift_number"],
  sort: { key: "bank_name", dir: "asc" },
  listHeaderExtra: <BankInsights />,
  // Bank is a shared master (no company): list the banks the selected company has bank accounts with.
  useScopeFilters: (company) => {
    const { data } = useFrappeGetDocList<{ bank: string }>("Bank Account", {
      fields: ["bank"] as never,
      filters: [["is_company_account", "=", 1], ...(company ? [["company", "=", company]] : [])] as never,
      limit: 500,
    }, `micromax.banks.company.${company ?? ""}`);
    if (!data) return undefined;
    const banks = [...new Set(data.map((d) => d.bank).filter(Boolean))];
    return [["name", "in", banks.length ? banks : ["__none__"]]];
  },
  fields: [
    sec("Bank"),
    req(data("bank_name", "Bank Name")),
    data("swift_number", "SWIFT Number"),
    colBreak(),
    data("website", "Website"),
  ],
  defaults: () => ({}),
};

/* ============================================================================ Bank Account */
export const BANK_ACCOUNT_CONFIG: DocConfig = {
  doctype: "Bank Account",
  base: "/accounting/bank-accounts",
  singular: "Bank Account",
  plural: "Bank Accounts",
  subtitle: "Company and party bank accounts, each mapped to its ledger account",
  icon: CreditCard,
  listFields: ["name", "account_name", "bank", "bank_account_no", "account", "company", "is_company_account", "is_default", "disabled"],
  columns: [nameCol("Bank Account", (r) => r.bank), textCol("bank_account_no", "Account No"), textCol("account", "Ledger Account"),
    yesNoCol("is_company_account", "Company"), yesNoCol("is_default", "Default")],
  searchFields: ["name", "account_name", "bank", "bank_account_no", "iban"],
  sort: { key: "account_name", dir: "asc" },
  fields: [
    sec("Account"),
    req(data("account_name", "Account Name")),
    req(link("bank", "Bank", "Bank")),
    link("account_type", "Account Type", "Bank Account Type"),
    link("account_subtype", "Account Subtype", "Bank Account Subtype"),
    colBreak(),
    check("is_company_account", "Company Account"),
    when(link("company", "Company", "Company"), (v) => Boolean(v.is_company_account)),
    when(link("account", "Ledger Account", "Account", { description: "The bank's account in the chart of accounts." }), (v) => Boolean(v.is_company_account)),
    check("is_default", "Default Account"),
    check("disabled", "Disabled"),
    sec("Details"),
    data("bank_account_no", "Bank Account No"),
    data("iban", "IBAN"),
    data("branch_code", "Branch Code"),
    colBreak(),
    when(link("party_type", "Party Type", "DocType"), (v) => !v.is_company_account),
    when(data("party", "Party"), (v) => !v.is_company_account),
  ],
  defaults: ({ company }) => ({ company, is_company_account: 1 }),
};

/* ============================================================================ Plaid Settings */
export const PLAID_SETTINGS_CONFIG: DocConfig = {
  doctype: "Plaid Settings",
  base: "/accounting/plaid-settings",
  singular: "Plaid Settings",
  plural: "Plaid Settings",
  subtitle: "Bank feeds through Plaid (bank transactions synced automatically)",
  icon: Link2,
  single: true,
  companyScoped: false,
  listFields: [],
  columns: [],
  searchFields: [],
  fields: [
    sec("Plaid"),
    check("enabled", "Enabled"),
    check("automatic_sync", "Synchronize all accounts every hour"),
    check("enable_european_access", "Enable European Access"),
    colBreak(),
    data("plaid_client_id", "Plaid Client ID"),
    data("plaid_secret", "Plaid Secret"),
    select("plaid_env", "Plaid Environment", ["sandbox", "development", "production"]),
  ],
  defaults: () => ({}),
};

/* ============================================================================ Cheque Book (mm_core) */
export const CHEQUE_BOOK_CONFIG: DocConfig = {
  doctype: "Cheque Book",
  base: "/accounting/cheque-books",
  singular: "Cheque Book",
  plural: "Cheque Books",
  subtitle: "Cheque books from the bank and every leaf: unused, issued, cleared, void, stopped or dishonoured",
  icon: NotebookTabs,
  listFields: ["name", "bank_account", "bank", "posting_date", "no_of_leaves", "from_serial", "to_serial", "leaves_in_hand", "leaves_issued",
    "issued_amount", "status"],
  columns: [
    nameCol("Cheque Book", (r) => `${r.from_serial} – ${r.to_serial}`),
    textCol("bank_account", "Bank Account"),
    dateCol("posting_date", "Posted"),
    textCol("leaves_in_hand", "Unused", { align: "right" }),
    textCol("leaves_issued", "Issued / Cleared", { align: "right" }),
    moneyCol("issued_amount", "Issued Amount"),
    statusCol("status", "Cheque Book Status", "Unused"),
  ],
  searchFields: ["name", "bank_account", "from_serial"],
  listActions: (
    <Link to="/accounting/cheque-tracking" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted">
      <ScanSearch className="h-4 w-4" /> Track a cheque
    </Link>
  ),
  statusField: "status",
  statuses: ["Unused", "In Use", "Exhausted", "Cancelled"],
  dateField: "posting_date",
  sort: { key: "posting_date", dir: "desc" },
  fields: [
    sec("Cheque Book"),
    req(link("company", "Company", "Company")),
    req(link("bank_account", "Bank Account", "Bank Account")),
    ro(data("bank", "Bank")),
    ro(data("account", "Bank GL Account")),
    colBreak(),
    req(date("posting_date", "Posting Date")),
    date("issue_date", "Issue Date", { description: "Date the bank issued the book." }),
    req(int("no_of_leaves", "No of Leaves")),
    req(data("from_serial", "From Serial", { description: "First cheque number; leaves are created when you save." })),
    ro(data("to_serial", "To Serial")),
    ro(data("status", "Cheque Book Status")),
    sec("Summary"),
    ro(int("leaves_in_hand", "Unused Leaves")),
    ro(int("leaves_issued", "Issued / Cleared")),
    colBreak(),
    ro(int("leaves_cancelled", "Void / Stopped / Dishonoured")),
    ro(currency("issued_amount", "Issued Amount")),
    sec("Remarks"),
    text("remarks", "Remarks"),
  ],
  children: [
    {
      key: "leaves",
      label: "Cheque Leaves",
      description: "A payment or bank journal entry with mode Cheque takes the next unused leaf and issues it on submit; Cleared when the bank clearance date is saved. Mark spoiled cheques Void, stop-payments Stopped and returned cheques Dishonoured, with a reason.",
      doctype: "Cheque Book Leaf",
      wide: true,
      columns: [
        int("sno", "S.No"),
        req(data("cheque_no", "Cheque No")),
        select("status", "Leaf Status", ["Unused", "Issued", "Cleared", "Void", "Stopped", "Dishonoured"]),
        date("issue_date", "Issue Date"),
        select("party_type", "Party Type", ["", "Supplier", "Customer", "Employee", "Shareholder"]),
        data("party", "Issued To"),
        currency("amount", "Amount"),
        ro(data("voucher_no", "Voucher No")),
        text("cancel_reason", "Reason (Void / Stopped / Dishonoured)"),
      ],
      dialogColumns: [data("party_name", "Party Name"), ro(data("voucher_type", "Voucher Type")), ro(data("voucher_no", "Voucher No")),
        ro(date("clearance_date", "Clearance Date"))],
      // Voucher No opens the payment / journal entry that issued the cheque.
      renderCell: (row, col) => {
        if ((col.fieldname !== "voucher_no") || !row.voucher_no || !row.voucher_type) return undefined;
        const u = docUrl(String(row.voucher_type), String(row.voucher_no));
        const cls = "text-xs font-medium text-primary hover:underline";
        return u.external
          ? <a href={u.href} className={cls} title={String(row.voucher_type)}>{String(row.voucher_no)}</a>
          : <Link to={u.href} className={cls} title={String(row.voucher_type)}>{String(row.voucher_no)}</Link>;
      },
      newRow: (_v, rows) => ({ sno: rows.length + 1, status: "Unused" }),
      totals: (rows) => [
        { label: "Unused", value: rows.filter((r) => r.status === "Unused").length },
        { label: "Issued", value: rows.filter((r) => r.status === "Issued").length },
        { label: "Cleared", value: rows.filter((r) => r.status === "Cleared").length },
        { label: "Issued amount", value: rows.filter((r) => r.status === "Issued" || r.status === "Cleared").reduce((s, r) => s + Number(r.amount || 0), 0).toLocaleString(), align: "right" },
      ],
    },
  ],
  defaults: ({ company }) => ({ company, posting_date: todayISO(), issue_date: todayISO(), no_of_leaves: 25 }),
  linkEffects: {
    bank_account: async (ba) => {
      const v = ba ? await getLinkedValues("Bank Account", ba, ["bank", "account"]) : {};
      return { bank: v?.bank ?? "", account: v?.account ?? "" };
    },
  },
};

export const BANKING_CONFIGS = [BANK_CONFIG, BANK_ACCOUNT_CONFIG, CHEQUE_BOOK_CONFIG];
