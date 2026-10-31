import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { useJournalEntries } from "@/hooks/useAccounting";
import { useServerTable, useServerDocCount } from "@/hooks/useServerTable";
import { useCompanyContext, companyFilter } from "@/hooks/useCompanyContext";
import { formatMoney } from "@/utils/currency";
import { formatDate } from "@/utils/dates";
import type { JournalEntry } from "@/types/frappe";

const DOCSTATUS_LABEL: Record<number, string> = { 0: "Draft", 1: "Submitted", 2: "Cancelled" };

export function JournalEntriesPage() {
  const navigate = useNavigate();
  const { company } = useCompanyContext();
  // There are tens of thousands of Journal Entries: page, search and sort on the server rather than
  // fetching a fixed 200 rows and filtering those in the browser (which hid everything older).
  const table = useServerTable({
    searchFields: ["name", "voucher_type", "user_remark", "cheque_no", "title"],
    sort: { key: "posting_date", dir: "desc" },
    pageSize: 50,
  });
  const baseFilters = companyFilter(company);
  const { data, error, isLoading, mutate } = useJournalEntries({
    filters: baseFilters,
    orFilters: table.orFilters,
    limit: table.pageSize,
    limitStart: table.limitStart,
    orderBy: table.orderBy,
  });
  const { data: total } = useServerDocCount("Journal Entry", baseFilters, table.orFilters);

  const columns: ColumnDef<JournalEntry>[] = [
    { key: "name", label: "Journal Entry", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "voucher_type", label: "Entry Type" },
    { key: "posting_date", label: "Posting Date", render: (r) => formatDate(r.posting_date) },
    { key: "total_debit", label: "Total Debit", align: "right", render: (r) => formatMoney(r.total_debit) },
    { key: "total_credit", label: "Total Credit", align: "right", render: (r) => formatMoney(r.total_credit) },
    { key: "docstatus", label: "Status", render: (r) => <StatusBadge status={DOCSTATUS_LABEL[r.docstatus ?? 0]} /> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Journal Entries"
        subtitle="Manual double-entry accounting entries — debits and credits by account"
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate("/accounting/journal-entries/new")}>
            <Plus className="h-4 w-4" /> New Journal Entry
          </Button>
        }
      />
      <FrappeDataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => String(r.name)}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={(r) => navigate(`/accounting/journal-entries/${encodeURIComponent(String(r.name))}`)}
        title="Journal Entries"
        subtitle={`${(total ?? 0).toLocaleString()} entries`}
        serverSide={table.controls(total ?? 0)}
        pageSizeOptions={[20, 50, 100, 200]}
        searchPlaceholder="Search name, type, remark…"
        exportFilename="journal-entries"
        emptyTitle="No journal entries yet"
        emptyDescription='Manual accounting entries you post will show up here — click "New Journal Entry" to create one.'
      />
    </div>
  );
}
