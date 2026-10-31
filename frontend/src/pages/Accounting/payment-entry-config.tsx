import { useState } from "react";
import useSWR from "swr";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, BookOpen, Building2, CheckCircle2, Coins, CreditCard, Download, FileText, Landmark, Loader2, Receipt, Scale, SlidersHorizontal, Wallet } from "lucide-react";
import type { ChildTableSpec, DocConfig, ExtraContext } from "@/components/doc/doc-config";
import {
  sec, colBreak, tab, data, date, float, currency, check, text, link, select, ro, req, when,
  nameCol, textCol, dateCol, moneyCol, statusCol, fmtMoney,
} from "@/components/doc/doc-helpers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { docUrl } from "@/app/doc-routes";
import { getAccountPaymentDetails, getOutstandingReferenceDocuments, getPartyPaymentDetails } from "@/hooks/usePaymentEntries";
import { humanizeError, postCall } from "@/services/frappe";
import { todayISO } from "@/utils/dates";
import { asNumber, cn } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";
import { Tile } from "@/pages/Production/plan-panels";

/** The party's receivable/payable account: paid_from on a Receive, paid_to on a Pay. */
const partyAccountField = (t?: string): "paid_from" | "paid_to" => (t === "Pay" ? "paid_to" : "paid_from");
const bankField = (t?: string): "paid_from" | "paid_to" => (t === "Pay" ? "paid_from" : "paid_to");
const money = (v: unknown, cur = "PKR") => formatMoney(asNumber(v), cur, { decimals: 2 });

interface PeInsights {
  bank_account: string | null; bank_balance: number | null; party_balance: number | null;
  allocated: number; unallocated: number; paid: number;
  references: { doctype: string; name: string; bill_no?: string; due_date?: string; total: number; allocated: number; this_pct: number;
    others: number; others_pct: number; others_detail: string | null; due_now: number | null; due_pct: number; status: string | null }[];
  gl: { account: string; party?: string; debit: number; credit: number; against_voucher_type?: string; against_voucher?: string; cost_center?: string }[];
  gl_debit: number; gl_credit: number;
}
const usePeInsights = (c: ExtraContext) =>
  useSWR(!c.isNew && c.name ? `pe-insights:${c.name}:${c.values.modified ?? ""}` : null,
    () => postCall<PeInsights>("sugarcane.erp_insights.payment_insights.get_payment_insights", { name: c.name }), { revalidateOnFocus: false });

