import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUrlFlag, isoDaysAgo } from "@/hooks/useUrlFlag";
import toast from "react-hot-toast";
import { ClipboardList, Plus, Eye, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common/status-badge";
import { PercentBar } from "@/components/common/percent-bar";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { FilterBar } from "@/components/filters/filter-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMaterialRequests, useMaterialRequestMutations } from "@/hooks/useMaterialRequests";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { formatDate } from "@/utils/dates";
import { humanizeError } from "@/services/frappe";
import type { MaterialRequest } from "@/types/frappe";

const MR_TYPES = ["Purchase", "Material Transfer", "Material Issue"];
const MR_STATUSES = ["Draft", "Pending", "Partially Ordered", "Ordered", "Partially Received", "Received", "Stopped", "Cancelled"];

export function MaterialRequestsPage() {
  const navigate = useNavigate();
  const { company } = useCompanyContext();

  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pendingDelete, setPendingDelete] = useState<MaterialRequest | null>(null);

  // ?waiting=1 from the home page's "Needs attention" card — same rule as the card.
  const waiting = useUrlFlag("waiting", "Waiting over 7 days");
  const filters = useMemo(() => {
    const f: unknown[][] = [...companyFilter(company), ["docstatus", "<", 2]];
    if (waiting.active) f.push(["docstatus", "=", 1], ["status", "in", ["Pending", "Partially Ordered"]], ["transaction_date", "<", isoDaysAgo(7)]);
    if (type) f.push(["material_request_type", "=", type]);
    if (status) f.push(["status", "=", status]);
    if (fromDate) f.push(["transaction_date", ">=", fromDate]);
    if (toDate) f.push(["transaction_date", "<=", toDate]);
    return f;
  }, [company, type, status, fromDate, toDate, waiting.active]);

  const { data, error, isLoading, mutate } = useMaterialRequests({ filters, limit: 500 });
  const { deleteDoc, loading: deleting } = useMaterialRequestMutations();

  const columns: ColumnDef<MaterialRequest>[] = [
    { key: "name", label: "Request", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "title", label: "Title", render: (r) => r.title || "—" },
    { key: "material_request_type", label: "Type", render: (r) => r.material_request_type },
    { key: "transaction_date", label: "Date", render: (r) => formatDate(r.transaction_date) },
    { key: "schedule_date", label: "Required By", render: (r) => formatDate(r.schedule_date) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status || "Draft"} /> },
    {
      key: "per_ordered",
      label: "Ordered %",
      getValue: (r) => Number(r.per_ordered ?? 0),
      render: (r) => <PercentBar value={r.per_ordered} />,
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
        title="Material Requests"
        subtitle="Requests to purchase, transfer or issue stock"
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <Button variant="primary" onClick={() => navigate("/import/material-requests/new")}>
            <Plus className="h-4 w-4" /> New Material Request
          </Button>
        }
      />

      <FrappeDataTable<MaterialRequest>
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.name ?? ""}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={(r) => navigate(`/import/material-requests/${encodeURIComponent(r.name ?? "")}`)}
        exportFilename="material-requests"
        emptyTitle="No Material Requests"
        emptyDescription="Create a material request to kick off purchasing or a stock movement."
        searchPlaceholder="Search request, title…"
        rowActions={(r) => [
          {
            label: "Open",
            icon: <Eye className="h-4 w-4" />,
            onClick: () => navigate(`/import/material-requests/${encodeURIComponent(r.name ?? "")}`),
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
            {waiting.chip}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={type} onChange={(e) => setType(e.target.value)} className="h-8 w-40 text-xs">
                <option value="">All types</option>
                {MR_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-44 text-xs">
                <option value="">All statuses</option>
                {MR_STATUSES.map((s) => (
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
        description="This permanently removes the Material Request from ERPNext (draft documents only)."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
