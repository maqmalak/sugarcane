import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Users, Plus, Upload } from "lucide-react";
import { useFrappeCreateDoc } from "frappe-react-sdk";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { ImportDialog } from "@/components/common/import-dialog";
import { useSuppliers } from "@/hooks/useSuppliers";
import type { Supplier } from "@/types/frappe";

const IMPORT_FIELDS = [
  { fieldname: "supplier_name", label: "Supplier Name", required: true },
  { fieldname: "supplier_type", label: "Supplier Type" },
  { fieldname: "supplier_group", label: "Supplier Group" },
  { fieldname: "country", label: "Country" },
  { fieldname: "disabled", label: "Disabled (0/1)", boolean: true },
];

/** Supplier master — full page create/edit lives at /masters/suppliers/:name. */
export function SuppliersPage() {
  const navigate = useNavigate();
  const { data, error, isLoading, mutate } = useSuppliers({ limit: 0, includeDisabled: true });
  const { createDoc } = useFrappeCreateDoc();
  const [importOpen, setImportOpen] = useState(false);

  const columns: ColumnDef<Supplier>[] = [
    { key: "supplier_name", label: "Supplier", render: (r) => <span className="font-medium">{r.supplier_name || r.name}</span> },
    { key: "supplier_group", label: "Group" },
    { key: "country", label: "Country" },
    { key: "disabled", label: "Status", render: (r) => (r.disabled ? <Badge variant="destructive">Disabled</Badge> : <Badge variant="success">Active</Badge>) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Suppliers"
        subtitle="Vendors from the ERPNext Supplier master"
        icon={<Users className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" onClick={() => navigate("/masters/suppliers/new")}>
              <Plus className="h-3.5 w-3.5" /> New Supplier
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
        onRowClick={(r) => navigate(`/masters/suppliers/${encodeURIComponent(r.name)}`)}
        striped
        title="Suppliers"
        exportFilename="suppliers"
        emptyTitle="No suppliers found"
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Suppliers"
        fields={IMPORT_FIELDS}
        sampleRow={{ supplier_name: "Acme Supplies", supplier_type: "Company", supplier_group: "", country: "", disabled: "0" }}
        onImportRow={(row) => createDoc("Supplier", row)}
        onImported={() => void mutate()}
      />
    </div>
  );
}
