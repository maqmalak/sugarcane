import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUrlFlag, isoDaysAgo } from "@/hooks/useUrlFlag";
import toast from "react-hot-toast";
import { ShoppingCart, Plus, Eye, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/status-badge";
import { PercentBar } from "@/components/common/percent-bar";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { FilterBar } from "@/components/filters/filter-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePurchaseOrders, usePurchaseOrderMutations } from "@/hooks/usePurchaseOrders";
import { useSupplierOptions } from "@/hooks/useSuppliers";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import { humanizeError } from "@/services/frappe";
import type { PurchaseOrder } from "@/types/frappe";

const PO_STATUSES = [
  "Draft",
  "To Receive and Bill",
  "To Bill",
  "To Receive",
  "Completed",
  "Cancelled",
  "Closed",
  "On Hold",
];

export function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const { company } = useCompanyContext();
  const { options: suppliers } = useSupplierOptions();

  const [supplier, setSupplier] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PurchaseOrder | null>(null);

  // ?late=1 from the home page's "Needs attention" card — same rule as the card.
  const late = useUrlFlag("late", "Past due date");
  // ?running=1 (home page "Purchase orders running"): open orders still to receive or bill.
  const running = useUrlFlag("running", "Running (to receive / bill)");
  const filters = useMemo(() => {
    const f: unknown[][] = [...companyFilter(company), ["docstatus", "<", 2]];
    if (running.active) f.push(["docstatus", "=", 1], ["status", "in", ["To Receive and Bill", "To Receive", "To Bill"]]);
    if (late.active) f.push(["docstatus", "=", 1], ["status", "in", ["To Receive and Bill", "To Receive"]], ["schedule_date", "<", isoDaysAgo(0)]);
    if (supplier) f.push(["supplier", "=", supplier]);
    if (status) f.push(["status", "=", status]);
    if (fromDate) f.push(["transaction_date", ">=", fromDate]);
    if (toDate) f.push(["transaction_date", "<=", toDate]);
    return f;
  }, [company, supplier, status, fromDate, toDate, late.active, running.active]);

  const { data, error, isLoading, mutate } = usePurchaseOrders({ filters, limit: 500 });
  const { deleteDoc, loading: deleting } = usePurchaseOrderMutations();

  const columns: ColumnDef<PurchaseOrder>[] = [
    {
      key: "name",
      label: "Order",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "supplier",
      label: "Supplier",
      render: (r) => r.supplier_name || r.supplier,
    },
    {
      key: "transaction_date",
      label: "Date",
      render: (r) => formatDate(r.transaction_date),
    },
    {
      key: "schedule_date",
      label: "Required By",
      render: (r) => formatDate(r.schedule_date),
    },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusBadge status={r.status || "Draft"} />,
    },
    {
      key: "per_received",
      label: "Received %",
      getValue: (r) => Number(r.per_received ?? 0),
      render: (r) => <PercentBar value={r.per_received} />,
    },
    {
      key: "per_billed",
      label: "Billed %",
      getValue: (r) => Number(r.per_billed ?? 0),
      render: (r) => <PercentBar value={r.per_billed} />,
    },
    {
      key: "grand_total",
      label: "Total",
      align: "right",
      getValue: (r) => Number(r.grand_total ?? 0),
      render: (r) => formatMoney(r.grand_total, r.currency),
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
        title="Purchase Orders"
        subtitle="Supplier orders for import sourcing"
        icon={<ShoppingCart className="h-5 w-5" />}
        actions={
          <Button variant="primary" onClick={() => navigate("/import/purchase-orders/new")}>
            <Plus className="h-4 w-4" /> New Purchase Order
          </Button>
        }
      />

      <FrappeDataTable<PurchaseOrder>
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.name ?? ""}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={(r) => navigate(`/import/purchase-orders/${encodeURIComponent(r.name ?? "")}`)}
        exportFilename="purchase-orders"
        emptyTitle="No Purchase Orders"
        emptyDescription="Create a purchase order to start import sourcing."
        searchPlaceholder="Search order, supplier…"
        rowActions={(r) => [
          {
            label: "Open",
            icon: <Eye className="h-4 w-4" />,
            onClick: () => navigate(`/import/purchase-orders/${encodeURIComponent(r.name ?? "")}`),
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
            {late.chip}
            {running.chip}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Supplier</label>
              <Select
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="h-8 w-44 text-xs"
              >
                <option value="">All suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-8 w-40 text-xs"
              >
                <option value="">All statuses</option>
                {PO_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">From Date</label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 w-36 text-xs"
                aria-label="Transaction date from"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">To Date</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 w-36 text-xs"
                aria-label="Transaction date to"
              />
            </div>
          </FilterBar>
        }
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name}?`}
        description="This permanently removes the Purchase Order from ERPNext (draft documents only)."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
