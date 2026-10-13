import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ChevronDown, CircleDot, Copy, ExternalLink, FilePlus2, Link as LinkIcon, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { deskUrl, docUrl } from "@/app/doc-routes";
import { PrintDialog } from "./print-dialog";
import { humanizeError, postCall } from "@/services/frappe";
import { notifyDataChanged } from "@/hooks/useRealtime";

interface DocInfo { name: string; docstatus?: number; status?: string; [k: string]: unknown }
/** A next document made from this one with a whitelisted ERPNext mapper, saved as a draft. */
export interface MakeSpec {
  label: string;
  method: string;
  /** Default: submitted documents. */
  show?: (d: DocInfo) => boolean;
  /** Arguments other than `source_name` (e.g. get_payment_entry's dt / dn). */
  args?: (d: DocInfo, doctype: string) => Record<string, unknown>;
}

const sub = (d: DocInfo) => d.docstatus === 1;
const pay = (d: DocInfo, dt: string) => ({ dt, dn: d.name });
const S = "erpnext.selling.doctype.sales_order.sales_order";
const DN = "erpnext.stock.doctype.delivery_note.delivery_note";
const SI = "erpnext.accounts.doctype.sales_invoice.sales_invoice";
const MR = "erpnext.stock.doctype.material_request.material_request";
const PO = "erpnext.buying.doctype.purchase_order.purchase_order";
const PR = "erpnext.stock.doctype.purchase_receipt.purchase_receipt";
const PI = "erpnext.accounts.doctype.purchase_invoice.purchase_invoice";
const PE = "erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry";

/** The desk's "Create" menus, per DocType. */
export const DOC_MAKES: Record<string, MakeSpec[]> = {
  Quotation: [
    { label: "Sales Order", method: "erpnext.selling.doctype.quotation.quotation.make_sales_order", show: (d) => sub(d) && !["Ordered", "Lost", "Expired"].includes(String(d.status)) },
  ],
  "Blanket Order": [
    { label: "Order (call-off)", method: "erpnext.manufacturing.doctype.blanket_order.blanket_order.make_order" },
  ],
  "Sales Order": [
    { label: "Delivery Note", method: `${S}.make_delivery_note`, show: (d) => sub(d) && !["Completed", "Closed", "To Bill"].includes(String(d.status)) },
    { label: "Sales Invoice", method: `${S}.make_sales_invoice`, show: (d) => sub(d) && !["Completed", "Closed", "To Deliver"].includes(String(d.status)) },
    { label: "Material Request", method: `${S}.make_material_request` },
    { label: "Payment (advance)", method: PE, args: pay },
  ],
  "Delivery Note": [
    { label: "Sales Invoice", method: `${DN}.make_sales_invoice`, show: (d) => sub(d) && d.status !== "Completed" },
    { label: "Sales Return", method: `${DN}.make_sales_return`, show: (d) => sub(d) && !d.is_return },
  ],
  "Sales Invoice": [
    { label: "Payment Entry", method: PE, args: pay, show: (d) => sub(d) && Number(d.outstanding_amount ?? 0) > 0 },
    { label: "Credit Note (return)", method: `${SI}.make_sales_return`, show: (d) => sub(d) && !d.is_return },
    { label: "Delivery Note", method: `${SI}.make_delivery_note`, show: (d) => sub(d) && !d.update_stock },
  ],
  "Material Request": [
    { label: "Purchase Order", method: `${MR}.make_purchase_order`, show: (d) => sub(d) && d.material_request_type === "Purchase" },
    { label: "Request for Quotation", method: `${MR}.make_request_for_quotation`, show: (d) => sub(d) && d.material_request_type === "Purchase" },
    { label: "Stock Entry (transfer / issue)", method: `${MR}.make_stock_entry`, show: (d) => sub(d) && d.material_request_type !== "Purchase" },
  ],
  "Request for Quotation": [
    { label: "Supplier Quotation", method: "erpnext.buying.doctype.request_for_quotation.request_for_quotation.make_supplier_quotation_from_rfq" },
  ],
  "Purchase Order": [
    { label: "Purchase Receipt", method: `${PO}.make_purchase_receipt`, show: (d) => sub(d) && Number(d.per_received ?? 0) < 100 },
    { label: "Purchase Invoice", method: `${PO}.make_purchase_invoice`, show: (d) => sub(d) && Number(d.per_billed ?? 0) < 100 },
    { label: "Subcontracting Order", method: `${PO}.make_subcontracting_order`, show: (d) => sub(d) && Boolean(d.is_subcontracted) },
    { label: "Payment (advance)", method: PE, args: pay },
  ],
  "Purchase Receipt": [
    { label: "Purchase Invoice", method: `${PR}.make_purchase_invoice`, show: (d) => sub(d) && Number(d.per_billed ?? 0) < 100 },
    { label: "Purchase Return", method: `${PR}.make_purchase_return`, show: (d) => sub(d) && !d.is_return },
  ],
  "Purchase Invoice": [
    { label: "Payment Entry", method: PE, args: pay, show: (d) => sub(d) && Number(d.outstanding_amount ?? 0) > 0 },
    { label: "Debit Note (return)", method: `${PI}.make_debit_note`, show: (d) => sub(d) && !d.is_return },
  ],
  "Stock Entry": [
    { label: "Receive at destination", method: "erpnext.stock.doctype.stock_entry.stock_entry.make_stock_in_entry", show: (d) => sub(d) && Boolean(d.add_to_transit) },
  ],
};

