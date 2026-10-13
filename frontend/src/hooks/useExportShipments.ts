import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { ExportShipment } from "@/types/frappe";

const EXPORT_SHIPMENT_FIELDS = [
  "name",
  "shipment_no",
  "shipment_date",
  "customer",
  "sales_order",
  "lc_proforma",
  "lc_no",
  "commercial_invoice_no",
  "packing_list_no",
  "bill_of_lading_no",
  "container_no",
  "shipping_line",
  "vessel",
  "port_of_loading",
  "port_of_discharge",
  "final_destination",
  "etd",
  "eta",
  "actual_shipment_date",
  "shipment_status",
  "workflow_state",
] as const;

/** List export shipments. */
export function useExportShipments(args?: { filters?: unknown[][]; limit?: number; enabled?: boolean }) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<ExportShipment>(
    "Export Shipment",
    {
      fields: EXPORT_SHIPMENT_FIELDS as unknown as (keyof ExportShipment)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.expship.${JSON.stringify({ filters, limit })}` : null,
  );
}

export function useExportShipment(name?: string) {
  return useFrappeGetDoc<ExportShipment>(
    "Export Shipment",
    name ?? undefined,
    name ? `micromax.expship.doc.${name}` : null,
  );
}

export function useExportShipmentMutations(onSuccess?: (doc: ExportShipment) => void) {
  const create = useFrappeCreateDoc<ExportShipment>();
  const update = useFrappeUpdateDoc<ExportShipment>();
  const del = useFrappeDeleteDoc();
  return {
    createDoc: async (values: Partial<ExportShipment>) => {
      const doc = await create.createDoc("Export Shipment", values as ExportShipment);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<ExportShipment>) => {
      const doc = await update.updateDoc("Export Shipment", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("Export Shipment", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

/** Ordered timeline steps for the shipment lifecycle. */
export const EXPORT_SHIPMENT_FLOW = [
  "Booking",
  "Stuffing",
  "Shipped",
  "In Transit",
  "Arrived",
  "Delivered",
] as const;

export function shipmentStatusIndex(status?: string): number {
  const idx = EXPORT_SHIPMENT_FLOW.indexOf((status ?? "") as (typeof EXPORT_SHIPMENT_FLOW)[number]);
  if (status === "Closed") return EXPORT_SHIPMENT_FLOW.length;
  return idx < 0 ? (status === "Planned" ? -1 : -1) : idx;
}