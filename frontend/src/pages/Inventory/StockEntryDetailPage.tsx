import { DocActionsMenu } from "@/components/doc/doc-actions-menu";
import { DocPageTabs } from "@/components/doc/doc-page-tabs";
import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, ArrowLeftRight, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useStockEntry, useStockEntryMutations } from "@/hooks/useStockEntries";
import { useAuth } from "@/hooks/useAuth";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import type { StockEntry, StockEntryItem } from "@/types/frappe";

function lineAmount(row: Pick<StockEntryItem, "qty" | "basic_rate">): number {
  return Number(row.qty || 0) * Number(row.basic_rate || 0);
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value == null || value === "" ? "—" : value}</span>
    </div>
  );
}

/**
 * Stock Entry view page — no forward chain, but a Material Issue / Transfer
 * created via "Create Stock Entry" on a Material Request carries that link
 * back on each row (Stock Entry Detail.material_request), shown here as a
 * back-reference.
 */
export function StockEntryDetailPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canWrite = hasRole();

  const { data: doc, error, isLoading, mutate } = useStockEntry(name);
  const { deleteDoc, loading: deleteLoading } = useStockEntryMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!name) return;
    try {
      await deleteDoc(name);
      toast.success("Stock Entry deleted");
      notifyDataChanged();
      navigate("/inventory/stock-entries");
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
        <PageHeader title="Stock Entry" />
        <SectionCard>
          <p className="text-sm text-destructive">Failed to load stock entry {name}.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void mutate()}>
            Retry
          </Button>
        </SectionCard>
      </div>
    );
  }

  const se = doc as StockEntry;
  const items = se.items ?? [];
  const totalQty = items.reduce((s, it) => s + Number(it.qty || 0), 0);
  const totalAmount = items.reduce((s, it) => s + Number(it.basic_amount ?? lineAmount(it)), 0);
  const editable = canWrite && (se.docstatus ?? 0) === 0;
  const linkedRequest = items.find((it) => it.material_request)?.material_request;

  const statusLabel = se.docstatus === 1 ? "Submitted" : se.docstatus === 2 ? "Cancelled" : "Draft";

  return (
    <div className="space-y-6">
      <PageHeader
        title={se.name || name!}
        subtitle="Stock Entry"
        icon={<ArrowLeftRight className="h-5 w-5" />}
        breadcrumbs={
          <Link to="/inventory/stock-entries" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Stock Entries
          </Link>
        }
        actions={
          <>
            <DocActionsMenu doctype="Stock Entry" doc={doc as any} onChanged={() => void mutate()} />
            <StatusBadge status={statusLabel} />
            {editable && (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate(`/inventory/stock-entries/${encodeURIComponent(name!)}/edit`)}>
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
      <DocPageTabs doctype="Stock Entry" name={doc?.name ?? name} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge status={statusLabel} />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Purpose</p>
          <p className="font-medium">{se.purpose || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Warehouses</p>
          <p className="truncate font-medium">{se.from_warehouse || "—"} {se.from_warehouse && se.to_warehouse ? "→" : ""} {se.to_warehouse || ""}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Value</p>
          <p className="font-bold">{formatMoney(se.total_amount ?? totalAmount)}</p>
        </Card>
      </div>

      <SectionCard title="Entry Details">
        <div className="grid gap-x-8 sm:grid-cols-2">
          <Row label="Company" value={se.company} />
          <Row label="Posting Date" value={formatDate(se.posting_date)} />
          <Row label="Purpose" value={se.purpose} />
          <Row label="Source Warehouse" value={se.from_warehouse} />
          <Row label="Target Warehouse" value={se.to_warehouse} />
          <Row label="Total Qty" value={totalQty} />
          <Row label="Remarks" value={se.remarks} />
          {linkedRequest && (
            <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-0">
              <span className="text-xs text-muted-foreground">Material Request</span>
              <Link
                to={`/import/material-requests/${encodeURIComponent(linkedRequest)}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {linkedRequest}
              </Link>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Items" description={`${items.length} item(s)`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Item</th>
                <th className="py-2 pr-3 font-medium">From</th>
                <th className="py-2 pr-3 font-medium">To</th>
                <th className="py-2 pr-3 text-right font-medium">Qty</th>
                <th className="py-2 pr-3 text-right font-medium">Rate</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3">
                    <span className="block font-medium">{it.item_name || it.item_code}</span>
                    {it.item_code && <span className="text-xs text-muted-foreground">{it.item_code}</span>}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{it.s_warehouse || "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{it.t_warehouse || "—"}</td>
                  <td className="py-2 pr-3 text-right">{it.qty} {it.uom}</td>
                  <td className="py-2 pr-3 text-right">{formatMoney(it.basic_rate)}</td>
                  <td className="py-2 text-right font-medium">{formatMoney(it.basic_amount ?? lineAmount(it))}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No items on this stock entry.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${name}?`}
        description="This permanently removes the draft Stock Entry."
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
