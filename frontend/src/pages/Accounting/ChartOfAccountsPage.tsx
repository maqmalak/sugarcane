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
import { useChartOfAccounts, useAccountMutations, useHasCpsField } from "@/hooks/useAccounting";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import { exportToCsv, exportToXlsx } from "@/utils/export";
import { printTree, type PrintTreeRow } from "@/utils/print";
import type { Account } from "@/types/frappe";

const ROOT_TYPE_BADGE: Record<string, "success" | "destructive" | "info" | "warning" | "default"> = {
  Asset: "success",
  Liability: "destructive",
  Equity: "info",
  Income: "success",
  Expense: "warning",
};

const ACCOUNT_TYPE_OPTIONS = [
  "Accumulated Depreciation",
  "Asset Received But Not Billed",
  "Bank",
  "Cash",
  "Chargeable",
  "Capital Work in Progress",
  "Cost of Goods Sold",
  "Current Asset",
  "Current Liability",
  "Depreciation",
  "Direct Expense",
  "Direct Income",
  "Equity",
  "Expense Account",
  "Expenses Included In Asset Valuation",
  "Expenses Included In Valuation",
  "Fixed Asset",
  "Income Account",
  "Indirect Expense",
  "Indirect Income",
  "Liability",
  "Payable",
  "Receivable",
  "Round Off",
  "Round Off for Opening",
  "Stock",
  "Stock Adjustment",
  "Stock Received But Not Billed",
  "Stock Delivered But Not Billed",
  "Service Received But Not Billed",
  "Tax",
  "Temporary",
];

/**
 * Fields for the account dialog. `rootType` is the *effective* root type — the
 * account's own when set, otherwise the parent's (Frappe stores a root type on
 * every account but lets a child inherit it) — and decides whether the
 * cost-per-spindle tag applies.
 */
function accountFormFields(company?: string, rootType?: string, hasCps = true): FormFieldMeta[] {
  return [
    { fieldname: "account_name", label: "Account Name", fieldtype: "Data", reqd: true },
    { fieldname: "account_number", label: "Account Number", fieldtype: "Data" },
    {
      fieldname: "parent_account",
      label: "Parent Account (Group)",
      fieldtype: "Link",
      options: "Account",
      reqd: true,
      filters: [["company", "=", company], ["is_group", "=", 1]],
    },
    { fieldname: "is_group", label: "Group Account (can have child accounts)", fieldtype: "Check" },
    {
      fieldname: "root_type",
      label: "Root Type",
      fieldtype: "Select",
      options: ["", "Asset", "Liability", "Equity", "Income", "Expense"].join("\n"),
      description: "Leave blank for a child account — it inherits this from its parent.",
    },
    { fieldname: "account_type", label: "Account Type", fieldtype: "Select", options: ["", ...ACCOUNT_TYPE_OPTIONS].join("\n") },
    { fieldname: "account_category", label: "Account Category", fieldtype: "Link", options: "Account Category" },
    // Cost-per-spindle tagging only makes sense on the expense side of the P&L.
    ...(rootType === "Expense" && hasCps
      ? [
          {
            fieldname: "cps_applicable",
            label: "CPS Applicable",
            fieldtype: "Check" as const,
            description: "Count this account's expenses towards the cost-per-spindle figures on the Production dashboard.",
          },
        ]
      : []),
    { fieldname: "disabled", label: "Disabled", fieldtype: "Check" },
  ];
}

const COLUMNS: ColumnDef<Account>[] = [
  { key: "account_name", label: "Account Name", render: (r) => <span className="font-medium">{r.account_name || r.name}</span> },
  { key: "account_number", label: "Number" },
  { key: "parent_account", label: "Parent" },
  { key: "root_type", label: "Root Type", render: (r) => (r.root_type ? <Badge variant={ROOT_TYPE_BADGE[r.root_type] ?? "default"}>{r.root_type}</Badge> : "—") },
  { key: "account_type", label: "Account Type" },
  { key: "is_group", label: "Type", render: (r) => (r.is_group ? <Badge variant="secondary">Group</Badge> : <Badge variant="outline">Leaf</Badge>) },
  { key: "disabled", label: "Status", render: (r) => (r.disabled ? <Badge variant="destructive">Disabled</Badge> : <Badge variant="success">Active</Badge>) },
  { key: "cps_applicable", label: "CPS", render: (r) => (r.cps_applicable ? <Badge variant="info">CPS applicable</Badge> : "—") },
];

const IMPORT_FIELDS = [
  { fieldname: "account_name", label: "Account Name", required: true },
  { fieldname: "account_number", label: "Account Number" },
  { fieldname: "parent_account", label: "Parent Account", required: true },
  { fieldname: "is_group", label: "Is Group (0/1)", boolean: true },
  { fieldname: "root_type", label: "Root Type" },
  { fieldname: "account_type", label: "Account Type" },
  { fieldname: "cps_applicable", label: "CPS Applicable (0/1)", boolean: true },
  { fieldname: "disabled", label: "Disabled (0/1)", boolean: true },
];