/* ------------------------------------------------------------------ Payment tab: at a glance */
function PaymentGlance(c: ExtraContext) {
  const v = c.values;
  const { data } = usePeInsights(c);
  const cur = v.paid_from_account_currency || "PKR";
  const paid = asNumber(v.paid_amount);
  const alloc = (c.rows.references ?? []).reduce((s, r) => s + asNumber(r.allocated_amount), 0);
  const ded = (c.rows.deductions ?? []).reduce((s, r) => s + asNumber(r.amount), 0);
  const unalloc = paid - alloc;
  const pct = paid ? Math.min(100, (alloc / paid) * 100) : 0;
  const dir = v.payment_type === "Pay" ? { icon: <ArrowUpRight className="h-4 w-4" />, t: "Paid to", tone: "rose" as const }
    : v.payment_type === "Receive" ? { icon: <ArrowDownLeft className="h-4 w-4" />, t: "Received from", tone: "emerald" as const }
    : { icon: <ArrowRightLeft className="h-4 w-4" />, t: "Transfer", tone: "sky" as const };
  // Party balance from the GL is debit − credit; show it the way the party sees it.
  const pb = data?.party_balance;
  const partyBal = pb == null ? "—" : v.party_type === "Supplier" ? (pb <= 0 ? `${money(-pb, cur)} payable` : `${money(pb, cur)} advance`)
    : v.party_type === "Customer" ? (pb >= 0 ? `${money(pb, cur)} receivable` : `${money(-pb, cur)} advance`) : money(pb, cur);
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-primary/10 via-transparent to-transparent p-5">
        <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", dir.tone === "rose" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : dir.tone === "emerald" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-sky-500/15 text-sky-600")}>
          {dir.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{v.payment_type || "Payment"} · {v.mode_of_payment || "—"} {v.reference_no ? `· Ref ${v.reference_no}` : ""}</p>
          <p className="truncate text-2xl font-bold tabular-nums">{money(paid, cur)}</p>
          <p className="truncate text-sm text-muted-foreground">{dir.t} <b className="text-foreground">{v.party_name || v.party || v.paid_to || "—"}</b>{v.posting_date ? ` on ${v.posting_date}` : ""}</p>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={<CheckCircle2 className="h-4 w-4" />} label="Allocated" value={money(alloc, cur)} sub={`${(c.rows.references ?? []).length} documents · ${pct.toFixed(0)}%`} tone={unalloc <= 0.005 ? "emerald" : "amber"} />
        <Tile icon={<Wallet className="h-4 w-4" />} label="Unallocated" value={money(unalloc, cur)} sub={unalloc > 0.005 ? "held as advance" : "fully allocated"} tone={unalloc > 0.005 ? "amber" : "emerald"} />
        <Tile icon={<Building2 className="h-4 w-4" />} label="Party balance" value={partyBal} sub={v.party_type ? `${v.party_type} ledger, all time` : "no party"} tone="violet" />
        <Tile icon={<Landmark className="h-4 w-4" />} label="Bank / cash balance" value={data?.bank_balance != null ? money(data.bank_balance, cur) : "—"} sub={data?.bank_account ?? v[bankField(v.payment_type)] ?? "—"} tone="sky" />
      </div>
      <Card className="p-4">
        <div className="mb-2 flex justify-between text-xs"><span className="font-medium">Allocation</span><span className="tabular-nums text-muted-foreground">{money(alloc, cur)} of {money(paid, cur)}{ded ? ` · deductions ${money(ded, cur)}` : ""}</span></div>
        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
          <div className="bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
          {unalloc > 0 && <div className="bg-amber-400" style={{ width: `${paid ? (unalloc / paid) * 100 : 0}%` }} />}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ References tab: outstanding + settlement status */
function ReferencesPanel(c: ExtraContext) {
  const v = c.values;
  const [busy, setBusy] = useState(false);
  const { data } = usePeInsights(c);
  const canFetch = !c.readOnly && v.payment_type !== "Internal Transfer" && v.party_type && v.party && v.company;
  const fetchOutstanding = async () => {
    const partyAccount = v[partyAccountField(v.payment_type)];
    if (!partyAccount) return void toast.error("Select the party first so its receivable/payable account is known");
    setBusy(true);
    try {
      const found = await getOutstandingReferenceDocuments({ company: v.company, party_type: v.party_type, party: v.party, party_account: partyAccount, payment_type: v.payment_type || "Receive" });
      const existing = c.rows.references ?? [];
      const keys = new Set(existing.map((r) => `${r.reference_doctype}::${r.reference_name}`));
      const add = found.filter((r) => !keys.has(`${r.voucher_type}::${r.voucher_no}`));
      if (!add.length) return void toast("No new outstanding documents");
      let remaining = Math.max(asNumber(v.paid_amount) - existing.reduce((s, r) => s + asNumber(r.allocated_amount), 0), 0);
      const rows = add.map((r) => {
        const a = remaining > 0 ? Math.min(r.outstanding_amount, remaining) : 0;
        remaining = Math.max(remaining - a, 0);
        return { reference_doctype: r.voucher_type, reference_name: r.voucher_no, due_date: r.due_date, bill_no: r.bill_no, total_amount: r.invoice_amount,
          outstanding_amount: r.outstanding_amount, allocated_amount: Math.round(a * 100) / 100, exchange_rate: r.exchange_rate ?? 1 };
      });
      c.patch({ references: [...existing, ...rows] });
      toast.success(`Added ${rows.length} outstanding document${rows.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      {!c.readOnly && (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <FileText className="h-5 w-5 text-primary" />
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">Pull the party's unpaid invoices and allocate this payment to them, oldest first.</p>
          <Button size="sm" onClick={() => void fetchOutstanding()} disabled={!canFetch || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Get Outstanding Invoices
          </Button>
        </Card>
      )}
      {data && data.references.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-5 py-3">
            <div>
              <p className="text-sm font-semibold">Settlement status</p>
              <p className="text-xs text-muted-foreground">How each document was settled — by this payment, by other payments / entries, and what is still due today</p>
            </div>
            <div className="flex gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-emerald-500" /> This payment</span>
              <span className="flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-sky-400" /> Other settlements</span>
              <span className="flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-amber-500" /> Still due</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Document</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">This payment</th>
                  <th className="px-3 py-2 text-right">Other settlements</th>
                  <th className="w-44 px-3 py-2 text-left">Settlement</th>
                  <th className="px-3 py-2 text-right">Due now</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.references.map((r) => {
                  const u = docUrl(r.doctype, r.name);
                  return (
                    <tr key={`${r.doctype}-${r.name}`} className="border-t border-border/60 hover:bg-muted/30">
                      <td className="px-4 py-2">{u.external ? <a className="font-medium text-primary hover:underline" href={u.href} target="_blank" rel="noreferrer">{r.name}</a> : <Link className="font-medium text-primary hover:underline" to={u.href}>{r.name}</Link>}
                        <p className="text-[11px] text-muted-foreground">{r.doctype}{r.bill_no ? ` · bill ${r.bill_no}` : ""}{r.due_date ? ` · due ${r.due_date}` : ""}</p></td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.total)}</td>
                      <td className="px-3 py-2 text-right tabular-nums"><span className="font-semibold text-emerald-700 dark:text-emerald-400">{money(r.allocated)}</span>
                        <p className="text-[10px] text-muted-foreground">{r.this_pct}% of the document</p></td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.others ? money(r.others) : "—"}
                        {r.others_detail && <p className="text-[10px] text-muted-foreground">{r.others_detail}</p>}</td>
                      <td className="px-3 py-2">
                        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" title={`This payment ${r.this_pct}% · others ${r.others_pct}% · due ${r.due_pct}%`}>
                          <div className="bg-emerald-500" style={{ width: `${r.this_pct}%` }} />
                          <div className="bg-sky-400" style={{ width: `${r.others_pct}%` }} />
                          <div className="bg-amber-500" style={{ width: `${r.due_pct}%` }} />
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{r.due_pct > 0 ? `${r.due_pct}% still due` : "fully settled"}</p>
                      </td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", (r.due_now ?? 0) > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>{r.due_now == null ? "—" : money(r.due_now)}</td>
                      <td className="px-4 py-2"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.status ?? "—"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-border font-semibold">
                <tr>
                  <td className="px-4 py-2">Total ({data.references.length})</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(data.references.reduce((x, r) => x + r.total, 0))}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{money(data.references.reduce((x, r) => x + r.allocated, 0))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(data.references.reduce((x, r) => x + r.others, 0))}</td>
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums">{money(data.references.reduce((x, r) => x + (r.due_now ?? 0), 0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Ledger tab */
function LedgerPanel(c: ExtraContext) {
  const { data, isLoading } = usePeInsights(c);
  if (c.isNew) return <Card className="p-8 text-center text-sm text-muted-foreground">The accounting entries appear here once the payment is submitted.</Card>;
  if (isLoading && !data) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const gl = data?.gl ?? [];
  if (!gl.length) return <Card className="p-8 text-center text-sm text-muted-foreground">{c.docstatus === 1 ? "No ledger entries found." : "Nothing posted yet — submit the payment to post it to the ledger."}</Card>;
  const balanced = Math.abs((data?.gl_debit ?? 0) - (data?.gl_credit ?? 0)) < 0.01;
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div><p className="text-sm font-semibold">General ledger entries</p><p className="text-xs text-muted-foreground">What this payment posted</p></div>
        <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", balanced ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/15 text-rose-700")}>
          <Scale className="h-3.5 w-3.5" /> {balanced ? "Balanced" : "Out of balance"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-2 text-left">Account</th><th className="px-3 py-2 text-left">Against</th><th className="px-3 py-2 text-left">Cost Center</th><th className="px-3 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr>
          </thead>
          <tbody>
            {gl.map((g, i) => (
              <tr key={i} className="border-t border-border/60 hover:bg-muted/30">
                <td className="px-4 py-2"><p className="font-medium">{g.account}</p>{g.party && <p className="text-[11px] text-muted-foreground">{g.party}</p>}</td>
                <td className="px-3 py-2 text-xs">{g.against_voucher ? <Link className="text-primary hover:underline" to={docUrl(g.against_voucher_type ?? "", g.against_voucher).href}>{g.against_voucher}</Link> : "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{g.cost_center ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{g.debit ? money(g.debit) : ""}</td>
                <td className="px-4 py-2 text-right tabular-nums">{g.credit ? money(g.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-border font-semibold">
            <tr><td className="px-4 py-2" colSpan={3}>Total</td><td className="px-3 py-2 text-right tabular-nums">{money(data?.gl_debit)}</td><td className="px-4 py-2 text-right tabular-nums">{money(data?.gl_credit)}</td></tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ child tables */
const REFERENCES: ChildTableSpec = {
  tab: "References",
  key: "references",
  label: "Allocation",
  description: "Invoices / orders this payment settles.",
  doctype: "Payment Entry Reference",
  wide: true,
  columns: [
    req(select("reference_doctype", "Type", ["Sales Invoice", "Purchase Invoice", "Sales Order", "Purchase Order", "Journal Entry", "Expense Claim", "Employee Advance"])),
    req({ fieldname: "reference_name", label: "Reference", fieldtype: "Dynamic Link", options: "reference_doctype" }),
    ro(data("bill_no", "Supplier Invoice No")),
    ro(date("due_date", "Due Date")),
    ro(currency("total_amount", "Grand Total")),
    ro(currency("outstanding_amount", "Outstanding")),
    currency("allocated_amount", "Allocated"),
  ],
  newRow: (v) => ({ reference_doctype: v.party_type === "Supplier" ? "Purchase Invoice" : "Sales Invoice", allocated_amount: 0 }),
  totals: (rows) => [
    { label: "Outstanding", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.outstanding_amount), 0)), align: "right" },
    { label: "Allocated", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.allocated_amount), 0)), align: "right" },
  ],
};

export const PAYMENT_ENTRY_CONFIG: DocConfig = {
  doctype: "Payment Entry",
  base: "/accounting/payment-entries",
  singular: "Payment Entry",
  plural: "Payment Entries",
  subtitle: "Money received from customers, paid to suppliers, or moved between accounts",
  icon: CreditCard,
  submittable: true,
  listFields: ["name", "payment_type", "posting_date", "party_type", "party", "party_name", "paid_amount", "mode_of_payment", "reference_no", "status", "docstatus", "modified"],
  columns: [nameCol("Payment", (r) => r.party_name || r.party), dateCol("posting_date", "Date"), textCol("payment_type", "Type"), textCol("mode_of_payment", "Mode"),
    moneyCol("paid_amount", "Amount"), statusCol("status", "Status", "Draft")],
  searchFields: ["name", "party", "party_name", "reference_no"],
  statusField: "payment_type",
  statuses: ["Receive", "Pay", "Internal Transfer"],
  dateField: "posting_date",
  sort: { key: "posting_date", dir: "desc" },
  fields: [
    tab("Payment"),
    sec("Payment"),
    data("title", "Title"), // ERPNext fills it with the party name when left empty
    req(select("payment_type", "Payment Type", ["Receive", "Pay", "Internal Transfer"])),
    req(date("posting_date", "Posting Date")),
    req(link("company", "Company", "Company")),
    colBreak(),
    link("mode_of_payment", "Mode of Payment", "Mode of Payment"),
    req(select("naming_series", "Series", ["ACC-PAY-.YYYY.-"])),
    sec("Party"),
    when(req(select("party_type", "Party Type", ["Customer", "Supplier", "Employee", "Shareholder"])), (v) => v.payment_type !== "Internal Transfer"),
    when(req({ fieldname: "party", label: "Party", fieldtype: "Dynamic Link", options: "party_type" }), (v) => v.payment_type !== "Internal Transfer" && Boolean(v.party_type)),
    when(ro(data("party_name", "Party Name")), (v) => Boolean(v.party)),
    colBreak(),
    when(link("party_bank_account", "Party Bank Account", "Bank Account"), (v) => Boolean(v.party)),
    link("bank_account", "Company Bank Account", "Bank Account"),
    sec("Accounts"),
    req(link("paid_from", "Account Paid From", "Account")),
    ro(link("paid_from_account_currency", "Currency", "Currency")),
    colBreak(),
    req(link("paid_to", "Account Paid To", "Account")),
    ro(link("paid_to_account_currency", "Currency", "Currency")),
    sec("Amount"),
    req(currency("paid_amount", "Paid Amount")),
    float("source_exchange_rate", "Exchange Rate"),
    colBreak(),
    req(currency("received_amount", "Received Amount")),
    float("target_exchange_rate", "Exchange Rate"),

    tab("References"),
    sec("Allocation"),
    ro(currency("total_allocated_amount", "Total Allocated")),
    colBreak(),
    ro(currency("unallocated_amount", "Unallocated")),
    ro(currency("difference_amount", "Difference")),

    tab("Taxes & Deductions"),
    sec("Tax template"),
    when(link("purchase_taxes_and_charges_template", "Purchase Taxes Template", "Purchase Taxes and Charges Template"), (v) => v.party_type === "Supplier"),
    when(link("sales_taxes_and_charges_template", "Sales Taxes Template", "Sales Taxes and Charges Template"), (v) => v.party_type === "Customer"),
    colBreak(),
    ro(currency("total_taxes_and_charges", "Total Taxes")),
    check("apply_tds", "Apply Tax Withholding"),
    when(link("tax_withholding_category", "Withholding Category", "Tax Withholding Category"), (v) => Boolean(v.apply_tds)),

    tab("Transaction"),
    sec("Instrument"),
    data("reference_no", "Cheque / Reference No"),
    date("reference_date", "Cheque / Reference Date"),
    colBreak(),
    ro(date("clearance_date", "Clearance Date")),
    sec("Dimensions"),
    link("cost_center", "Cost Center", "Cost Center"),
    colBreak(),
    link("project", "Project", "Project"),

    tab("Ledger"),

    tab("More"),
    sec("Remarks"),
    text("remarks", "Remarks"),
    sec("Approvals"),
    data("prepared_by", "Prepared By"),
    data("checked_by", "Checked By"),
    colBreak(),
    data("approved_by", "Approved By"),
    select("is_opening", "Is Opening", ["No", "Yes"]),
  ],
  children: [
    REFERENCES,
    { tab: "Taxes & Deductions", key: "taxes", label: "Taxes and Charges", doctype: "Advance Taxes and Charges", wide: true,
      columns: [req(select("charge_type", "Type", ["Actual", "On Paid Amount", "On Previous Row Amount", "On Previous Row Total"])), req(link("account_head", "Account Head", "Account")),
        req(data("description", "Description")), float("rate", "Rate (%)"), req(select("add_deduct_tax", "Add/Deduct", ["Add", "Deduct"])), currency("tax_amount", "Tax Amount"), ro(currency("total", "Total"))],
      newRow: () => ({ charge_type: "Actual", add_deduct_tax: "Add" }) },
    { tab: "Taxes & Deductions", key: "deductions", label: "Deductions or Loss", description: "Bank charges, exchange loss, write-offs.", doctype: "Payment Entry Deduction",
      columns: [req(link("account", "Account", "Account")), link("cost_center", "Cost Center", "Cost Center"), req(currency("amount", "Amount")), data("description", "Description")],
      totals: (rows) => [{ label: "Deductions", value: fmtMoney(rows.reduce((s, r) => s + asNumber(r.amount), 0)), align: "right" }] },
  ],
  linkEffects: {
    // Changing the direction resets the party side, as on the desk form.
    payment_type: (t) => ({ party_type: t === "Internal Transfer" ? undefined : t === "Pay" ? "Supplier" : "Customer", party: undefined, party_name: undefined,
      paid_from: undefined, paid_to: undefined, paid_from_account_currency: undefined, paid_to_account_currency: undefined, references: [] }),
    party_type: (_t, v) => ({ party: undefined, party_name: undefined, [partyAccountField(v.payment_type)]: undefined, references: [] }),
    party: async (party, v) => {
      if (!party || !v.party_type || !v.company) return { party_name: undefined, references: [] };
      const d = await getPartyPaymentDetails({ company: v.company, party_type: v.party_type, party, date: v.posting_date || todayISO() });
      const f = partyAccountField(v.payment_type);
      return { party_name: d.party_name, [f]: d.party_account, [`${f}_account_currency`]: d.party_account_currency, party_bank_account: d.party_bank_account, references: [] };
    },
    // Mode of payment → its default bank / cash account on the company side.
    mode_of_payment: async (mop, v) => {
      if (!mop || !v.company) return;
      const r = await postCall<{ account?: string }>("erpnext.accounts.doctype.sales_invoice.sales_invoice.get_bank_cash_account", { mode_of_payment: mop, company: v.company }).catch(() => ({}) as { account?: string });
      if (!r.account) return;
      const f = bankField(v.payment_type);
      const d = await getAccountPaymentDetails({ account: r.account, date: v.posting_date || todayISO() }).catch(() => ({ account_currency: undefined }));
      return { [f]: r.account, [`${f}_account_currency`]: d.account_currency };
    },
    paid_from: async (acc, v) => (acc ? { paid_from_account_currency: (await getAccountPaymentDetails({ account: acc, date: v.posting_date || todayISO() })).account_currency } : undefined),
    paid_to: async (acc, v) => (acc ? { paid_to_account_currency: (await getAccountPaymentDetails({ account: acc, date: v.posting_date || todayISO() })).account_currency } : undefined),
  },
  // Same-currency payments: received mirrors paid; allocation totals follow the references.
  compute: (v, rows) => {
    const same = !v.paid_from_account_currency || !v.paid_to_account_currency || v.paid_from_account_currency === v.paid_to_account_currency;
    const alloc = (rows.references ?? []).reduce((s, r) => s + asNumber(r.allocated_amount), 0);
    const paid = asNumber(v.paid_amount);
    return { values: { ...(same ? { received_amount: v.paid_amount } : {}), total_allocated_amount: alloc, unallocated_amount: Math.round((paid - alloc) * 100) / 100 } };
  },
  tabIcons: { Payment: Coins, References: Receipt, "Taxes & Deductions": SlidersHorizontal, Transaction: FileText, Ledger: BookOpen, More: SlidersHorizontal },
  tabPanels: {
    Payment: { before: (ctx) => <PaymentGlance {...ctx} /> },
    References: { before: (ctx) => <ReferencesPanel {...ctx} /> },
    Ledger: { before: (ctx) => <LedgerPanel {...ctx} /> },
  },
  defaults: ({ company }) => ({ company, naming_series: "ACC-PAY-.YYYY.-", payment_type: "Receive", party_type: "Customer", posting_date: todayISO(), reference_date: todayISO(), source_exchange_rate: 1, target_exchange_rate: 1 }),
  summary: (v) => [
    { label: v.payment_type === "Pay" ? "Paid" : "Received", value: money(v.paid_amount, v.paid_from_account_currency || "PKR"), tone: v.payment_type === "Pay" ? "rose" : "emerald" },
    { label: "Unallocated", value: money(v.unallocated_amount), tone: asNumber(v.unallocated_amount) > 0 ? "amber" : "sky" },
  ],
  titleOf: (v) => (v.name ? `${v.name}${v.party_name ? ` · ${v.party_name}` : ""}` : "New Payment Entry"),
};
