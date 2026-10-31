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
import { useAccountCategories, useAccountCategoryMutations } from "@/hooks/useAccounting";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { AccountCategory } from "@/types/frappe";

const FORM_FIELDS: FormFieldMeta[] = [
  { fieldname: "account_category_name", label: "Account Category Name", fieldtype: "Data", reqd: true },
  { fieldname: "root_type", label: "Root Type", fieldtype: "Select", options: ["", "Asset", "Liability", "Equity", "Income", "Expense"].join("\n") },
  { fieldname: "description", label: "Description", fieldtype: "Text Editor" },
];

const IMPORT_FIELDS = [
  { fieldname: "account_category_name", label: "Account Category Name", required: true },
  { fieldname: "root_type", label: "Root Type" },
  { fieldname: "description", label: "Description" },
];

const ROOT_TYPE_BADGE: Record<string, "success" | "destructive" | "info" | "warning" | "default"> = {
  Asset: "success",
  Liability: "destructive",
  Equity: "info",
  Income: "success",
  Expense: "warning",
};

/** Account Category master — a simple grouping tag applied to Chart of Accounts entries. */
export function AccountCategoriesPage() {
  const { data, error, isLoading, mutate } = useAccountCategories();
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useAccountCategoryMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccountCategory | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<AccountCategory | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setFormValues({});
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (row: AccountCategory) => {
    setEditing(row);
    setFormValues({ ...row });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formValues.account_category_name) {
      setFormErrors({ account_category_name: "Account Category Name is required" });
      return;
    }
    try {
      if (editing) {
        await updateDoc(editing.name, formValues);
        toast.success("Account Category updated");
      } else {
        await createDoc(formValues);
        toast.success("Account Category created");
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
      toast.success("Account Category deleted");
      setDeleteTarget(null);
      await mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const columns: ColumnDef<AccountCategory>[] = [
    { key: "account_category_name", label: "Account Category", render: (r) => <span className="font-medium">{r.account_category_name || r.name}</span> },
    { key: "root_type", label: "Root Type", render: (r) => (r.root_type ? <Badge variant={ROOT_TYPE_BADGE[r.root_type] ?? "default"}>{r.root_type}</Badge> : "—") },
    { key: "description", label: "Description", render: (r) => <span className="line-clamp-1 text-xs text-muted-foreground">{r.description ? textPreview(r.description, 120) : "—"}</span> },
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
        title="Account Categories"
        subtitle="Group Chart of Accounts entries by category for reporting"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> New Account Category
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
        striped
        title="Account Categories"
        exportFilename="account-categories"
        emptyTitle="No account categories found"
        emptyDescription="Create one, or import a list, to start grouping accounts."
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} size="md" title={editing ? "Edit Account Category" : "New Account Category"}>
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
        title={`Delete "${deleteTarget?.account_category_name || deleteTarget?.name}"?`}
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
        title="Import Account Categories"
        fields={IMPORT_FIELDS}
        sampleRow={{ account_category_name: "Operating Expenses", root_type: "Expense", description: "" }}
        onImportRow={(row) => createDoc(row)}
        onImported={() => void mutate()}
      />
    </div>
  );
}
