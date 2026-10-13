import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeGetDocCount,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import { monthKeyAndLabel } from "@/utils/dates";
import type { SalesOrder, SalesOrderItem } from "@/types/frappe";

const SALES_ORDER_FIELDS = [
  "name",
  "customer",
  "customer_name",
  "transaction_date",
  "delivery_date",
  "po_no",
  "buyer_po_no",
  "company",
  "currency",
  "grand_total",
  "total_qty",
  "per_delivered",
  "per_billed",
  "status",
  "docstatus",
  "export_status",
  "lc_proforma",
  "lc_no",
  "lc_date",
  "lc_issuing_bank",
  "lc_advising_bank",
  "lc_amount",
  "lc_currency",
  "lc_expiry_date",
  "latest_shipment_date",
  "port_of_loading",
  "port_of_discharge",
  "final_destination",
  "incoterm",
  "shipment_mode",
  "country_of_destination",
] as const;

/** List export orders (Sales Orders with Micromax fields). */
export function useSalesOrders(args?: {
  filters?: unknown[][];
  limit?: number;
  enabled?: boolean;
}) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<SalesOrder>(
    "Sales Order",
    {
      fields: SALES_ORDER_FIELDS as unknown as (keyof SalesOrder)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.so.${JSON.stringify({ filters, limit })}` : null,
  );
}

/** Single sales order (used for the Export Order detail view). */
export function useSalesOrder(name?: string) {
  return useFrappeGetDoc<SalesOrder>(
    "Sales Order",
    name ?? undefined,
    name ? `micromax.so.doc.${name}` : null,
  );
}

/** Count of sales orders matching filters. */
export function useSalesOrderCount(filters: unknown[][], enabled = true) {
  return useFrappeGetDocCount<SalesOrder>(
    "Sales Order",
    filters as any,
    false,
    enabled ? `micromax.so.count.${JSON.stringify(filters)}` : null,
  );
}

/** Create / Update / Delete mutations. */
export function useSalesOrderMutations(onSuccess?: (doc: SalesOrder) => void) {
  const create = useFrappeCreateDoc<SalesOrder>();
  const update = useFrappeUpdateDoc<SalesOrder>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: async (values: Partial<SalesOrder>) => {
      const doc = await create.createDoc("Sales Order", values as SalesOrder);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<SalesOrder>) => {
      const doc = await update.updateDoc("Sales Order", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("Sales Order", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

export interface SOProgress {
  total: number;
  produced: number;
  packed: number;
  shipped: number;
  balance: number;
  productionPct: number;
  packingPct: number;
  shipmentPct: number;
}

/** Compute order-level progress from the child item quantities. */
export function salesOrderProgress(items?: SalesOrderItem[]): SOProgress {
  const total = (items ?? []).reduce((s, i) => s + Number(i.qty || 0), 0);
  const produced = (items ?? []).reduce((s, i) => s + Number(i.produced_qty ?? i.export_quantity ?? 0), 0);
  const packed = (items ?? []).reduce((s, i) => s + Number(i.packed_qty ?? 0), 0);
  const shipped = (items ?? []).reduce((s, i) => s + Number(i.delivered_qty ?? 0), 0);
  const pct = (v: number) => (total > 0 ? Math.min(100, Math.round((v / total) * 100)) : 0);
  return {
    total,
    produced,
    packed,
    shipped,
    balance: Math.max(0, total - shipped),
    productionPct: pct(produced),
    packingPct: pct(packed),
    shipmentPct: pct(shipped),
  };
}

/** Monthly export value trend (last N months) built from SO list. */
export function monthlyExportTrend(orders: SalesOrder[] | undefined) {
  const months = new Map<string, { label: string; export: number }>();
  (orders ?? []).forEach((o) => {
    const bucket = monthKeyAndLabel(o.transaction_date);
    if (!bucket) return;
    const { key, label } = bucket;
    const entry = months.get(key) ?? { label, export: 0 };
    entry.export += Number(o.grand_total || 0);
    months.set(key, entry);
  });
  // sort by key and cap pipeline to stored month keys
  const sorted = [...months.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v);
  return sorted.slice(-12);
}