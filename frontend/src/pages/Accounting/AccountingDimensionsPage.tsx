import { useState } from "react";
import toast from "react-hot-toast";
import { Plus, Sliders } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FrappeForm } from "@/components/forms/frappe-form";
import { type FormFieldMeta } from "@/components/forms/field-primitives";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { useAccountingDimensions, useAccountingDimensionMutations } from "@/hooks/useSettings";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { AccountingDimension } from "@/types/frappe";

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const FORM_FIELDS: FormFieldMeta[] = [
  { fieldname: "label", label: "Label", fieldtype: "Data", reqd: true, placeholder: "e.g. Territory" },
  { fieldname: "document_type", label: "Reference Document Type", fieldtype: "Link", options: "DocType", reqd: true, description: "The master doctype this dimension picks a value from (e.g. Territory, Project)." },
  { fieldname: "disabled", label: "Disabled", fieldtype: "Check" },
];

/** Accounting Dimension master — custom dimensions (Territory, Project, ...) available across GL entries and reports. */
export function AccountingDimensionsPage() {
  const { data, error, isLoading, mutate } = useAccountingDimensions();
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useAccountingDimensionMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccountingDimension | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<AccountingDimension | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormValues({});
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (row: AccountingDimension) => {
    setEditing(row);
    setFormValues({ ...row });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formValues.label) {
      setFormErrors({ label: "Label is required" });
      return;
    }
    if (!formValues.document_type) {
      setFormErrors({ document_type: "Reference Document Type is required" });
      return;
    }
    try {
      if (editing) {
        await updateDoc(editing.name, formValues);
        toast.success("Accounting Dimension updated");
      } else {
        await createDoc({ ...formValues, fieldname: formValues.fieldname || slugify(formValues.label) });
        toast.success("Accounting Dimension created");
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
      toast.success("Accounting Dimension deleted");
      setDeleteTarget(null);
      await mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const columns: ColumnDef<AccountingDimension>[] = [
    { key: "label", label: "Label", render: (r) => <span className="font-medium">{r.label || r.name}</span> },
    { key: "fieldname", label: "Field Name" },
    { key: "document_type", label: "Reference Document Type" },
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
        title="Accounting Dimensions"
        subtitle="Custom dimensions (e.g. Territory, Project) for deeper financial reporting"
        icon={<Sliders className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> New Dimension
          </Button>
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
        title="Accounting Dimensions"
        exportFilename="accounting-dimensions"
        emptyTitle="No accounting dimensions found"
        emptyDescription="Add one to make a custom field (e.g. Territory) available across GL entries and financial reports."
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} size="md" title={editing ? "Edit Accounting Dimension" : "New Accounting Dimension"}>
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
        title={`Delete "${deleteTarget?.label || deleteTarget?.name}"?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={saving}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
