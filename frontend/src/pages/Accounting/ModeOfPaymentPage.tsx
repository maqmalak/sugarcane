import { useState } from "react";
import toast from "react-hot-toast";
import { Plus, Upload } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FrappeForm } from "@/components/forms/frappe-form";
import { type FormFieldMeta } from "@/components/forms/field-primitives";
import { EditableChildTable, type ChildRow } from "@/components/tables/child-table";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { ImportDialog } from "@/components/common/import-dialog";
import { useModesOfPayment, useModeOfPaymentMutations } from "@/hooks/useAccounting";
import { getDocument } from "@/services/api";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { ModeOfPayment } from "@/types/frappe";

const HEADER_FIELDS: FormFieldMeta[] = [
  { fieldname: "mode_of_payment", label: "Mode of Payment", fieldtype: "Data", reqd: true },
  { fieldname: "type", label: "Type", fieldtype: "Select", options: "Cash\nBank\nGeneral\nPhone" },
  { fieldname: "enabled", label: "Enabled", fieldtype: "Check" },
];

const ACCOUNT_ROW_COLUMNS: FormFieldMeta[] = [
  { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
  { fieldname: "default_account", label: "Default Account", fieldtype: "Link", options: "Account" },
];

const IMPORT_FIELDS = [
  { fieldname: "mode_of_payment", label: "Mode of Payment", required: true },
  { fieldname: "type", label: "Type" },
  { fieldname: "enabled", label: "Enabled (0/1)", boolean: true },
];

function withUuid(rows: Record<string, any>[]): ChildRow[] {
  return rows.map((r) => ({ ...r, __uuid: crypto.randomUUID() }));
}

function cleanRow(row: ChildRow): Record<string, unknown> {
  const { __uuid, name: _rowName, owner, creation, modified, modified_by, parent, parentfield, parenttype, docstatus, idx, ...rest } = row;
  return rest;
}

/** Mode of Payment master — Cash/Bank/Card channels, each with a per-company default account. */
export function ModeOfPaymentPage() {
  const { data, error, isLoading, mutate } = useModesOfPayment();
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useModeOfPaymentMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [editing, setEditing] = useState<ModeOfPayment | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<ChildRow[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ModeOfPayment | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setFormValues({ enabled: 1 });
    setRows([]);
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = async (row: ModeOfPayment) => {
    setLoadingDoc(true);
    setEditing(row);
    setFormValues({ ...row });
    setRows([]);
    setFormErrors({});
    setDialogOpen(true);
    try {
      const full = await getDocument<ModeOfPayment>("Mode of Payment", row.name);
      setFormValues({ ...full });
      setRows(withUuid(full.accounts ?? []));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setLoadingDoc(false);
    }
  };

  const handleRowChange = (index: number, fieldname: string, value: any) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [fieldname]: value };
      return next;
    });
  };
  const addRow = () => setRows((prev) => [...prev, { __uuid: crypto.randomUUID() }]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    if (!formValues.mode_of_payment) {
      setFormErrors({ mode_of_payment: "Mode of Payment is required" });
      return;
    }
    const payload: Partial<ModeOfPayment> = {
      ...formValues,
      accounts: rows.map((r, i) => ({ doctype: "Mode of Payment Account", ...cleanRow(r), idx: i + 1 })) as ModeOfPayment["accounts"],
    };
    try {
      if (editing) {
        await updateDoc(editing.name, payload);
        toast.success("Mode of Payment updated");
      } else {
        await createDoc(payload);
        toast.success("Mode of Payment created");
      }
      setDialogOpen(false);
      await mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(deleteTarget.name);
      toast.success("Mode of Payment deleted");
      setDeleteTarget(null);
      await mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const columns: ColumnDef<ModeOfPayment>[] = [
    { key: "name", label: "Mode of Payment", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "type", label: "Type" },
    { key: "enabled", label: "Status", render: (r) => (r.enabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="destructive">Disabled</Badge>) },
    {
      key: "__actions",
      label: "",
      sortable: false,
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => void openEdit(r)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mode of Payment"
        subtitle="Cash, bank and card payment channels used across invoices and entries"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> New Mode of Payment
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
        onRowClick={(r) => void openEdit(r)}
        striped
        title="Mode of Payment"
        exportFilename="mode-of-payment"
        emptyTitle="No modes of payment found"
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} size="lg" title={editing ? "Edit Mode of Payment" : "New Mode of Payment"}>
        <div className="space-y-5">
          <FrappeForm
            fields={HEADER_FIELDS}
            values={formValues}
            onChange={(fieldname, value) => setFormValues((v) => ({ ...v, [fieldname]: value }))}
            errors={formErrors}
          />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Accounts</h3>
            <p className="mb-2 text-xs text-muted-foreground">Default account used for each company when this mode of payment is selected.</p>
            <EditableChildTable
              columns={ACCOUNT_ROW_COLUMNS}
              rows={rows}
              onChange={handleRowChange}
              onAddRow={addRow}
              onRemoveRow={removeRow}
              emptyMessage={loadingDoc ? "Loading…" : "No rows yet. Click Add Row to begin."}
            />
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={saving}>
              {editing ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={saving}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Modes of Payment"
        fields={IMPORT_FIELDS}
        sampleRow={{ mode_of_payment: "Wire Transfer", type: "Bank", enabled: "1" }}
        onImportRow={(row) => createDoc(row)}
        onImported={() => void mutate()}
      />
    </div>
  );
}
