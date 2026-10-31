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
import { textPreview } from "@/components/crm/doc-panels";
import { useTermsAndConditions, useTermsAndConditionsMutations } from "@/hooks/useAccounting";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { TermsAndConditions } from "@/types/frappe";

const FORM_FIELDS: FormFieldMeta[] = [
  { fieldname: "title", label: "Title", fieldtype: "Data", reqd: true },
  { fieldname: "terms", label: "Terms", fieldtype: "Text Editor" },
  { fieldname: "selling", label: "Selling", fieldtype: "Check" },
  { fieldname: "buying", label: "Buying", fieldtype: "Check" },
  { fieldname: "disabled", label: "Disabled", fieldtype: "Check" },
];

const IMPORT_FIELDS = [
  { fieldname: "title", label: "Title", required: true },
  { fieldname: "terms", label: "Terms" },
  { fieldname: "selling", label: "Selling (0/1)", boolean: true },
  { fieldname: "buying", label: "Buying (0/1)", boolean: true },
  { fieldname: "disabled", label: "Disabled (0/1)", boolean: true },
];

/** Terms and Conditions master — reusable clauses attached to Sales/Purchase transactions. */
export function TermsAndConditionsPage() {
  const { data, error, isLoading, mutate } = useTermsAndConditions();
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useTermsAndConditionsMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TermsAndConditions | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<TermsAndConditions | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setFormValues({});
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (row: TermsAndConditions) => {
    setEditing(row);
    setFormValues({ ...row });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formValues.title) {
      setFormErrors({ title: "Title is required" });
      return;
    }
    try {
      if (editing) {
        await updateDoc(editing.name, formValues);
        toast.success("Terms and Conditions updated");
      } else {
        await createDoc(formValues);
        toast.success("Terms and Conditions created");
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
      toast.success("Terms and Conditions deleted");
      setDeleteTarget(null);
      await mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const columns: ColumnDef<TermsAndConditions>[] = [
    { key: "title", label: "Title", render: (r) => <span className="font-medium">{r.title || r.name}</span> },
    { key: "terms", label: "Preview", render: (r) => <span className="line-clamp-1 text-xs text-muted-foreground">{r.terms ? textPreview(r.terms, 120) : "—"}</span> },
    {
      key: "applies_to",
      label: "Applies To",
      sortable: false,
      render: (r) => (
        <div className="flex gap-1">
          {r.selling && <Badge variant="info">Selling</Badge>}
          {r.buying && <Badge variant="secondary">Buying</Badge>}
          {!r.selling && !r.buying && "—"}
        </div>
      ),
    },
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
        title="Terms and Conditions"
        subtitle="Reusable clauses attached to Sales/Purchase transactions and print formats"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> New Terms and Conditions
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
        title="Terms and Conditions"
        exportFilename="terms-and-conditions"
        emptyTitle="No terms and conditions found"
        emptyDescription="Create one, or import a list, to start attaching terms to transactions."
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} size="lg" title={editing ? "Edit Terms and Conditions" : "New Terms and Conditions"}>
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
        title={`Delete "${deleteTarget?.title || deleteTarget?.name}"?`}
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
        title="Import Terms and Conditions"
        fields={IMPORT_FIELDS}
        sampleRow={{ title: "Standard Delivery Terms", terms: "<p>Delivery within 7 business days.</p>", selling: "1", buying: "0", disabled: "0" }}
        onImportRow={(row) => createDoc(row)}
        onImported={() => void mutate()}
      />
    </div>
  );
}
