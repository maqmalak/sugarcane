import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUrlFlag, isoDaysAgo } from "@/hooks/useUrlFlag";
import toast from "react-hot-toast";
import { Handshake, Plus, Eye, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/status-badge";
import { PercentBar } from "@/components/common/percent-bar";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { FilterBar } from "@/components/filters/filter-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSalesOrders, useSalesOrderMutations } from "@/hooks/useSalesOrders";
import { useCustomerOptions } from "@/hooks/useCustomers";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import { humanizeError } from "@/services/frappe";
import type { SalesOrder } from "@/types/frappe";

const SO_STATUSES = [
  "Draft",
  "To Deliver and Bill",
  "To Bill",
  "To Deliver",
  "Completed",
  "Cancelled",
  "Closed",
  "On Hold",
];

export function SalesOrdersPage() {
  const navigate = useNavigate();
  const { company } = useCompanyContext();
  const { options: customers } = useCustomerOptions();

  const [customer, setCustomer] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SalesOrder | null>(null);

  // ?late=1 from the home page's "Needs attention" card — same rule as the card.
  const late = useUrlFlag("late", "Past delivery date");
  const filters = useMemo(() => {
    const f: unknown[][] = [...companyFilter(company), ["docstatus", "<", 2]];
    if (late.active) f.push(["docstatus", "=", 1], ["status", "in", ["To Deliver and Bill", "To Deliver"]], ["delivery_date", "<", isoDaysAgo(0)]);
    if (customer) f.push(["customer", "=", customer]);
    if (status) f.push(["status", "=", status]);
    if (fromDate) f.push(["transaction_date", ">=", fromDate]);
    if (toDate) f.push(["transaction_date", "<=", toDate]);
    return f;
  }, [company, customer, status, fromDate, toDate, late.active]);

  const { data, error, isLoading, mutate } = useSalesOrders({ filters, limit: 500 });
  const { deleteDoc, loading: deleting } = useSalesOrderMutations();

  const columns: ColumnDef<SalesOrder>[] = [
    { key: "name", label: "Order", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "customer", label: "Customer", render: (r) => r.customer_name || r.customer },
    { key: "transaction_date", label: "Date", render: (r) => formatDate(r.transaction_date) },
    { key: "delivery_date", label: "Delivery Date", render: (r) => formatDate(r.delivery_date) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status || "Draft"} /> },
    {
      key: "per_delivered",
      label: "Delivered %",
      getValue: (r) => Number(r.per_delivered ?? 0),
      render: (r) => <PercentBar value={r.per_delivered} />,
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
        title="Sales Orders"
        subtitle="Buyer orders — the same document the Export Orders view reads"
        icon={<Handshake className="h-5 w-5" />}
        actions={
          <Button variant="primary" onClick={() => navigate("/selling/sales-orders/new")}>
            <Plus className="h-4 w-4" /> New Sales Order
          </Button>
        }
      />

      <FrappeDataTable<SalesOrder>
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.name ?? ""}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={(r) => navigate(`/selling/sales-orders/${encodeURIComponent(r.name ?? "")}`)}
        exportFilename="sales-orders"
        emptyTitle="No Sales Orders"
        emptyDescription="Create a sales order to start the selling flow."
        searchPlaceholder="Search order, customer…"
        rowActions={(r) => [
          {
            label: "Open",
            icon: <Eye className="h-4 w-4" />,
            onClick: () => navigate(`/selling/sales-orders/${encodeURIComponent(r.name ?? "")}`),
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
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Customer</label>
              <Select value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-8 w-44 text-xs">
                <option value="">All customers</option>
                {customers.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-40 text-xs">
                <option value="">All statuses</option>
                {SO_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">From Date</label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 w-36 text-xs" aria-label="Transaction date from" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">To Date</label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 w-36 text-xs" aria-label="Transaction date to" />
            </div>
          </FilterBar>
        }
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name}?`}
        description="This permanently removes the Sales Order from ERPNext (draft documents only)."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
