import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeftRight, Save, Send, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { FrappeForm } from "@/components/forms/frappe-form";
import { EditableChildTable, type ChildRow } from "@/components/tables/child-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionCard } from "@/components/common/section-card";
import { STOCK_ENTRY_FIELDS, STOCK_ENTRY_ITEM_COLUMNS } from "@/components/forms/form-configs";
import { useStockEntry, useStockEntryMutations } from "@/hooks/useStockEntries";
import { useItems } from "@/hooks/useItems";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { formatMoney } from "@/utils/currency";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError, postCall } from "@/services/frappe";
import { todayISO } from "@/utils/dates";
import type { StockEntry, StockEntryItem } from "@/types/frappe";

function lineAmount(row: Pick<StockEntryItem, "qty" | "basic_rate">): number {
  return Number(row.qty || 0) * Number(row.basic_rate || 0);
}

/** Whether a purpose needs the source / target warehouse on the header (and each row). */
function warehouseRequirement(purpose?: string): { needsFrom: boolean; needsTo: boolean } {
  if (purpose === "Material Receipt") return { needsFrom: false, needsTo: true };
  if (purpose === "Material Issue") return { needsFrom: true, needsTo: false };
  return { needsFrom: true, needsTo: true }; // Material Transfer
}

export function StockEntryFormPage() {
  const { name } = useParams<{ name?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !name || name === "new";
  const { hasRole } = useAuth();
  const canWrite = hasRole();
  const { company } = useCompanyContext();

  // A "Create Stock Entry" action on a Material Request routes here with an
  // unsaved, server-mapped document in router state (see MaterialRequestDetailPage).
  const prefill = (location.state as { prefill?: Partial<StockEntry> } | null)?.prefill;

  const { data: doc, error: docError, isLoading: docLoading, mutate } = useStockEntry(isNew ? undefined : name);
  const { createDoc, updateDoc, deleteDoc, loading: saving } = useStockEntryMutations();
  const { data: items } = useItems({ enabled: true });

  const itemLookup = useMemo(() => {
    const m = new Map<string, { item_name: string; stock_uom?: string; standard_rate?: number }>();
    (items ?? []).forEach((it) =>
      m.set(it.name, { item_name: it.item_name ?? it.name, stock_uom: it.stock_uom, standard_rate: it.standard_rate }),
    );
    return m;
  }, [items]);

  const [values, setValues] = useState<Partial<StockEntry>>({});
  const [itemRows, setItemRows] = useState<ChildRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = name && !isNew ? `Stock Entry — ${name}` : "Stock Entry";
  }, [name, isNew]);

  useEffect(() => {
    if (doc) {
      setValues(doc);
      setItemRows((doc.items ?? []).map((r) => ({ ...r, __uuid: crypto.randomUUID() })));
    } else if (!docLoading && isNew) {
      if (prefill) {
        setValues(prefill);
        setItemRows((prefill.items ?? []).map((r) => ({ ...r, __uuid: crypto.randomUUID() })));
      } else {
        setValues({
          naming_series: "MAT-STE-.YYYY.-",
          purpose: "Material Transfer",
          posting_date: todayISO(),
          company: company || undefined,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, docLoading, isNew, company]);

  const { needsFrom, needsTo } = warehouseRequirement(values.purpose);

  const onChange = (fieldname: string, value: any) => {
    setValues((v) => {
      const next = { ...v, [fieldname]: value };
      if (fieldname === "purpose") {
        const req = warehouseRequirement(value);
        if (!req.needsFrom) next.from_warehouse = undefined;
        if (!req.needsTo) next.to_warehouse = undefined;
      }
      return next;
    });
    setErrors((e) => {
      const next = { ...e };
      delete next[fieldname];
      return next;
    });
    // Header warehouse changes propagate to rows that haven't been overridden individually —
    // simplest correct behavior for this app's single-header-warehouse-pair scope.
    if (fieldname === "from_warehouse") {
      setItemRows((prev) => prev.map((r) => ({ ...r, s_warehouse: value || undefined })));
    }
    if (fieldname === "to_warehouse") {
      setItemRows((prev) => prev.map((r) => ({ ...r, t_warehouse: value || undefined })));
    }
  };

  const handleItemChange = (index: number, fieldname: string, value: any) => {
    setItemRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, [fieldname]: value };
        if (fieldname === "qty" || fieldname === "basic_rate") {
          next.basic_amount = lineAmount(next as Pick<StockEntryItem, "qty" | "basic_rate">);
        }
        return next;
      }),
    );
  };

  const handleLinkChange = (index: number, fieldname: string, value: string) => {
    if (fieldname === "item_code") {
      const meta = itemLookup.get(value);
      setItemRows((prev) =>
        prev.map((r, i) => {
          if (i !== index) return r;
          const uom = meta?.stock_uom || r.uom || "Nos";
          const next: ChildRow = {
            ...r,
            item_code: value,
            item_name: meta?.item_name ?? value,
            stock_uom: uom,
            uom,
            conversion_factor: 1,
            basic_rate: r.basic_rate || meta?.standard_rate || 0,
            qty: r.qty || 1,
          };
          next.basic_amount = lineAmount({ qty: Number(next.qty || 0), basic_rate: Number(next.basic_rate || 0) });
          return next;
        }),
      );
    }
  };

  const addItemRow = () =>
    setItemRows((prev) => [
      ...prev,
      {
        item_code: "",
        item_name: "",
        qty: 1,
        basic_rate: 0,
        basic_amount: 0,
        uom: "Nos",
        stock_uom: "Nos",
        conversion_factor: 1,
        s_warehouse: needsFrom ? values.from_warehouse : undefined,
        t_warehouse: needsTo ? values.to_warehouse : undefined,
        __uuid: crypto.randomUUID(),
      },
    ]);

  const removeItemRow = (index: number) => setItemRows((prev) => prev.filter((_, i) => i !== index));
  const duplicateItemRow = (index: number) =>
    setItemRows((prev) => [...prev.slice(0, index + 1), { ...prev[index], __uuid: crypto.randomUUID(), name: undefined }, ...prev.slice(index + 1)]);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!values.company) next.company = "Company is required";
    if (!values.posting_date) next.posting_date = "Posting Date is required";
    if (!values.purpose) next.purpose = "Purpose is required";
    if (needsFrom && !values.from_warehouse) next.from_warehouse = "Source Warehouse is required for this purpose";
    if (needsTo && !values.to_warehouse) next.to_warehouse = "Target Warehouse is required for this purpose";
    if (itemRows.length === 0) next["items"] = "Add at least one line item";
    itemRows.forEach((row, i) => {
      if (!row.item_code) next[`item_${i}`] = `Row ${i + 1}: Item is required`;
      if (!row.qty || Number(row.qty) <= 0) next[`qty_${i}`] = `Row ${i + 1}: Qty must be > 0`;
      if (needsFrom && !row.s_warehouse) next[`s_warehouse_${i}`] = `Row ${i + 1}: Source Warehouse is required`;
      if (needsTo && !row.t_warehouse) next[`t_warehouse_${i}`] = `Row ${i + 1}: Target Warehouse is required`;
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [values, itemRows, needsFrom, needsTo]);

  const totals = useMemo(() => {
    const quantity = itemRows.reduce((s, r) => s + Number(r.qty || 0), 0);
    const amount = itemRows.reduce((s, r) => s + Number(r.basic_amount ?? lineAmount(r as any)), 0);
    return { quantity, amount };
  }, [itemRows]);

  const buildPayload = useCallback((): Record<string, unknown> => {
    const items = itemRows.map(({ __uuid, name: _rowName, owner, creation, modified, modified_by, parent, parentfield, parenttype, docstatus, idx, ...rest }, i) => {
      const qty = Number(rest.qty || 0);
      const basicRate = Number(rest.basic_rate || 0);
      const basicAmount = qty * basicRate;
      const uom = rest.uom || rest.stock_uom || "Nos";
      const stockUom = rest.stock_uom || uom;
      const itemName = rest.item_name || rest.item_code || "";
      return {
        doctype: "Stock Entry Detail",
        item_code: rest.item_code,
        item_name: itemName,
        description: rest.description || itemName,
        qty,
        uom,
        stock_uom: stockUom,
        conversion_factor: Number(rest.conversion_factor || 1) || 1,
        basic_rate: basicRate,
        basic_amount: basicAmount,
        amount: basicAmount,
        s_warehouse: needsFrom ? rest.s_warehouse || values.from_warehouse || undefined : undefined,
        t_warehouse: needsTo ? rest.t_warehouse || values.to_warehouse || undefined : undefined,
        cost_center: rest.cost_center || values.cost_center || undefined,
        material_request: rest.material_request || undefined,
        material_request_item: rest.material_request_item || undefined,
        idx: i + 1,
      };
    });

    return {
      doctype: "Stock Entry",
      naming_series: values.naming_series || "MAT-STE-.YYYY.-",
      purpose: values.purpose || "Material Transfer",
      stock_entry_type: values.purpose || "Material Transfer",
      company: values.company,
      posting_date: values.posting_date || todayISO(),
      // See erpnext.utilities.transaction_base.TransactionBase.validate_posting_time —
      // without this, ERPNext silently forces posting_date/time to right now.
      set_posting_time: 1,
      from_warehouse: needsFrom ? values.from_warehouse : undefined,
      to_warehouse: needsTo ? values.to_warehouse : undefined,
      cost_center: values.cost_center || undefined,
      remarks: values.remarks || undefined,
      items,
    };
  }, [values, itemRows, needsFrom, needsTo]);

  const persist = useCallback(async () => {
    if (!validate()) {
      toast.error("Please fix the highlighted required fields");
      return;
    }
    if (!canWrite) {
      toast.error("You do not have permission to save Stock Entries");
      return;
    }
    const payload = buildPayload();
    try {
      if (isNew) {
        const created = await createDoc(payload as Partial<StockEntry>);
        toast.success(`Stock Entry ${created.name ?? ""} created`);
        notifyDataChanged();
        navigate(created?.name ? `/inventory/stock-entries/${encodeURIComponent(created.name)}` : "/inventory/stock-entries");
      } else {
        const updated = await updateDoc(name!, payload as Partial<StockEntry>);
        setValues(updated);
        setItemRows((updated.items ?? []).map((r) => ({ ...r, __uuid: crypto.randomUUID() })));
        toast.success("Stock Entry updated");
        notifyDataChanged();
        void mutate();
      }
    } catch (err) {
      console.error("Stock Entry save failed", err);
      toast.error(humanizeError(err));
    }
  }, [canWrite, validate, buildPayload, isNew, createDoc, updateDoc, name, mutate, navigate]);

  const submitDoc = useCallback(async () => {
    if (!doc?.name || doc.docstatus !== 0) return;
    setSubmitting(true);
    try {
      if (canWrite) await updateDoc(doc.name, buildPayload());
      const full = await postCall<StockEntry>("frappe.client.get", { doctype: "Stock Entry", name: doc.name });
      await postCall("frappe.client.submit", { doc: full });
      toast.success("Stock Entry submitted");
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
    if (!name) return;
    try {
      await deleteDoc(name);
      toast.success("Stock Entry deleted");
      notifyDataChanged();
      navigate("/inventory/stock-entries");
    } catch (err) {
      toast.error(humanizeError(err));
      setConfirmDelete(false);
    }
  }, [name, deleteDoc, navigate]);

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
        title="Stock Entry"
        subtitle={isNew ? "New Stock Entry" : name}
        icon={<ArrowLeftRight className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" onClick={() => (isNew ? navigate("/inventory/stock-entries") : navigate(-1))} disabled={saving || submitting}>
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <StatusBadge status={doc?.docstatus === 1 ? "Submitted" : doc?.docstatus === 2 ? "Cancelled" : "Draft"} />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Purpose</p>
          <p className="font-medium">{values.purpose || "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Warehouses</p>
          <p className="truncate font-medium">
            {values.from_warehouse || "—"} {(needsFrom && needsTo) ? "→" : ""} {needsTo ? values.to_warehouse || "—" : ""}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Value</p>
          <p className="font-bold">{formatMoney(totals.amount)}</p>
        </Card>
      </div>

      {errors.items && <p className="text-sm text-destructive">{errors.items}</p>}

      <FrappeForm fields={STOCK_ENTRY_FIELDS} values={values} errors={errors} readOnly={readOnly} onChange={onChange} />

      <SectionCard title="Items" actions={!readOnly ? <Button size="sm" variant="outline" onClick={addItemRow}>+ Add Row</Button> : undefined}>
        <EditableChildTable
          columns={STOCK_ENTRY_ITEM_COLUMNS}
          rows={itemRows}
          onChange={handleItemChange}
          onLinkChange={handleLinkChange}
          onRemoveRow={readOnly ? undefined : removeItemRow}
          onDuplicateRow={readOnly ? undefined : duplicateItemRow}
          readOnly={readOnly}
        />
      </SectionCard>

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <div>
            <span className="text-muted-foreground">Total Quantity</span>
            <span className="float-right font-medium">{totals.quantity}</span>
          </div>
          <div className="col-span-2">
            <div className="flex justify-between border-t pt-2 md:border-0 md:pt-0">
              <span className="text-muted-foreground">Total Value</span>
              <span className="text-xl font-bold">{formatMoney(totals.amount)}</span>
            </div>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        title="Submit Stock Entry"
        description="Submit this Stock Entry? This posts real stock movement and cannot be edited afterwards (only cancelled/amended)."
        confirmLabel="Submit"
        loading={submitting}
        onConfirm={() => void submitDoc()}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${doc?.name}?`}
        description="This permanently removes the draft Stock Entry."
        confirmLabel="Delete"
        destructive
        loading={saving}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
