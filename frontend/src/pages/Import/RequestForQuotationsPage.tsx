import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Quote, Plus, Eye, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/status-badge";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { FilterBar } from "@/components/filters/filter-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useRequestForQuotations, useRequestForQuotationMutations } from "@/hooks/useRequestForQuotations";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { formatDate } from "@/utils/dates";
import { humanizeError } from "@/services/frappe";
import type { RequestForQuotation } from "@/types/frappe";

const RFQ_STATUSES = ["Draft", "Submitted", "Cancelled"];

export function RequestForQuotationsPage() {
  const navigate = useNavigate();
  const { company } = useCompanyContext();

  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pendingDelete, setPendingDelete] = useState<RequestForQuotation | null>(null);

  const filters = useMemo(() => {
    const f: unknown[][] = [...companyFilter(company), ["docstatus", "<", 2]];
    if (status) f.push(["status", "=", status]);
    if (fromDate) f.push(["transaction_date", ">=", fromDate]);
    if (toDate) f.push(["transaction_date", "<=", toDate]);
    return f;
  }, [company, status, fromDate, toDate]);

  const { data, error, isLoading, mutate } = useRequestForQuotations({ filters, limit: 500 });
  const { deleteDoc, loading: deleting } = useRequestForQuotationMutations();

  const columns: ColumnDef<RequestForQuotation>[] = [
    { key: "name", label: "RFQ", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "subject", label: "Subject", render: (r) => r.subject || "—" },
    { key: "transaction_date", label: "Date", render: (r) => formatDate(r.transaction_date) },
    { key: "schedule_date", label: "Required By", render: (r) => formatDate(r.schedule_date) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status || "Draft"} /> },
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
        title="Requests for Quotation"
        subtitle="Ask multiple suppliers to quote before ordering"
        icon={<Quote className="h-5 w-5" />}
        actions={
          <Button variant="primary" onClick={() => navigate("/import/rfqs/new")}>
            <Plus className="h-4 w-4" /> New RFQ
          </Button>
        }
      />

      <FrappeDataTable<RequestForQuotation>
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.name ?? ""}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={(r) => navigate(`/import/rfqs/${encodeURIComponent(r.name ?? "")}`)}
        exportFilename="requests-for-quotation"
        emptyTitle="No Requests for Quotation"
        emptyDescription="Create an RFQ to ask suppliers for pricing before placing a Purchase Order."
        searchPlaceholder="Search RFQ, subject…"
        rowActions={(r) => [
          {
            label: "Open",
            icon: <Eye className="h-4 w-4" />,
            onClick: () => navigate(`/import/rfqs/${encodeURIComponent(r.name ?? "")}`),
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
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-40 text-xs">
                <option value="">All statuses</option>
                {RFQ_STATUSES.map((s) => (
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
        description="This permanently removes the Request for Quotation from ERPNext (draft documents only)."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