/** A desk "Status" action (Close / Hold / Stop / Re-open) — calls the doctype's whitelisted status method, then reloads. */
export interface StatusSpec {
  label: string;
  method: string;
  args: (d: DocInfo) => Record<string, unknown>;
  show: (d: DocInfo) => boolean;
  /** Asked before running. */
  confirm: string;
}

const pct = (d: DocInfo, f: string) => Number(d[f] ?? 0);
const st = (d: DocInfo) => String(d.status ?? "");
const WO = "erpnext.manufacturing.doctype.work_order.work_order";
const CLOSE_NOTE = "Remaining quantity will no longer be expected. Delivered/billed documents are not changed. You can re-open it later.";

/** Same buttons and conditions as the desk forms (ERPNext v16). The server checks permission (submit / write). */
export const DOC_STATUS_ACTIONS: Record<string, StatusSpec[]> = {
  "Sales Order": [
    { label: "Hold", method: `${S}.update_status`, args: (d) => ({ name: d.name, status: "On Hold" }), confirm: "Put this sales order on hold? No deliveries or invoices can be made until it is resumed.",
      show: (d) => sub(d) && !["Closed", "On Hold", "Completed"].includes(st(d)) && (pct(d, "per_delivered") < 100 || pct(d, "per_billed") < 100) },
    { label: "Resume", method: `${S}.update_status`, args: (d) => ({ name: d.name, status: "Draft" }), confirm: "Resume this sales order?", show: (d) => sub(d) && st(d) === "On Hold" },
    { label: "Close", method: `${S}.update_status`, args: (d) => ({ name: d.name, status: "Closed" }), confirm: `Close this sales order? ${CLOSE_NOTE}`,
      show: (d) => sub(d) && !["Closed", "Completed"].includes(st(d)) && (pct(d, "per_delivered") < 100 || pct(d, "per_billed") < 100) },
    { label: "Re-open", method: `${S}.update_status`, args: (d) => ({ name: d.name, status: "Draft" }), confirm: "Re-open this sales order?", show: (d) => sub(d) && st(d) === "Closed" },
  ],
  "Purchase Order": [
    { label: "Hold", method: `${PO}.update_status`, args: (d) => ({ name: d.name, status: "On Hold" }), confirm: "Put this purchase order on hold? No receipts or invoices can be made until it is resumed.",
      show: (d) => sub(d) && !["Closed", "Delivered", "On Hold", "Completed"].includes(st(d)) && (pct(d, "per_received") < 100 || pct(d, "per_billed") < 100) },
    { label: "Resume", method: `${PO}.update_status`, args: (d) => ({ name: d.name, status: "Draft" }), confirm: "Resume this purchase order?", show: (d) => sub(d) && st(d) === "On Hold" },
    { label: "Close", method: `${PO}.update_status`, args: (d) => ({ name: d.name, status: "Closed" }), confirm: `Close this purchase order? ${CLOSE_NOTE}`,
      show: (d) => sub(d) && !["Closed", "Delivered", "Completed"].includes(st(d)) && (pct(d, "per_received") < 100 || pct(d, "per_billed") < 100) },
    { label: "Re-open", method: `${PO}.update_status`, args: (d) => ({ name: d.name, status: "Submitted" }), confirm: "Re-open this purchase order?", show: (d) => sub(d) && ["Closed", "Delivered"].includes(st(d)) },
  ],
  "Delivery Note": [
    { label: "Close", method: `${DN}.update_delivery_note_status`, args: (d) => ({ docname: d.name, status: "Closed" }), confirm: "Close this delivery note? It will no longer be expected to be billed.",
      show: (d) => sub(d) && !d.is_return && !["Closed", "Completed"].includes(st(d)) },
    { label: "Re-open", method: `${DN}.update_delivery_note_status`, args: (d) => ({ docname: d.name, status: "Submitted" }), confirm: "Re-open this delivery note?", show: (d) => sub(d) && st(d) === "Closed" },
  ],
  "Purchase Receipt": [
    { label: "Close", method: `${PR}.update_purchase_receipt_status`, args: (d) => ({ docname: d.name, status: "Closed" }), confirm: "Close this purchase receipt? It will no longer be expected to be billed.",
      show: (d) => sub(d) && !d.is_return && !["Closed", "Completed"].includes(st(d)) },
    { label: "Re-open", method: `${PR}.update_purchase_receipt_status`, args: (d) => ({ docname: d.name, status: "Submitted" }), confirm: "Re-open this purchase receipt?", show: (d) => sub(d) && st(d) === "Closed" },
  ],
  "Material Request": [
    { label: "Stop", method: `${MR}.update_status`, args: (d) => ({ name: d.name, status: "Stopped" }), confirm: "Stop this material request? Nothing more will be ordered against it.",
      show: (d) => sub(d) && st(d) !== "Stopped" && pct(d, "per_received") < 100 },
    { label: "Re-open", method: `${MR}.update_status`, args: (d) => ({ name: d.name, status: "Submitted" }), confirm: "Re-open this material request?", show: (d) => sub(d) && st(d) === "Stopped" },
  ],
  "Work Order": [
    { label: "Stop", method: `${WO}.stop_unstop`, args: (d) => ({ work_order: d.name, status: "Stopped" }), confirm: "Stop this work order?",
      show: (d) => sub(d) && !["Stopped", "Completed", "Closed"].includes(st(d)) },
    { label: "Re-open", method: `${WO}.stop_unstop`, args: (d) => ({ work_order: d.name, status: "Resumed" }), confirm: "Resume this work order?", show: (d) => sub(d) && st(d) === "Stopped" },
    { label: "Close", method: `${WO}.close_work_order`, args: (d) => ({ work_order: d.name, status: "Closed" }), confirm: "Close this work order? Once closed it can't be resumed.",
      show: (d) => sub(d) && !["Closed", "Completed"].includes(st(d)) },
  ],
};

