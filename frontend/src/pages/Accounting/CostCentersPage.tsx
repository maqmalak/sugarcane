import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { List, ListTree, Plus, Upload, Download, Printer } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/error-state";
import { EmptyState } from "@/components/common/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { FrappeForm } from "@/components/forms/frappe-form";
import { type FormFieldMeta } from "@/components/forms/field-primitives";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { TreeExplorer, flattenWithDepth } from "@/components/common/tree-explorer";
import { ImportDialog } from "@/components/common/import-dialog";
import { useCostCenters, useCostCenterMutations } from "@/hooks/useAccounting";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { exportToCsv, exportToXlsx } from "@/utils/export";
import { printTree } from "@/utils/print";
import type { CostCenter } from "@/types/frappe";

function costCenterFormFields(company?: string): FormFieldMeta[] {
  return [
    { fieldname: "cost_center_name", label: "Cost Center Name", fieldtype: "Data", reqd: true },
    { fieldname: "cost_center_number", label: "Cost Center Number", fieldtype: "Data" },
    {
      fieldname: "parent_cost_center",
      label: "Parent Cost Center (Group)",
      fieldtype: "Link",
      options: "Cost Center",
      reqd: true,
      filters: [["company", "=", company], ["is_group", "=", 1]],
    },
    { fieldname: "is_group", label: "Group Cost Center (can have child cost centers)", fieldtype: "Check" },
    { fieldname: "disabled", label: "Disabled", fieldtype: "Check" },
  ];
}

const COLUMNS: ColumnDef<CostCenter>[] = [
  { key: "cost_center_name", label: "Cost Center", render: (r) => <span className="font-medium">{r.cost_center_name || r.name}</span> },
  { key: "cost_center_number", label: "Number" },
  { key: "parent_cost_center", label: "Parent" },
  { key: "is_group", label: "Type", render: (r) => (r.is_group ? <Badge variant="secondary">Group</Badge> : <Badge variant="outline">Leaf</Badge>) },
  { key: "disabled", label: "Status", render: (r) => (r.disabled ? <Badge variant="destructive">Disabled</Badge> : <Badge variant="success">Active</Badge>) },
];

const IMPORT_FIELDS = [
  { fieldname: "cost_center_name", label: "Cost Center Name", required: true },
  { fieldname: "cost_center_number", label: "Cost Center Number" },
  { fieldname: "parent_cost_center", label: "Parent Cost Center", required: true },
  { fieldname: "is_group", label: "Is Group (0/1)", boolean: true },
  { fieldname: "disabled", label: "Disabled (0/1)", boolean: true },
];

