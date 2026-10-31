import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Users, Plus, Upload } from "lucide-react";
import { useFrappeCreateDoc } from "frappe-react-sdk";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { ImportDialog } from "@/components/common/import-dialog";
import { useCustomers } from "@/hooks/useCustomers";
import type { Customer } from "@/types/frappe";

const IMPORT_FIELDS = [
  { fieldname: "customer_name", label: "Customer Name", required: true },
  { fieldname: "customer_type", label: "Customer Type" },
  { fieldname: "customer_group", label: "Customer Group" },
  { fieldname: "territory", label: "Territory" },
  { fieldname: "disabled", label: "Disabled (0/1)", boolean: true },
];

/** Customer master — full page create/edit lives at /masters/customers/:name. */
export function CustomersPage() {
  const navigate = useNavigate();
  const { data, error, isLoading, mutate } = useCustomers({ limit: 0, includeDisabled: true });
  const { createDoc } = useFrappeCreateDoc();
  const [importOpen, setImportOpen] = useState(false);

  const columns: ColumnDef<Customer>[] = [
    { key: "customer_name", label: "Customer", render: (r) => <span className="font-medium">{r.customer_name || r.name}</span> },
    { key: "customer_group", label: "Group" },
    { key: "territory", label: "Territory" },
    { key: "disabled", label: "Status", render: (r) => (r.disabled ? <Badge variant="destructive">Disabled</Badge> : <Badge variant="success">Active</Badge>) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        subtitle="Buyers / customers from the ERPNext Customer master"
        icon={<Users className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" onClick={() => navigate("/masters/customers/new")}>
              <Plus className="h-3.5 w-3.5" /> New Customer
            </Button>
          </div>
        }
      />

      <FrappeDataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.name}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={(r) => navigate(`/masters/customers/${encodeURIComponent(r.name)}`)}
        striped
        title="Customers"
        exportFilename="customers"
        emptyTitle="No customers found"
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Customers"
        fields={IMPORT_FIELDS}
        sampleRow={{ customer_name: "Acme Corp", customer_type: "Company", customer_group: "", territory: "", disabled: "0" }}
        onImportRow={(row) => createDoc("Customer", row)}
        onImported={() => void mutate()}
      />
    </div>
  );
}