/** Runs a status action after confirming; returns true when it changed the document. */
export async function runStatusAction(a: StatusSpec, doc: DocInfo): Promise<boolean> {
  if (!window.confirm(a.confirm)) return false;
  try {
    await postCall(a.method, a.args(doc));
    toast.success(`${doc.name}: ${a.label} done`);
    notifyDataChanged();
    return true;
  } catch (e) {
    toast.error(humanizeError(e));
    return false;
  }
}

/** Actions menu for hand-built detail pages: "Create →" next documents plus refresh, duplicate, print, desk, link. */
export function DocActionsMenu({ doctype, doc, onChanged, canDuplicate = true }: { doctype: string; doc?: DocInfo | null; onChanged?: () => void; canDuplicate?: boolean }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  if (!doc?.name) return null;
  const open = (r: { doctype: string; name: string }) => {
    const u = docUrl(r.doctype, r.name);
    if (u.external) window.open(u.href, "_blank");
    else navigate(u.href);
  };
  const run = async (label: string, fn: () => Promise<{ doctype: string; name: string }>) => {
    setBusy(true);
    try {
      const r = await fn();
      toast.success(`${label}: ${r.doctype} ${r.name} created as draft`);
      notifyDataChanged();
      open(r);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };
  const makes = (DOC_MAKES[doctype] ?? []).filter((m) => (m.show ? m.show(doc) : sub(doc)));
  const statuses = (DOC_STATUS_ACTIONS[doctype] ?? []).filter((a) => a.show(doc));
  const items: DropdownItem[] = [
    ...makes.map((m) => ({
      label: `Create ${m.label}`,
      icon: <FilePlus2 className="h-4 w-4" />,
      onClick: () => void run(m.label, () => postCall("mm_core.form_actions.make_mapped", {
        method: m.method, source_name: doc.name, args: m.args ? JSON.stringify(m.args(doc, doctype)) : undefined,
      })),
    })),
    ...(makes.length ? [{ label: "", separator: true }] : []),
    ...statuses.map((a) => ({
      label: a.label,
      icon: <CircleDot className="h-4 w-4" />,
      onClick: () => void (async () => { setBusy(true); if (await runStatusAction(a, doc)) onChanged?.(); setBusy(false); })(),
    })),
    ...(statuses.length ? [{ label: "", separator: true }] : []),
    ...(onChanged ? [{ label: "Refresh", icon: <RefreshCw className="h-4 w-4" />, onClick: onChanged }] : []),
    ...(canDuplicate ? [{ label: "Duplicate", icon: <Copy className="h-4 w-4" />, onClick: () => void run("Duplicate", () => postCall("mm_core.form_actions.duplicate", { doctype, name: doc.name })) }] : []),
    { label: "Print…", icon: <Printer className="h-4 w-4" />, onClick: () => setPrinting(true) },
    { label: "Open in ERPNext desk", icon: <ExternalLink className="h-4 w-4" />, onClick: () => window.open(deskUrl(doctype, doc.name), "_blank") },
    { label: "Copy link", icon: <LinkIcon className="h-4 w-4" />, onClick: () => void navigator.clipboard?.writeText(window.location.href).then(() => toast.success("Link copied")) },
  ];
  return (
    <>
      <DropdownMenu
        width="w-64"
        items={items}
        trigger={
          <Button size="sm" variant="outline" disabled={busy}>
            Actions <ChevronDown className="h-4 w-4" />
          </Button>
        }
      />
      <PrintDialog doctype={doctype} name={doc.name} open={printing} onClose={() => setPrinting(false)} />
    </>
  );
}
