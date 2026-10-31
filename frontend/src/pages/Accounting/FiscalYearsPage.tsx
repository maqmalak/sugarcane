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
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { ImportDialog } from "@/components/common/import-dialog";
import { useFiscalYears, useFiscalYearMutations } from "@/hooks/useAccounting";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { formatDate } from "@/utils/dates";
import type { FiscalYear } from "@/types/frappe";

const FORM_FIELDS: FormFieldMeta[] = [
  { fieldname: "year", label: "Year", fieldtype: "Data", reqd: true, placeholder: "e.g. 2026-2027" },
  { fieldname: "year_start_date", label: "Start Date", fieldtype: "Date", reqd: true },
  { fieldname: "year_end_date", label: "End Date", fieldtype: "Date", reqd: true },
  { fieldname: "disabled", label: "Disabled", fieldtype: "Check" },
];

const IMPORT_FIELDS = [
  { fieldname: "year", label: "Year", required: true },
  { fieldname: "year_start_date", label: "Start Date", required: true },
  { fieldname: "year_end_date", label: "End Date", required: true },
  { fieldname: "disabled", label: "Disabled (0/1)", boolean: true },
];

/** Fiscal Year master — the accounting periods used across all financial reports. */
export function FiscalYearsPage() {
  const { data, error, isLoading, mutate } = useFiscalYears();
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useFiscalYearMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FiscalYear | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<FiscalYear | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setFormValues({});
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (row: FiscalYear) => {
    setEditing(row);
    setFormValues({ ...row });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!formValues.year) errors.year = "Year is required";
    if (!formValues.year_start_date) errors.year_start_date = "Start Date is required";
    if (!formValues.year_end_date) errors.year_end_date = "End Date is required";
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    try {
      if (editing) {
        await updateDoc(editing.name, formValues);
        toast.success("Fiscal Year updated");
      } else {
        await createDoc(formValues);
        toast.success("Fiscal Year created");
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
      toast.success("Fiscal Year deleted");
      setDeleteTarget(null);
      await mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const columns: ColumnDef<FiscalYear>[] = [
    { key: "name", label: "Fiscal Year", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "year_start_date", label: "Start Date", render: (r) => formatDate(r.year_start_date) },
    { key: "year_end_date", label: "End Date", render: (r) => formatDate(r.year_end_date) },
    { key: "disabled", label: "Status", render: (r) => (r.disabled ? <Badge variant="destructive">Disabled</Badge> : <Badge variant="success">Active</Badge>) },
    {
      key: "__actions",
      label: "",
      sortable: false,
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
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
        title="Fiscal Years"
        subtitle="Accounting periods used across all financial reports"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> New Fiscal Year
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
        onRowClick={openEdit}
        striped
        title="Fiscal Years"
        exportFilename="fiscal-years"
        emptyTitle="No fiscal years found"
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} size="md" title={editing ? "Edit Fiscal Year" : "New Fiscal Year"}>
        <div className="space-y-5">
          <FrappeForm
            fields={FORM_FIELDS}
            values={formValues}
            onChange={(fieldname, value) => setFormValues((v) => ({ ...v, [fieldname]: value }))}
            errors={formErrors}
          />
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
        title="Import Fiscal Years"
        fields={IMPORT_FIELDS}
        sampleRow={{ year: "2027-2028", year_start_date: "2027-07-01", year_end_date: "2028-06-30", disabled: "0" }}
        onImportRow={(row) => createDoc(row)}
        onImported={() => void mutate()}
      />
    </div>
  );
}
