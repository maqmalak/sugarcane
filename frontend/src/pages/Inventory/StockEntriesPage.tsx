import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeftRight, Plus, Eye, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/status-badge";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { FilterBar } from "@/components/filters/filter-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useStockEntries, useStockEntryMutations } from "@/hooks/useStockEntries";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import { humanizeError } from "@/services/frappe";
import type { StockEntry } from "@/types/frappe";

const SE_PURPOSES = ["Material Receipt", "Material Issue", "Material Transfer"];
const DOCSTATUS_LABEL: Record<number, string> = { 0: "Draft", 1: "Submitted", 2: "Cancelled" };

export function StockEntriesPage() {
  const navigate = useNavigate();
  const { company } = useCompanyContext();

  const [purpose, setPurpose] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pendingDelete, setPendingDelete] = useState<StockEntry | null>(null);

  const filters = useMemo(() => {
    const f: unknown[][] = [...companyFilter(company), ["docstatus", "<", 2]];
    if (purpose) f.push(["purpose", "=", purpose]);
    if (fromDate) f.push(["posting_date", ">=", fromDate]);
    if (toDate) f.push(["posting_date", "<=", toDate]);
    return f;
  }, [company, purpose, fromDate, toDate]);

  const { data, error, isLoading, mutate } = useStockEntries({ filters, limit: 500 });
  const { deleteDoc, loading: deleting } = useStockEntryMutations();

  const columns: ColumnDef<StockEntry>[] = [
    { key: "name", label: "Stock Entry", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "purpose", label: "Purpose" },
    { key: "posting_date", label: "Date", render: (r) => formatDate(r.posting_date) },
    { key: "from_warehouse", label: "From", render: (r) => r.from_warehouse || "—" },
    { key: "to_warehouse", label: "To", render: (r) => r.to_warehouse || "—" },
    { key: "docstatus", label: "Status", render: (r) => <StatusBadge status={DOCSTATUS_LABEL[r.docstatus ?? 0]} /> },
    {
      key: "total_amount",
      label: "Total Value",
      align: "right",
      getValue: (r) => Number(r.total_amount ?? 0),
      render: (r) => formatMoney(r.total_amount),
    },
  ];

  const confirmDelete = async () => {
    if (!pendingDelete?.name) return;
    try {
      await deleteDoc(pendingDelete.name);
      toast.success(`Deleted ${pendingDelete.name}`);
      setPendingDelete(null);
      notifyDataChanged();
      void mutate();
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Stock Entries"
        subtitle="Material receipts, issues and transfers between warehouses"
        icon={<ArrowLeftRight className="h-5 w-5" />}
        actions={
          <Button variant="primary" onClick={() => navigate("/inventory/stock-entries/new")}>
            <Plus className="h-4 w-4" /> New Stock Entry
          </Button>
        }
      />

      <FrappeDataTable<StockEntry>
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.name ?? ""}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={(r) => navigate(`/inventory/stock-entries/${encodeURIComponent(r.name ?? "")}`)}
        exportFilename="stock-entries"
        emptyTitle="No Stock Entries"
        emptyDescription="Create a stock entry to receive, issue or transfer material."
        searchPlaceholder="Search stock entry…"
        rowActions={(r) => [
          {
            label: "Open",
            icon: <Eye className="h-4 w-4" />,
            onClick: () => navigate(`/inventory/stock-entries/${encodeURIComponent(r.name ?? "")}`),
          },
          { separator: true, label: "" },
          {
            label: "Delete",
            icon: <Trash2 className="h-4 w-4" />,
            destructive: true,
            onClick: () => setPendingDelete(r),
          },
        ]}
        filters={
          <FilterBar>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Purpose</label>
              <Select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="h-8 w-44 text-xs">
                <option value="">All purposes</option>
                {SE_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">From Date</label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 w-36 text-xs" aria-label="Posting date from" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">To Date</label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 w-36 text-xs" aria-label="Posting date to" />
            </div>
          </FilterBar>
        }
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name}?`}
        description="This permanently removes the Stock Entry from ERPNext (draft documents only)."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
