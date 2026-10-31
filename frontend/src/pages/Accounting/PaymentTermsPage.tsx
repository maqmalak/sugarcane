import { useState } from "react";
import toast from "react-hot-toast";
import { Plus, Upload } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FrappeForm } from "@/components/forms/frappe-form";
import { type FormFieldMeta } from "@/components/forms/field-primitives";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { ImportDialog } from "@/components/common/import-dialog";
import { usePaymentTerms, usePaymentTermMutations } from "@/hooks/useAccounting";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { PaymentTerm } from "@/types/frappe";

const DUE_DATE_OPTIONS = [
  "Day(s) after invoice date",
  "Day(s) after the end of the invoice month",
  "Month(s) after the end of the invoice month",
];

const FORM_FIELDS: FormFieldMeta[] = [
  { fieldname: "payment_term_name", label: "Payment Term Name", fieldtype: "Data", reqd: true },
  {
    fieldname: "invoice_portion",
    label: "Invoice Portion (%)",
    fieldtype: "Float",
    description: "Percentage of the invoice value due under this term — across all terms on one Payment Terms Template, portions should add up to 100%.",
  },
  { fieldname: "mode_of_payment", label: "Mode of Payment", fieldtype: "Link", options: "Mode of Payment" },
  { fieldname: "due_date_based_on", label: "Due Date Based On", fieldtype: "Select", options: ["", ...DUE_DATE_OPTIONS].join("\n") },
  { fieldname: "credit_days", label: "Credit Days", fieldtype: "Int" },
  { fieldname: "credit_months", label: "Credit Months", fieldtype: "Int" },
  { fieldname: "description", label: "Description", fieldtype: "Text Editor" },
  { fieldname: "discount_type", label: "Discount Type", fieldtype: "Select", options: "\nPercentage\nAmount" },
  { fieldname: "discount", label: "Discount", fieldtype: "Float" },
  { fieldname: "discount_validity_based_on", label: "Discount Validity Based On", fieldtype: "Select", options: ["", ...DUE_DATE_OPTIONS].join("\n") },
  { fieldname: "discount_validity", label: "Discount Validity (days)", fieldtype: "Int" },
];

const IMPORT_FIELDS = [
  { fieldname: "payment_term_name", label: "Payment Term Name", required: true },
  { fieldname: "invoice_portion", label: "Invoice Portion (%)" },
  { fieldname: "mode_of_payment", label: "Mode of Payment" },
  { fieldname: "due_date_based_on", label: "Due Date Based On" },
  { fieldname: "credit_days", label: "Credit Days" },
  { fieldname: "credit_months", label: "Credit Months" },
  { fieldname: "discount_type", label: "Discount Type" },
  { fieldname: "discount", label: "Discount" },
];

/** Payment Term master — reusable due-date and discount rules for invoice payment schedules. */
export function PaymentTermsPage() {
  const { data, error, isLoading, mutate } = usePaymentTerms();
  const { createDoc, updateDoc, deleteDoc, loading: saving } = usePaymentTermMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentTerm | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<PaymentTerm | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setFormValues({});
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (row: PaymentTerm) => {
    setEditing(row);
    setFormValues({ ...row });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formValues.payment_term_name) {
      setFormErrors({ payment_term_name: "Payment Term Name is required" });
      return;
    }
    try {
      if (editing) {
        await updateDoc(editing.name, formValues);
        toast.success("Payment Term updated");
      } else {
        await createDoc(formValues);
        toast.success("Payment Term created");
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
      toast.success("Payment Term deleted");
      setDeleteTarget(null);
      await mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const columns: ColumnDef<PaymentTerm>[] = [
    { key: "name", label: "Term", render: (r) => <span className="font-medium">{r.payment_term_name || r.name}</span> },
    { key: "invoice_portion", label: "Invoice %", align: "right", render: (r) => (r.invoice_portion != null ? `${r.invoice_portion}%` : "—") },
    { key: "due_date_based_on", label: "Due Date Based On" },
    { key: "credit_days", label: "Credit Days", align: "right" },
    { key: "discount", label: "Discount %", align: "right", render: (r) => (r.discount ? `${r.discount}%` : "—") },
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
        title="Payment Terms"
        subtitle="Reusable due-date and discount rules for invoice payment schedules"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> New Payment Term
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
        title="Payment Terms"
        exportFilename="payment-terms"
        emptyTitle="No payment terms found"
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} size="lg" title={editing ? "Edit Payment Term" : "New Payment Term"}>
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
        title={`Delete "${deleteTarget?.payment_term_name || deleteTarget?.name}"?`}
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
        title="Import Payment Terms"
        fields={IMPORT_FIELDS}
        sampleRow={{ payment_term_name: "50% Advance", invoice_portion: "50", mode_of_payment: "", due_date_based_on: "Day(s) after invoice date", credit_days: "0", credit_months: "0", discount_type: "", discount: "" }}
        onImportRow={(row) => createDoc(row)}
        onImported={() => void mutate()}
      />
    </div>
  );
}
