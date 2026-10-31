import { useState } from "react";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FrappeForm } from "@/components/forms/frappe-form";
import { FrappeLinkField, type FormFieldMeta } from "@/components/forms/field-primitives";
import { EditableChildTable, type ChildRow } from "@/components/tables/child-table";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import {
  useJournalEntryTemplates,
  useJournalEntryTemplateMutations,
  useJournalEntryNamingSeries,
} from "@/hooks/useAccounting";
import { getDocument } from "@/services/api";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { JournalEntryTemplate } from "@/types/frappe";

const VOUCHER_TYPE_OPTIONS = [
  "Journal Entry",
  "Inter Company Journal Entry",
  "Bank Entry",
  "Cash Entry",
  "Credit Card Entry",
  "Debit Note",
  "Credit Note",
  "Contra Entry",
  "Excise Entry",
  "Write Off Entry",
  "Opening Entry",
  "Depreciation Entry",
  "Exchange Rate Revaluation",
];

function headerFields(namingSeriesOptions: string[]): FormFieldMeta[] {
  return [
    { fieldname: "template_title", label: "Template Title", fieldtype: "Data", reqd: true },
    { fieldname: "voucher_type", label: "Voucher Type", fieldtype: "Select", options: VOUCHER_TYPE_OPTIONS.join("\n"), reqd: true },
    { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: true },
    { fieldname: "naming_series", label: "Naming Series", fieldtype: "Select", options: namingSeriesOptions.join("\n"), reqd: namingSeriesOptions.length > 0 },
    { fieldname: "is_opening", label: "Is Opening", fieldtype: "Select", options: "No\nYes" },
    { fieldname: "multi_currency", label: "Multi Currency", fieldtype: "Check" },
  ];
}

function accountRowColumns(company?: string): FormFieldMeta[] {
  return [
    { fieldname: "account", label: "Account", fieldtype: "Link", options: "Account", reqd: true, filters: company ? [["company", "=", company]] : undefined },
    { fieldname: "party_type", label: "Party Type", fieldtype: "Select", options: "\nCustomer\nSupplier\nEmployee\nShareholder" },
    { fieldname: "party", label: "Party", fieldtype: "Dynamic Link", options: "party_type" },
    { fieldname: "cost_center", label: "Cost Center", fieldtype: "Link", options: "Cost Center", filters: company ? [["company", "=", company]] : undefined },
    { fieldname: "project", label: "Project", fieldtype: "Link", options: "Project" },
  ];
}

function withUuid(rows: Record<string, any>[]): ChildRow[] {
  return rows.map((r) => ({ ...r, __uuid: crypto.randomUUID() }));
}

function cleanRow(row: ChildRow): Record<string, unknown> {
  const { __uuid, name: _rowName, owner, creation, modified, modified_by, parent, parentfield, parenttype, docstatus, idx, ...rest } = row;
  return rest;
}

const COLUMNS: ColumnDef<JournalEntryTemplate>[] = [
  { key: "template_title", label: "Template Title", render: (r) => <span className="font-medium">{r.template_title || r.name}</span> },
  { key: "voucher_type", label: "Voucher Type" },
  { key: "company", label: "Company" },
  { key: "is_opening", label: "Opening Entry", render: (r) => (r.is_opening === "Yes" ? <Badge variant="secondary">Yes</Badge> : "No") },
  { key: "multi_currency", label: "Multi Currency", render: (r) => (r.multi_currency ? <Badge variant="info">Yes</Badge> : "No") },
];

/** Journal Entry Template master — reusable account line presets for quickly creating Journal Entries. */
export function JournalEntryTemplatePage() {
  const { data, error, isLoading, mutate } = useJournalEntryTemplates();
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useJournalEntryTemplateMutations();
  const namingSeriesOptions = useJournalEntryNamingSeries();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [editing, setEditing] = useState<JournalEntryTemplate | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<ChildRow[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<JournalEntryTemplate | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormValues({ voucher_type: "Journal Entry", is_opening: "No" });
    setRows([]);
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = async (row: JournalEntryTemplate) => {
    setLoadingDoc(true);
    setEditing(row);
    setFormValues({ ...row });
    setRows([]);
    setFormErrors({});
    setDialogOpen(true);
    try {
      const full = await getDocument<JournalEntryTemplate>("Journal Entry Template", row.name);
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
      const row = { ...next[index], [fieldname]: value };
      if (fieldname === "party_type") row.party = "";
      next[index] = row;
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
    if (!formValues.template_title) errors.template_title = "Template Title is required";
    if (!formValues.voucher_type) errors.voucher_type = "Voucher Type is required";
    if (!formValues.company) errors.company = "Company is required";
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    const payload: Partial<JournalEntryTemplate> = {
      ...formValues,
      accounts: rows.map((r, i) => ({ doctype: "Journal Entry Template Account", ...cleanRow(r), idx: i + 1 })) as JournalEntryTemplate["accounts"],
    };
    try {
      if (editing) {
        await updateDoc(editing.name, payload);
        toast.success("Journal Entry Template updated");
      } else {
        await createDoc(payload);
        toast.success("Journal Entry Template created");
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
      toast.success("Journal Entry Template deleted");
      setDeleteTarget(null);
      await mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const listColumns: ColumnDef<JournalEntryTemplate>[] = [
    ...COLUMNS,
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
        title="Journal Entry Templates"
        subtitle="Reusable account line presets for quickly creating Journal Entries"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> New Journal Entry Template
          </Button>
        }
      />

      <FrappeDataTable
        columns={listColumns}
        rows={data ?? []}
        rowKey={(r) => r.name}
        loading={isLoading}
        error={error}
        onRetry={() => void mutate()}
        onRowClick={(r) => void openEdit(r)}
        striped
        title="Journal Entry Templates"
        exportFilename="journal-entry-templates"
        emptyTitle="No journal entry templates found"
        emptyDescription="Create one to speed up entering recurring Journal Entries."
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} size="xl" title={editing ? "Edit Journal Entry Template" : "New Journal Entry Template"}>
        <div className="space-y-5">
          <FrappeForm
            fields={headerFields(namingSeriesOptions)}
            values={formValues}
            onChange={(fieldname, value) => setFormValues((v) => ({ ...v, [fieldname]: value }))}
            errors={formErrors}
          />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Accounts</h3>
            <EditableChildTable
              columns={accountRowColumns(formValues.company)}
              rows={rows}
              onChange={handleRowChange}
              onAddRow={addRow}
              onRemoveRow={removeRow}
              onDuplicateRow={duplicateRow}
              editableInDialog
              emptyMessage={loadingDoc ? "Loading…" : "No rows yet. Click Add Row to begin."}
              renderCell={(row, col) => {
                if (col.fieldname !== "party") return undefined;
                const index = rows.indexOf(row);
                if (!row.party_type) return <span className="px-2 text-xs text-muted-foreground">—</span>;
                return (
                  <FrappeLinkField
                    meta={{ ...col, options: row.party_type as string }}
                    value={(row.party as string) ?? ""}
                    onChange={(v) => handleRowChange(index, "party", v)}
                  />
                );
              }}
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
        title={`Delete "${deleteTarget?.template_title || deleteTarget?.name}"?`}
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