/** Chart of Accounts — full tree + list management for the Account doctype. */
export function ChartOfAccountsPage() {
  const { company, companies } = useCompanyContext();
  const { data, error, isLoading, mutate } = useChartOfAccounts(company);
  // Cost-per-spindle tagging is MicroMax's; other sites have no such field on Account.
  const { hasCps } = useHasCpsField();
  const columns = useMemo(() => (hasCps ? COLUMNS : COLUMNS.filter((c) => c.key !== "cps_applicable")), [hasCps]);
  const importFields = useMemo(() => (hasCps ? IMPORT_FIELDS : IMPORT_FIELDS.filter((f) => f.fieldname !== "cps_applicable")), [hasCps]);
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useAccountMutations();

  const [view, setView] = useState<"tree" | "list">("tree");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const treeNodes = useMemo(
    () =>
      (data ?? []).map((a) => ({
        name: a.name,
        label: a.account_name || a.name,
        code: a.account_number,
        parent: a.parent_account,
        isGroup: Boolean(a.is_group),
        disabled: Boolean(a.disabled),
        raw: a,
      })),
    [data],
  );

  /**
   * What the account's root type will end up as: its own when set, otherwise the
   * selected parent's (a blank root type means "inherit"). Drives the
   * cost-per-spindle tag offered in the dialog.
   */
  const effectiveRootType = useMemo(
    () => formValues.root_type || (data ?? []).find((a) => a.name === formValues.parent_account)?.root_type,
    [formValues.root_type, formValues.parent_account, data],
  );

  /** Prints the tree with a company-root row and the same group-first hierarchy shown on screen. */
  const printChartTree = () => {
    const rows: PrintTreeRow[] = [
      { depth: 0, label: company ?? "Company", isGroup: true },
      ...flattenWithDepth(treeNodes).map(({ node, depth }) => ({
        depth: depth + 1,
        code: node.code,
        label: node.label,
        isGroup: node.isGroup,
      })),
    ];
    printTree("Chart of Accounts", rows, company ? `Company: ${company}` : undefined);
  };

  const openCreate = (parent?: Account) => {
    setEditing(null);
    setFormValues({ company, parent_account: parent?.name, root_type: parent?.root_type });
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (account: Account) => {
    setEditing(account);
    setFormValues({ ...account });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!formValues.account_name) errors.account_name = "Account Name is required";
    if (!formValues.parent_account) errors.parent_account = "Parent Account is required";
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }
    try {
      if (editing) {
        await updateDoc(editing.name, formValues);
        toast.success("Account updated");
      } else {
        await createDoc({ ...formValues, company });
        toast.success("Account created");
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
      toast.success("Account deleted");
      setDeleteTarget(null);
      await mutate();
      notifyDataChanged();
    } catch (e) {
      toast.error(humanizeError(e));
    }
  };

  const exportColumns = columns.map((c) => ({ key: c.key, label: c.label }));
  const exportRows = (data ?? []).map((r) => ({
    account_name: r.account_name,
    account_number: r.account_number ?? "",
    parent_account: r.parent_account ?? "",
    root_type: r.root_type ?? "",
    account_type: r.account_type ?? "",
    is_group: r.is_group ? "Group" : "Leaf",
    cps_applicable: r.cps_applicable ? "CPS Applicable" : "",
    disabled: r.disabled ? "Disabled" : "Active",
  }));

  const listColumns: ColumnDef<Account>[] = [
    ...columns,
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
        title="Chart of Accounts"
        subtitle={company ? `Company: ${company}` : "Select a company"}
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
                    { label: "Export to CSV", onClick: () => exportToCsv(exportColumns, exportRows, "chart-of-accounts") },
                    { label: "Export to Excel (.xlsx)", onClick: () => exportToXlsx(exportColumns, exportRows, "chart-of-accounts") },
                    { label: "Export to PDF", onClick: printChartTree },
                  ]}
                />
                <Button variant="outline" size="sm" onClick={printChartTree}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <Button size="sm" onClick={() => openCreate()}>
              <Plus className="h-3.5 w-3.5" /> New Account
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
            <EmptyState title="No company selected" description={`Choose a company to view its Chart of Accounts.${companies.length === 0 ? "" : ""}`} />
          ) : (data ?? []).length === 0 ? (
            <EmptyState title="No accounts found" description="This company has no Chart of Accounts set up yet." />
          ) : view === "tree" ? (
            <TreeExplorer
              nodes={treeNodes}
              renderBadges={(node, depth) =>
                depth === 0 && node.raw.root_type ? <Badge variant={ROOT_TYPE_BADGE[node.raw.root_type] ?? "default"}>{node.raw.root_type}</Badge> : null
              }
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
              title="Chart of Accounts"
              exportFilename="chart-of-accounts"
              printTitle="Chart of Accounts"
              printSubtitle={company ? `Company: ${company}` : undefined}
              emptyTitle="No accounts found"
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} size="lg" title={editing ? "Edit Account" : "New Account"}>
        <div className="space-y-5">
          <FrappeForm
            fields={accountFormFields(company, effectiveRootType, hasCps)}
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
        title={`Delete "${deleteTarget?.account_name || deleteTarget?.name}"?`}
        description="This account will be permanently deleted. Accounts with postings or child accounts cannot be deleted."
        confirmLabel="Delete"
        destructive
        loading={saving}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Accounts"
        fields={importFields}
        sampleRow={{
          account_name: "Office Supplies",
          account_number: "",
          parent_account: "Indirect Expenses",
          is_group: "0",
          root_type: "",
          account_type: "Indirect Expense",
          disabled: "0",
        }}
        hierarchy={{ keyField: "account_name", parentField: "parent_account" }}
        onImportRow={(row) => createDoc({ ...row, company })}
        onImported={() => void mutate()}
      />
    </div>
  );
}