/** Cost Center master — full tree + list management (standard ERPNext Cost Center DocType). */
export function CostCentersPage() {
  const { company } = useCompanyContext();
  const { data, error, isLoading, mutate } = useCostCenters(company);
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useCostCenterMutations();

  const [view, setView] = useState<"tree" | "list">("tree");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CostCenter | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<CostCenter | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const treeNodes = useMemo(
    () =>
      (data ?? []).map((c) => ({
        name: c.name,
        label: c.cost_center_name || c.name,
        code: c.cost_center_number,
        parent: c.parent_cost_center,
        isGroup: Boolean(c.is_group),
        disabled: Boolean(c.disabled),
        raw: c,
      })),
    [data],
  );

  const printTreeRows = () =>
    flattenWithDepth(treeNodes).map(({ node, depth }) => ({
      depth,
      code: node.code,
      label: node.label,
      isGroup: node.isGroup,
      meta: node.disabled ? "Disabled" : undefined,
    }));

  const openCreate = (parent?: CostCenter) => {
    setEditing(null);
    setFormValues({ company, parent_cost_center: parent?.name });
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (cc: CostCenter) => {
    setEditing(cc);
    setFormValues({ ...cc });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!formValues.cost_center_name) errors.cost_center_name = "Cost Center Name is required";
    if (!formValues.parent_cost_center) errors.parent_cost_center = "Parent Cost Center is required";
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    try {
      if (editing) {
        await updateDoc(editing.name, formValues);
        toast.success("Cost Center updated");
      } else {
        await createDoc({ ...formValues, company });
        toast.success("Cost Center created");
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
      toast.success("Cost Center deleted");
      setDeleteTarget(null);
      await mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const exportColumns = COLUMNS.map((c) => ({ key: c.key, label: c.label }));
  const exportRows = (data ?? []).map((r) => ({
    cost_center_name: r.cost_center_name,
    cost_center_number: r.cost_center_number ?? "",
    parent_cost_center: r.parent_cost_center ?? "",
    is_group: r.is_group ? "Group" : "Leaf",
    disabled: r.disabled ? "Disabled" : "Active",
  }));

  const listColumns: ColumnDef<CostCenter>[] = [
    ...COLUMNS,
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
        title="Cost Centers"
        subtitle="Track income and expense by department, project or division"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-input bg-popover p-0.5 shadow-sm">
              <button
                onClick={() => setView("tree")}
                className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${view === "tree" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <ListTree className="h-3.5 w-3.5" /> Tree
              </button>
              <button
                onClick={() => setView("list")}
                className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${view === "list" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <List className="h-3.5 w-3.5" /> List
              </button>
            </div>
            {view === "tree" && (
              <>
                <DropdownMenu
                  trigger={
                    <Button variant="outline" size="sm">
                      <Download className="h-3.5 w-3.5" /> Export
                    </Button>
                  }
                  items={[
                    { label: "Export to CSV", onClick: () => exportToCsv(exportColumns, exportRows, "cost-centers") },
                    { label: "Export to Excel (.xlsx)", onClick: () => exportToXlsx(exportColumns, exportRows, "cost-centers") },
                    {
                      label: "Export to PDF",
                      onClick: () => printTree("Cost Centers", printTreeRows(), company ? `Company: ${company}` : undefined),
                    },
                  ]}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => printTree("Cost Centers", printTreeRows(), company ? `Company: ${company}` : undefined)}
                >
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" onClick={() => openCreate()}>
              <Plus className="h-3.5 w-3.5" /> New Cost Center
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={() => void mutate()} />
          ) : !company ? (
            <EmptyState title="No company selected" description="Choose a company to view its Cost Centers." />
          ) : (data ?? []).length === 0 ? (
            <EmptyState title="No cost centers found" description="This company has no Cost Centers set up yet." />
          ) : view === "tree" ? (
            <TreeExplorer
              nodes={treeNodes}
              onAddChild={(node) => openCreate(node.raw)}
              onEdit={(node) => openEdit(node.raw)}
              onDelete={(node) => setDeleteTarget(node.raw)}
            />
          ) : (
            <FrappeDataTable
              columns={listColumns}
              rows={data ?? []}
              rowKey={(r) => r.name}
              striped
              title="Cost Centers"
              exportFilename="cost-centers"
              printTitle="Cost Centers"
              printSubtitle={company ? `Company: ${company}` : undefined}
              emptyTitle="No cost centers found"
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} size="lg" title={editing ? "Edit Cost Center" : "New Cost Center"}>
        <div className="space-y-5">
          <FrappeForm
            fields={costCenterFormFields(company)}
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
        title={`Delete "${deleteTarget?.cost_center_name || deleteTarget?.name}"?`}
        description="This cost center will be permanently deleted. Cost centers with postings or child cost centers cannot be deleted."
        confirmLabel="Delete"
        destructive
        loading={saving}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Cost Centers"
        fields={IMPORT_FIELDS}
        sampleRow={{
          cost_center_name: "Marketing",
          cost_center_number: "",
          parent_cost_center: "Main",
          is_group: "0",
          disabled: "0",
        }}
        hierarchy={{ keyField: "cost_center_name", parentField: "parent_cost_center" }}
        onImportRow={(row) => createDoc({ ...row, company })}
        onImported={() => void mutate()}
      />
    </div>
  );
}
