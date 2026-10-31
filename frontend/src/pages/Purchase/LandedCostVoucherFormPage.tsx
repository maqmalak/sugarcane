import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { Coins, Save, Send, Trash2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { FrappeForm } from "@/components/forms/frappe-form";
import { FrappeLinkField } from "@/components/forms/field-primitives";
import { EditableChildTable, type ChildRow } from "@/components/tables/child-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCard } from "@/components/common/section-card";
import {
  LANDED_COST_VOUCHER_FIELDS,
  LANDED_COST_RECEIPT_COLUMNS,
  LANDED_COST_ITEM_COLUMNS,
  LANDED_COST_TAXES_COLUMNS,
} from "@/components/forms/form-configs";
import {
  useLandedCostVoucher,
  useLandedCostVoucherMutations,
} from "@/hooks/useLandedCostVouchers";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney } from "@/utils/currency";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError, postCall } from "@/services/frappe";
import { getDocument, refreshLandedCostItems } from "@/services/api";
import { todayISO } from "@/utils/dates";
import type { LandedCostVoucher, LandedCostReceiptDocType } from "@/types/frappe";

function withUuid<T extends Record<string, any>>(rows: T[]): ChildRow[] {
  return rows.map((r) => ({ ...r, __uuid: crypto.randomUUID() }));
}

/** Strip Frappe row metadata before sending a child row back to the server. */
function cleanRow(row: ChildRow): Record<string, unknown> {
  const { __uuid, name: _rowName, owner, creation, modified, modified_by, parent, parentfield, parenttype, docstatus, idx, ...rest } = row;
  return rest;
}

