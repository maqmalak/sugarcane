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
import { useTaxTemplates, useTaxTemplateMutations } from "@/hooks/useAccounting";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { getDocument } from "@/services/api";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { TaxTemplate } from "@/types/frappe";

type TaxDoctype = "Sales Taxes and Charges Template" | "Purchase Taxes and Charges Template";

const CHARGE_TYPE_DESCRIPTION =
  "\"On Previous Row Amount\" / \"On Previous Row Total\" compute this row from another row in the same table — enter that row's Row # in the Row Id column below.";

function headerFields(company?: string): FormFieldMeta[] {
  return [
    { fieldname: "title", label: "Title", fieldtype: "Data", reqd: true },
    { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true, default: company },
    { fieldname: "tax_category", label: "Tax Category", fieldtype: "Link", options: "Tax Category" },
    { fieldname: "is_default", label: "Default", fieldtype: "Check" },
    { fieldname: "disabled", label: "Disabled", fieldtype: "Check" },
  ];
}

function taxRowColumns(isPurchase: boolean, company?: string): FormFieldMeta[] {
  const cols: FormFieldMeta[] = [
    {
      fieldname: "charge_type",
      label: "Charge Type",
      fieldtype: "Select",
      options: "\nActual\nOn Net Total\nOn Previous Row Amount\nOn Previous Row Total\nOn Item Quantity",
      reqd: true,
      description: CHARGE_TYPE_DESCRIPTION,
    },
    { fieldname: "row_id", label: "Row Id", fieldtype: "Data", placeholder: "e.g. 1" },
    { fieldname: "account_head", label: "Account Head", fieldtype: "Link", options: "Account", reqd: true, filters: company ? [["company", "=", company]] : undefined },
    { fieldname: "rate", label: "Rate (%)", fieldtype: "Float" },
    { fieldname: "cost_center", label: "Cost Center", fieldtype: "Link", options: "Cost Center", filters: company ? [["company", "=", company]] : undefined },
    { fieldname: "description", label: "Description", fieldtype: "Data", reqd: true },
  ];
  if (isPurchase) {
    cols.push(
      { fieldname: "category", label: "Consider Tax/Charge for", fieldtype: "Select", options: "Valuation and Total\nValuation\nTotal" },
      { fieldname: "add_deduct_tax", label: "Add/Deduct", fieldtype: "Select", options: "Add\nDeduct" },
    );
  } else {
    cols.push({ fieldname: "included_in_print_rate", label: "Included in Print Rate", fieldtype: "Check" });
  }
  return cols;
}

function withUuid(rows: Record<string, any>[]): ChildRow[] {
  return rows.map((r) => ({ ...r, __uuid: crypto.randomUUID() }));
}

function cleanRow(row: ChildRow): Record<string, unknown> {
  const { __uuid, name: _rowName, owner, creation, modified, modified_by, parent, parentfield, parenttype, docstatus, idx, ...rest } = row;
  return rest;
}

/** Sales or Purchase Taxes and Charges Template — full management with the tax charge rows table. */
export function TaxTemplatesPage({ doctype, title, subtitle }: { doctype: TaxDoctype; title: string; subtitle: string }) {
  const isPurchase = doctype === "Purchase Taxes and Charges Template";
  const rowDoctype = isPurchase ? "Purchase Taxes and Charges" : "Sales Taxes and Charges";
  const { company } = useCompanyContext();
  const { data, error, isLoading, mutate } = useTaxTemplates(doctype, company);
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useTaxTemplateMutations(doctype);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [editing, setEditing] = useState<TaxTemplate | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<ChildRow[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<TaxTemplate | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setFormValues({ company });
    setRows([]);
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = async (row: TaxTemplate) => {
    setLoadingDoc(true);
    setEditing(row);
    setFormValues({ ...row });
    setRows([]);
    setFormErrors({});
    setDialogOpen(true);
    try {
      const full = await getDocument<TaxTemplate>(doctype, row.name);
      setFormValues({ ...full });
      setRows(withUuid(full.taxes ?? []));
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
  const duplicateRow = (index: number) =>
    setRows((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, { ...prev[index], __uuid: crypto.randomUUID() });
      return next;
    });

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!formValues.title) errors.title = "Title is required";
    if (!formValues.company) errors.company = "Company is required";
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    const payload: Partial<TaxTemplate> = {
      ...formValues,
      taxes: rows.map((r, i) => ({ doctype: rowDoctype, ...cleanRow(r), idx: i + 1 })) as TaxTemplate["taxes"],
    };
    try {
      if (editing) {
        await updateDoc(editing.name, payload);
        toast.success(`${title.replace(/s$/, "")} updated`);
      } else {
        await createDoc(payload);
        toast.success(`${title.replace(/s$/, "")} created`);
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
      toast.success(`${title.replace(/s$/, "")} deleted`);
      setDeleteTarget(null);
      await mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const columns: ColumnDef<TaxTemplate>[] = [
    { key: "title", label: "Template", render: (r) => <span className="font-medium">{r.title || r.name}</span> },
    { key: "company", label: "Company" },
    { key: "tax_category", label: "Tax Category" },
    { key: "is_default", label: "Default", render: (r) => (r.is_default ? <Badge variant="primary">Default</Badge> : null) },
    { key: "disabled", label: "Status", render: (r) => (r.disabled ? <Badge variant="destructive">Disabled</Badge> : <Badge variant="success">Active</Badge>) },
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
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> New {title.replace(/s$/, "")}
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
        title={title}
        exportFilename={doctype.toLowerCase().replace(/\s+/g, "-")}
        emptyTitle={`No ${title.toLowerCase()} found`}
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        size="xl"
        title={editing ? `Edit ${title.replace(/s$/, "")}` : `New ${title.replace(/s$/, "")}`}
      >
        <div className="space-y-5">
          <FrappeForm
            fields={headerFields(company)}
            values={formValues}
            onChange={(fieldname, value) => setFormValues((v) => ({ ...v, [fieldname]: value }))}
            errors={formErrors}
          />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Tax / Charge Rows</h3>
            <EditableChildTable
              columns={taxRowColumns(isPurchase, formValues.company)}
              rows={rows}
              onChange={handleRowChange}
              onAddRow={addRow}
              onRemoveRow={removeRow}
              onDuplicateRow={duplicateRow}
              editableInDialog
              columnPicker
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
        title={`Import ${title}`}
        fields={[
          { fieldname: "title", label: "Title", required: true },
          { fieldname: "company", label: "Company", required: true },
          { fieldname: "tax_category", label: "Tax Category" },
          { fieldname: "is_default", label: "Default (0/1)", boolean: true },
          { fieldname: "disabled", label: "Disabled (0/1)", boolean: true },
        ]}
        sampleRow={{ title: "Standard GST", company: company ?? "", tax_category: "", is_default: "0", disabled: "0" }}
        onImportRow={(row) => createDoc(row)}
        onImported={() => void mutate()}
      />
    </div>
  );
}
