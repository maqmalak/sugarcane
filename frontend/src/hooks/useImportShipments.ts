import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import type { ImportShipment } from "@/types/frappe";

const IMPORT_SHIPMENT_FIELDS = [
  "name",
  "shipment_no",
  "shipment_date",
  "supplier",
  "purchase_order",
  "purchase_receipt",
  "import_cost_sheet",
  "bill_of_lading",
  "container_no",
  "shipping_line",
  "vessel",
  "port_of_loading",
  "port_of_discharge",
  "etd",
  "eta",
  "actual_arrival",
  "clearing_agent",
  "customs_declaration_no",
  "duty_amount",
  "tax_amount",
  "clearance_date",
  "shipment_status",
] as const;

export function useImportShipments(args?: { filters?: unknown[][]; limit?: number; enabled?: boolean }) {
  const { filters = [], limit = 200, enabled = true } = args ?? {};
  return useFrappeGetDocList<ImportShipment>(
    "Import Shipment",
    {
      fields: IMPORT_SHIPMENT_FIELDS as unknown as (keyof ImportShipment)[],
      filters: filters as any,
      limit,
      orderBy: { field: "modified", order: "desc" },
    },
    enabled ? `micromax.impship.${JSON.stringify({ filters, limit })}` : null,
  );
}

export function useImportShipment(name?: string) {
  return useFrappeGetDoc<ImportShipment>(
    "Import Shipment",
    name ?? undefined,
    name ? `micromax.impship.doc.${name}` : null,
  );
}

export function useImportShipmentMutations(onSuccess?: (doc: ImportShipment) => void) {
  const create = useFrappeCreateDoc<ImportShipment>();
  const update = useFrappeUpdateDoc<ImportShipment>();
  const del = useFrappeDeleteDoc();
  return {
    createDoc: async (values: Partial<ImportShipment>) => {
      const doc = await create.createDoc("Import Shipment", values as ImportShipment);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<ImportShipment>) => {
      const doc = await update.updateDoc("Import Shipment", name, values);
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("Import Shipment", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

/** Customs status derived from shipment status / clearance date. */
export function customsStatus(shipment?: ImportShipment): string {
  if (shipment?.clearance_date) return "Cleared";
  const s = shipment?.shipment_status ?? "Planned";
  if (["Delivered", "Closed"].includes(s)) return "Cleared";
  if (s === "Arrived") return "Customs";
  return "Not Arrived";
}

export const IMPORT_SHIPMENT_FLOW = [
  "Shipment",
  "Arrived",
  "Customs",
  "Cleared",
  "Warehouse",
] as const;