export function LandedCostVoucherFormPage() {
  const { name } = useParams<{ name?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !name || name === "new";
  const { hasRole } = useAuth();
  const canWrite = hasRole();
  const { company } = useCompanyContext();

  // A "Create Landed Cost Voucher" action on a Purchase Receipt/Invoice routes
  // here with an unsaved, server-mapped document (items already fetched) in
  // router state — see PurchaseReceiptDetailPage / PurchaseInvoiceDetailPage.
  const prefill = (location.state as { prefill?: Partial<LandedCostVoucher> } | null)?.prefill;

  const { data: doc, error: docError, isLoading: docLoading, mutate } = useLandedCostVoucher(
    isNew ? undefined : name,
  );
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useLandedCostVoucherMutations();

  const [values, setValues] = useState<Partial<LandedCostVoucher>>({});
  const [voucherRows, setVoucherRows] = useState<ChildRow[]>([]);
  const [itemRows, setItemRows] = useState<ChildRow[]>([]);
  const [taxRows, setTaxRows] = useState<ChildRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingItems, setRefreshingItems] = useState(false);

  useEffect(() => {
    document.title = name && !isNew ? `Landed Cost Voucher — ${name}` : "Landed Cost Voucher";
  }, [name, isNew]);

  useEffect(() => {
    if (doc) {
      setValues(doc);
      setVoucherRows(withUuid(doc.purchase_receipts ?? []));
      setItemRows(withUuid(doc.items ?? []));
      setTaxRows(withUuid(doc.taxes ?? []));
    } else if (!docLoading && isNew) {
      if (prefill) {
        setValues(prefill);
        setVoucherRows(withUuid(prefill.purchase_receipts ?? []));
        setItemRows(withUuid(prefill.items ?? []));
        setTaxRows(withUuid(prefill.taxes ?? []));
      } else {
        setValues({
          naming_series: "MAT-LCV-.YYYY.-",
          posting_date: todayISO(),
          distribute_charges_based_on: "Qty",
          company: company || undefined,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, docLoading, isNew, company]);

  const onChange = (fieldname: string, value: any) => {
    setValues((v) => ({ ...v, [fieldname]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[fieldname];
      return next;
    });
  };

  const manualDistribution = values.distribute_charges_based_on === "Distribute Manually";

  // --- Voucher rows (which submitted Purchase Receipt/Invoice this applies to) ---

  const addVoucherRow = () =>
    setVoucherRows((prev) => [
      ...prev,
      { receipt_document_type: "Purchase Receipt", receipt_document: "", __uuid: crypto.randomUUID() },
    ]);

  const removeVoucherRow = (index: number) => setVoucherRows((prev) => prev.filter((_, i) => i !== index));

  const handleVoucherChange = (index: number, fieldname: string, value: any) => {
    setVoucherRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, [fieldname]: value };
        // Changing the document type invalidates any previously-picked document.
        if (fieldname === "receipt_document_type") {
          next.receipt_document = "";
          next.supplier = undefined;
          next.posting_date = undefined;
          next.grand_total = undefined;
        }
        return next;
      }),
    );
  };

  const handleVoucherDocumentChange = async (index: number, value: string) => {
    setVoucherRows((prev) => prev.map((r, i) => (i === index ? { ...r, receipt_document: value } : r)));
    if (!value) return;
    const docType = (voucherRows[index]?.receipt_document_type as LandedCostReceiptDocType) || "Purchase Receipt";
    try {
      const source = await getDocument<Record<string, any>>(docType, value);
      setVoucherRows((prev) =>
        prev.map((r, i) =>
          i === index
            ? {
                ...r,
                receipt_document: value,
                supplier: source.supplier,
                posting_date: source.posting_date,
                grand_total: source.base_grand_total ?? source.grand_total,
              }
            : r,
        ),
      );
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  // --- Item rows (read-only display; server-managed) ---

  const handleItemChange = (index: number, fieldname: string, value: any) => {
    // Only `applicable_charges` is ever editable, and only in Distribute
    // Manually mode — see the computed item columns below.
    if (fieldname !== "applicable_charges") return;
    setItemRows((prev) => prev.map((r, i) => (i === index ? { ...r, applicable_charges: value } : r)));
  };

  const itemColumns = useMemo(
    () =>
      LANDED_COST_ITEM_COLUMNS.map((c) =>
        c.fieldname === "applicable_charges" ? { ...c, read_only: !manualDistribution } : c,
      ),
    [manualDistribution],
  );

  // --- Tax / charges rows ---

  const addTaxRow = () =>
    setTaxRows((prev) => [...prev, { description: "", amount: 0, __uuid: crypto.randomUUID() }]);
  const removeTaxRow = (index: number) => setTaxRows((prev) => prev.filter((_, i) => i !== index));
  const handleTaxChange = (index: number, fieldname: string, value: any) =>
    setTaxRows((prev) => prev.map((r, i) => (i === index ? { ...r, [fieldname]: value } : r)));

  const totals = useMemo(() => {
    const totalTaxes = taxRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalQty = itemRows.reduce((s, r) => s + Number(r.qty || 0), 0);
    return { totalTaxes, totalQty };
  }, [taxRows, itemRows]);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!values.company) next["company"] = "Company is required";
    if (!values.posting_date) next["posting_date"] = "Posting Date is required";
    if (!values.distribute_charges_based_on) next["distribute_charges_based_on"] = "Required";
    if (voucherRows.length === 0) next["purchase_receipts"] = "Add at least one Purchase Receipt/Invoice";
    voucherRows.forEach((row, i) => {
      if (!row.receipt_document) next[`voucher_${i}`] = `Row ${i + 1}: Document is required`;
    });
    if (taxRows.length === 0) next["taxes"] = "Add at least one landed cost charge";
    taxRows.forEach((row, i) => {
      if (!row.description) next[`tax_desc_${i}`] = `Row ${i + 1}: Description is required`;
      if (!row.expense_account) next[`tax_acct_${i}`] = `Row ${i + 1}: Expense Account is required`;
      if (!row.amount || Number(row.amount) <= 0) next[`tax_amt_${i}`] = `Row ${i + 1}: Amount must be > 0`;
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [values, voucherRows, taxRows]);

  const buildPayload = useCallback((): Record<string, unknown> => {
    return {
      doctype: "Landed Cost Voucher",
      naming_series: values.naming_series || "MAT-LCV-.YYYY.-",
      company: values.company,
      posting_date: values.posting_date || todayISO(),
      distribute_charges_based_on: values.distribute_charges_based_on || "Qty",
      purchase_receipts: voucherRows.map((r, i) => ({
        doctype: "Landed Cost Purchase Receipt",
        ...cleanRow(r),
        idx: i + 1,
      })),
      // Passed through as-is (not reset to []): a fresh, never-yet-saved
      // voucher has no items yet, so the server auto-populates them from
      // `purchase_receipts` on first insert. On every later save we send back
      // whatever is currently on screen so a manual "Distribute Manually"
      // allocation survives — use "Refresh Items" to re-pull from the vouchers.
      items: itemRows.map((r, i) => ({ doctype: "Landed Cost Item", ...cleanRow(r), idx: i + 1 })),
      taxes: taxRows.map((r, i) => ({ doctype: "Landed Cost Taxes and Charges", ...cleanRow(r), idx: i + 1 })),
    };
  }, [values, voucherRows, itemRows, taxRows]);

  const persist = useCallback(async () => {
    if (!validate()) {
      toast.error("Please fix the highlighted required fields");
      return;
    }
    if (!canWrite) {
      toast.error("You do not have permission to save Landed Cost Vouchers");
      return;
    }

    const payload = buildPayload();
    try {
      if (isNew) {
        const created = await createDoc(payload as Partial<LandedCostVoucher>);
        toast.success(`Landed Cost Voucher ${created.name ?? ""} created`);
        notifyDataChanged();
        if (created?.name) {
          navigate(`/purchase/landed-costs/${encodeURIComponent(created.name)}`);
        } else {
          navigate("/purchase/landed-costs");
        }
      } else {
        const updated = await updateDoc(name!, payload as Partial<LandedCostVoucher>);
        setValues(updated);
        setVoucherRows(withUuid(updated.purchase_receipts ?? []));
        setItemRows(withUuid(updated.items ?? []));
        setTaxRows(withUuid(updated.taxes ?? []));
        toast.success("Landed Cost Voucher updated");
        notifyDataChanged();
        void mutate();
      }
    } catch (err) {
      console.error("Landed Cost Voucher save failed", err);
      toast.error(humanizeError(err));
    }
  }, [canWrite, validate, buildPayload, isNew, createDoc, updateDoc, name, mutate, navigate]);

  const refreshItems = useCallback(async () => {
    setRefreshingItems(true);
    try {
      const refreshPayload = {
        ...(!isNew && doc?.name ? { name: doc.name, modified: (doc as any).modified } : {}),
        doctype: "Landed Cost Voucher",
        company: values.company,
        posting_date: values.posting_date || todayISO(),
        distribute_charges_based_on: values.distribute_charges_based_on || "Qty",
        purchase_receipts: voucherRows.map((r, i) => ({ doctype: "Landed Cost Purchase Receipt", ...cleanRow(r), idx: i + 1 })),
        items: [],
        taxes: taxRows.map((r, i) => ({ doctype: "Landed Cost Taxes and Charges", ...cleanRow(r), idx: i + 1 })),
      };
      const refreshed = await refreshLandedCostItems(refreshPayload);
      setItemRows(withUuid(refreshed.items ?? []));
      toast.success(`Fetched ${refreshed.items?.length ?? 0} item(s) from the linked vouchers`);
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setRefreshingItems(false);
    }
  }, [isNew, doc, values, voucherRows, taxRows]);

  const submitDoc = useCallback(async () => {
    if (!doc?.name || doc.docstatus !== 0) return;
    setSubmitting(true);
    try {
      if (canWrite) {
        await updateDoc(doc.name, buildPayload());
      }
      const full = await postCall<LandedCostVoucher>("frappe.client.get", {
        doctype: "Landed Cost Voucher",
        name: doc.name,
      });
      await postCall("frappe.client.submit", { doc: full });
      toast.success("Landed Cost Voucher submitted — item valuation and GL entries have been updated");
      notifyDataChanged();
      void mutate();
      setConfirmSubmit(false);
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setSubmitting(false);
    }
  }, [doc, canWrite, updateDoc, buildPayload, mutate]);

  const handleDelete = useCallback(async () => {
    if (!doc?.name) return;
    try {
      await deleteDoc(doc.name);
      toast.success("Deleted");
      notifyDataChanged();
      navigate("/purchase/landed-costs");
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setConfirmDelete(false);
    }
  }, [doc?.name, deleteDoc, navigate]);

  const readOnly = !canWrite || (doc?.docstatus !== undefined && doc.docstatus > 0);

  if (!isNew && docLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-72 w-full animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (docError) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">{humanizeError(docError)}</p>
        <Button className="mt-3" onClick={() => void mutate()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Landed Cost Voucher"
        subtitle={isNew ? "New Landed Cost Voucher" : name}
        icon={<Coins className="h-5 w-5" />}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => (isNew ? navigate("/purchase/landed-costs") : navigate(-1))}
              disabled={saving || submitting}
            >
              Cancel
            </Button>
            {!isNew && doc?.docstatus === 0 && (
              <Button variant="outline" onClick={() => setConfirmDelete(true)} disabled={saving || !canWrite}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            <Button onClick={() => void persist()} disabled={saving || readOnly || submitting}>
              <Save className="h-4 w-4" />
              {isNew ? "Save" : "Update"}
            </Button>
            {!isNew && doc?.docstatus === 0 && (
              <Button variant="default" onClick={() => setConfirmSubmit(true)} disabled={saving || !canWrite || submitting}>
                <Send className="h-4 w-4" />
                Submit
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge
            status={doc?.docstatus === 1 ? "Submitted" : doc?.docstatus === 2 ? "Cancelled" : "Draft"}
          />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Distribute Based On</p>
          <p className="font-medium">{values.distribute_charges_based_on || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Landed Cost</p>
          <p className="font-bold">{formatMoney(values.total_taxes_and_charges ?? totals.totalTaxes)}</p>
        </Card>
      </div>

      <FrappeForm
        fields={LANDED_COST_VOUCHER_FIELDS}
        values={values}
        errors={errors}
        readOnly={readOnly}
        onChange={onChange}
      />

      {errors.purchase_receipts && <p className="text-sm text-destructive">{errors.purchase_receipts}</p>}
      <SectionCard
        title="Vouchers"
        description="Submitted Purchase Receipt(s) or stock-updating Purchase Invoice(s) this cost applies to"
        actions={
          !readOnly ? (
            <Button size="sm" variant="outline" onClick={addVoucherRow}>
              + Add Row
            </Button>
          ) : undefined
        }
      >
        <EditableChildTable
          columns={LANDED_COST_RECEIPT_COLUMNS}
          rows={voucherRows}
          onChange={handleVoucherChange}
          onRemoveRow={readOnly ? undefined : removeVoucherRow}
          readOnly={readOnly}
          renderCell={(row, col) => {
            if (col.fieldname !== "receipt_document") return undefined;
            const index = voucherRows.indexOf(row);
            return (
              <FrappeLinkField
                meta={{ ...col, options: (row.receipt_document_type as string) || "Purchase Receipt" }}
                value={(row.receipt_document as string) ?? ""}
                onChange={(v) => void handleVoucherDocumentChange(index, v)}
                disabled={readOnly}
              />
            );
          }}
        />
      </SectionCard>

      <SectionCard
        title="Receipt Items"
        description="Populated automatically from the vouchers above"
        actions={
          !readOnly ? (
            <Button size="sm" variant="outline" onClick={() => void refreshItems()} disabled={refreshingItems}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh Items
            </Button>
          ) : undefined
        }
      >
        <EditableChildTable
          columns={itemColumns}
          rows={itemRows}
          onChange={handleItemChange}
          readOnly={readOnly}
          emptyMessage='No items yet — add a voucher row above and Save (or click "Refresh Items").'
        />
        <div className="mt-2 text-right text-sm text-muted-foreground">Total Qty: {totals.totalQty}</div>
      </SectionCard>

      {errors.taxes && <p className="text-sm text-destructive">{errors.taxes}</p>}
      <SectionCard
        title="Landed Cost (Charges)"
        description="Freight, customs duty, insurance and other charges to allocate across the items above"
        actions={
          !readOnly ? (
            <Button size="sm" variant="outline" onClick={addTaxRow}>
              + Add Row
            </Button>
          ) : undefined
        }
      >
        <EditableChildTable
          columns={LANDED_COST_TAXES_COLUMNS}
          rows={taxRows}
          onChange={handleTaxChange}
          onRemoveRow={readOnly ? undefined : removeTaxRow}
          readOnly={readOnly}
          totals={[{ label: "Total Landed Cost", value: formatMoney(totals.totalTaxes), align: "right" }]}
        />
      </SectionCard>

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        title="Submit Landed Cost Voucher"
        description="Submit this Landed Cost Voucher? This updates item valuation rates and posts GL entries on the linked Purchase Receipt(s)/Invoice(s) — it can then only be cancelled/amended."
        confirmLabel="Submit"
        loading={submitting}
        onConfirm={() => void submitDoc()}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${doc?.name}?`}
        description="This permanently removes the draft Landed Cost Voucher."
        confirmLabel="Delete"
        destructive
        loading={saving}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
