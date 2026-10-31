import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { DocPageTabs } from "@/components/doc/doc-page-tabs";
import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Coins, Pencil, Trash2, Package, FileText } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { GLLedgerPanel } from "@/components/common/gl-ledger-panel";
import { DonutChart } from "@/components/charts/charts";
import {
  useLandedCostVoucher,
  useLandedCostVoucherMutations,
} from "@/hooks/useLandedCostVouchers";
import { useCompany } from "@/hooks/useCompanies";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import type { LandedCostVoucher } from "@/types/frappe";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value == null || value === "" ? "—" : value}</span>
    </div>
  );
}

function receiptDetailLink(docType: string, docName: string): string {
  return docType === "Purchase Receipt"
    ? `/purchase/receipts/${encodeURIComponent(docName)}`
    : `/purchase/invoices/${encodeURIComponent(docName)}`;
}

/**
 * Landed Cost Voucher view page.
 *
 * Read-only presentation with an explicit Edit action
 * (→ `/purchase/landed-costs/:name/edit`) and links back to the source
 * Purchase Receipt(s)/Invoice(s) this voucher applies to.
 */
export function LandedCostVoucherDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canWrite = hasRole();

  const { data: doc, error, isLoading, mutate } = useLandedCostVoucher(name);
  const { deleteDoc, loading: deleteLoading } = useLandedCostVoucherMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Landed Cost Voucher amounts are in the company's default currency (there's
  // no transaction-currency field on this doctype), so look it up for display.
  const { data: companyDoc } = useCompany(doc?.company);
  const currency = companyDoc?.default_currency;

  const handleDelete = async () => {
    if (!name) return;
    try {
      await deleteDoc(name);
      toast.success("Landed Cost Voucher deleted");
      notifyDataChanged();
      navigate("/purchase/landed-costs");
    } catch (err) {
      toast.error(humanizeError(err));
      setConfirmDelete(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="space-y-4">
        <PageHeader title="Landed Cost Voucher" />
        <SectionCard>
          <p className="text-sm text-destructive">Failed to load landed cost voucher {name}.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void mutate()}>
            Retry
          </Button>
        </SectionCard>
      </div>
    );
  }

  const lcv = doc as LandedCostVoucher;
  const vouchers = lcv.purchase_receipts ?? [];
  const items = lcv.items ?? [];
  const taxes = lcv.taxes ?? [];
  const editable = canWrite && (lcv.docstatus ?? 0) === 0;

  const statusLabel = lcv.docstatus === 1 ? "Submitted" : lcv.docstatus === 2 ? "Cancelled" : "Draft";

  return (
    <div className="space-y-6">
      <PageHeader
        title={lcv.name || name!}
        subtitle="Landed Cost Voucher"
        icon={<Coins className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/purchase/landed-costs" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Landed Cost Vouchers
          </Link>
        }
        actions={
          <>
            <DocActionsMenu doctype="Landed Cost Voucher" doc={doc as any} onChanged={() => void mutate()} />
            <StatusBadge status={statusLabel} />
            {editable && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/purchase/landed-costs/${encodeURIComponent(name!)}/edit`)}
                >
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={deleteLoading}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </>
        }
      />
      <DocPageTabs doctype="Landed Cost Voucher" name={doc?.name ?? name} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge status={statusLabel} />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Distribute Based On</p>
          <p className="font-medium">{lcv.distribute_charges_based_on || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Landed Cost</p>
          <p className="font-bold">{formatMoney(lcv.total_taxes_and_charges, currency)}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Voucher Details">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <Row label="Company" value={lcv.company} />
              <Row label="Posting Date" value={formatDate(lcv.posting_date)} />
              <Row label="Distribute Based On" value={lcv.distribute_charges_based_on} />
              <Row label="Total Landed Cost" value={lcv.total_taxes_and_charges != null ? formatMoney(lcv.total_taxes_and_charges, currency) : undefined} />
            </div>
          </SectionCard>

          <SectionCard title="Items" description={`${items.length} item(s)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="py-2 pr-3 font-medium">From</th>
                    <th className="py-2 pr-3 text-right font-medium">Qty</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2 text-right font-medium">Applicable Charges</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3 font-medium">{it.item_code}</td>
                      <td className="py-2 pr-3">
                        {it.receipt_document ? (
                          <Link
                            to={receiptDetailLink(it.receipt_document_type ?? "Purchase Receipt", it.receipt_document)}
                            className="text-xs text-primary hover:underline"
                          >
                            {it.receipt_document}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">{it.qty}</td>
                      <td className="py-2 pr-3 text-right">{formatMoney(it.amount, currency)}</td>
                      <td className="py-2 text-right font-medium">{formatMoney(it.applicable_charges, currency)}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted-foreground">
                        No items — this voucher has no receipt items fetched.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Landed Cost (Charges)" description={`${taxes.length} charge(s)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Description</th>
                    <th className="py-2 pr-3 font-medium">Expense Account</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {taxes.map((t, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3">{t.description}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{t.expense_account}</td>
                      <td className="py-2 text-right font-medium">{formatMoney(t.amount, currency)}</td>
                    </tr>
                  ))}
                  {taxes.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-muted-foreground">
                        No charges added.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* A Landed Cost Voucher posts no GL entries of its own — submitting one
              reposts the linked receipt document's ledger with the charges folded
              into its item valuation. Show that document's ledger here so the
              accounting effect of this voucher is actually visible. */}
          {vouchers.map((v, i) => (
            <GLLedgerPanel
              key={i}
              voucherType={v.receipt_document_type}
              voucherNo={v.receipt_document}
              title={vouchers.length > 1 ? `Ledger — ${v.receipt_document}` : "Ledger"}
              description={
                lcv.docstatus === 1
                  ? `Accounting entries on ${v.receipt_document_type} ${v.receipt_document}, updated by this voucher`
                  : `A Landed Cost Voucher posts no ledger entries of its own — submitting this one will update ${v.receipt_document_type} ${v.receipt_document}'s entries below`
              }
            />
          ))}
        </div>

        {/* Connections panel */}
        <div className="space-y-4">
          <SectionCard title="Cost Breakdown" description="Share of each charge in the total landed cost">
            {taxes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No charges added.</p>
            ) : (
              <DonutChart
                data={taxes.map((t) => ({ label: t.description, value: t.amount }))}
                height={300}
                money
                currency={currency}
                legend={false}
              />
            )}
          </SectionCard>

          <SectionCard title="Connections" description="Source documents this voucher applies to">
            <ul className="space-y-1">
              {vouchers.map((v, i) => (
                <li key={i}>
                  <Link
                    to={receiptDetailLink(v.receipt_document_type, v.receipt_document)}
                    className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    {v.receipt_document_type === "Purchase Receipt" ? (
                      <Package className="h-3.5 w-3.5 opacity-60" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 opacity-60" />
                    )}
                    {v.receipt_document}
                    <span className="text-xs text-muted-foreground">({v.receipt_document_type})</span>
                  </Link>
                </li>
              ))}
              {vouchers.length === 0 && <p className="text-sm text-muted-foreground">No linked documents.</p>}
            </ul>
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${name}?`}
        description="This permanently removes the draft Landed Cost Voucher."
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
