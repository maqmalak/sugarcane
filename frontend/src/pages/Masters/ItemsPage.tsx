import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Boxes, Plus, Upload } from "lucide-react";
import { useFrappeCreateDoc } from "frappe-react-sdk";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { ImportDialog } from "@/components/common/import-dialog";
import { useItems } from "@/hooks/useItems";
import type { Item } from "@/types/frappe";

const IMPORT_FIELDS = [
  { fieldname: "item_code", label: "Item Code", required: true },
  { fieldname: "item_name", label: "Item Name" },
  { fieldname: "item_group", label: "Item Group", required: true },
  { fieldname: "stock_uom", label: "Stock UOM", required: true },
  { fieldname: "is_stock_item", label: "Is Stock Item (0/1)", boolean: true },
  { fieldname: "disabled", label: "Disabled (0/1)", boolean: true },
];

/** Item master — full page create/edit lives at /masters/items/:name (DocFormPage with ITEM_CONFIG, masters-configs.tsx). */
export function ItemsPage() {
  const navigate = useNavigate();
  const { data, error, isLoading, mutate } = useItems({ limit: 0 });
  const { createDoc } = useFrappeCreateDoc();
  const [importOpen, setImportOpen] = useState(false);

  const columns: ColumnDef<Item>[] = [
    { key: "item_name", label: "Item", render: (r) => (
      <div>
        <p className="font-medium">{r.item_name || r.name}</p>
        <p className="text-xs text-muted-foreground">{r.name}</p>
      </div>
    ) },
    { key: "item_group", label: "Item Group" },
    { key: "stock_uom", label: "UOM" },
    { key: "standard_rate", label: "Rate", align: "right" },
    { key: "disabled", label: "Status", render: (r) => (r.disabled ? <Badge variant="destructive">Disabled</Badge> : <Badge variant="success">Active</Badge>) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Items"
        subtitle="Product / service master — ERPNext Item records"
        icon={<Boxes className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" onClick={() => navigate("/masters/items/new")}>
              <Plus className="h-3.5 w-3.5" /> New Item
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
        onRowClick={(r) => navigate(`/masters/items/${encodeURIComponent(r.name)}`)}
        striped
        title="Items"
        exportFilename="items"
        emptyTitle="No items found"
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Items"
        fields={IMPORT_FIELDS}
        sampleRow={{ item_code: "ITM-0001", item_name: "Sample Item", item_group: "Products", stock_uom: "Nos", is_stock_item: "1", disabled: "0" }}
        onImportRow={(row) => createDoc("Item", row)}
        onImported={() => void mutate()}
      />
    </div>
  );
}
