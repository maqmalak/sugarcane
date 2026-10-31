import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Coins, Plus, Eye, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/status-badge";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { FilterBar } from "@/components/filters/filter-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useLandedCostVouchers, useLandedCostVoucherMutations } from "@/hooks/useLandedCostVouchers";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import { humanizeError } from "@/services/frappe";
import type { LandedCostVoucher } from "@/types/frappe";

export function LandedCostVouchersPage() {
  const navigate = useNavigate();
  const { company } = useCompanyContext();

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [docstatus, setDocstatus] = useState("");
  const [pendingDelete, setPendingDelete] = useState<LandedCostVoucher | null>(null);

  const filters = useMemo(() => {
    const f: unknown[][] = [...companyFilter(company)];
    if (docstatus !== "") f.push(["docstatus", "=", Number(docstatus)]);
    if (fromDate) f.push(["posting_date", ">=", fromDate]);
    if (toDate) f.push(["posting_date", "<=", toDate]);
    return f;
  }, [company, docstatus, fromDate, toDate]);

  const { data, error, isLoading, mutate } = useLandedCostVouchers({ filters, limit: 500 });
  const { deleteDoc, loading: deleting } = useLandedCostVoucherMutations();

  const columns: ColumnDef<LandedCostVoucher>[] = [
    {
      key: "name",
      label: "Voucher",
      render: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "company",
      label: "Company",
      render: (r) => r.company,
    },
    {
      key: "posting_date",
      label: "Date",
      render: (r) => formatDate(r.posting_date),
    },
    {
      key: "distribute_charges_based_on",
      label: "Distribute By",
      render: (r) => r.distribute_charges_based_on,
    },
    {
      key: "docstatus",
      label: "Status",
      render: (r) => (
        <StatusBadge status={r.docstatus === 1 ? "Submitted" : r.docstatus === 2 ? "Cancelled" : "Draft"} />
      ),
    },
    {
      key: "total_taxes_and_charges",
      label: "Total Landed Cost",
      align: "right",
      getValue: (r) => Number(r.total_taxes_and_charges ?? 0),
      render: (r) => formatMoney(r.total_taxes_and_charges),
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
        title="Landed Cost Vouchers"
        subtitle="Distribute freight, duty and other charges across received goods"
        icon={<Coins className="h-5 w-5" />}
        actions={
          <Button variant="primary" onClick={() => navigate("/purchase/landed-costs/new")}>
            <Plus className="h-4 w-4" /> New Landed Cost Voucher
          </Button>
        }
      />

      <FrappeDataTable<LandedCostVoucher>
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.name ?? ""}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={(r) => navigate(`/purchase/landed-costs/${encodeURIComponent(r.name ?? "")}`)}
        exportFilename="landed-cost-vouchers"
        emptyTitle="No Landed Cost Vouchers"
        emptyDescription="Create one from a submitted Purchase Receipt, or from a stock-updating Purchase Invoice."
        searchPlaceholder="Search voucher…"
        rowActions={(r) => [
          {
            label: "Open",
            icon: <Eye className="h-4 w-4" />,
            onClick: () => navigate(`/purchase/landed-costs/${encodeURIComponent(r.name ?? "")}`),
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
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select
                value={docstatus}
                onChange={(e) => setDocstatus(e.target.value)}
                className="h-8 w-36 text-xs"
              >
                <option value="">All statuses</option>
                <option value="0">Draft</option>
                <option value="1">Submitted</option>
                <option value="2">Cancelled</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">From Date</label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 w-36 text-xs"
                aria-label="Posting date from"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">To Date</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 w-36 text-xs"
                aria-label="Posting date to"
              />
            </div>
          </FilterBar>
        }
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.name}?`}
        description="This permanently removes the Landed Cost Voucher from ERPNext (draft documents only)."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
