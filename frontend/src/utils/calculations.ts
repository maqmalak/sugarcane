import { asNumber } from "./cn";
import type { LCProformaItem, ImportCostSheetItem, SalesOrderItem } from "@/types/frappe";

/** Business calculations for the Micromax module. These mirror the server-side
 *  `validate()` logic so the UI is responsive. ERPNext remains the source of
 *  truth; values are persisted on submit. */

/** LC Proforma item: Amount = Quantity × Rate. */
export function lcItemAmount(row: Pick<LCProformaItem, "quantity" | "rate">): number {
  return asNumber(row.quantity) * asNumber(row.rate);
}

/** Recalculate a full LC Proforma child table and totals. */
export function calculateLCProforma(rows: LCProformaItem[]) {
  const items = rows.map((row) => ({ ...row, amount: lcItemAmount(row) }));
  const totals = items.reduce(
    (acc, row) => {
      acc.quantity += asNumber(row.quantity);
      acc.cartons += asNumber(row.cartons);
      acc.netWeight += asNumber(row.net_weight);
      acc.grossWeight += asNumber(row.gross_weight);
      acc.value += asNumber(row.amount);
      return acc;
    },
    { quantity: 0, cartons: 0, netWeight: 0, grossWeight: 0, value: 0 },
  );
  return { items, totals };
}

/**
 * Import Cost Sheet item: total landed cost per row and per unit, per Pakistan import costing.
 * Landed cost = purchase value + freight, insurance, customs / additional / regulatory duty, clearing,
 * port and other charges. Sales tax at import (s.7 STA) and income tax u/s 148 ITO are adjustable taxes,
 * so they are NOT part of the stock's cost (mirrors import_cost_sheet.py).
 */
export function importCostItemTotals(row: ImportCostSheetItem): {
  totalLandedCost: number;
  landedCostPerUnit: number;
} {
  const totalLandedCost =
    asNumber(row.purchase_value) +
    asNumber(row.freight) +
    asNumber(row.insurance) +
    asNumber(row.customs_duty) +
    asNumber(row.additional_duty) +
    asNumber(row.regulatory_duty) +
    asNumber(row.clearing_charges) +
    asNumber(row.port_charges) +
    asNumber(row.other_charges);
  const qty = asNumber(row.quantity);
  return {
    totalLandedCost,
    landedCostPerUnit: qty > 0 ? totalLandedCost / qty : 0,
  };
}

/** Recalculate the full import cost sheet (item rows, purchase & landed totals). */
export function calculateImportCostSheet(rows: ImportCostSheetItem[]) {
  const enriched = rows.map((row) => ({ ...row, ...importCostItemTotals(row) }));
  const purchase = enriched.reduce((s, r) => s + asNumber(r.purchase_value), 0);
  const landed = enriched.reduce((s, r) => s + asNumber(r.total_landed_cost), 0);
  return { items: enriched, totalPurchaseValue: purchase, totalLandedCost: landed };
}

/** Progress helpers for the Export Order view. */
export interface ProgressSummary {
  total: number;
  produced: number;
  packed: number;
  shipped: number;
  balance: number;
  productionPct: number;
  packingPct: number;
  shipmentPct: number;
}

export function salesOrderProgress(items: SalesOrderItem[]): ProgressSummary {
  const total = items.reduce((s, i) => s + asNumber(i.qty), 0);
  const produced = items.reduce((s, i) => s + asNumber(i.produced_qty ?? i.export_quantity), 0);
  const packed = items.reduce((s, i) => s + asNumber(i.packed_qty), 0);
  const shipped = items.reduce((s, i) => s + asNumber(i.delivered_qty), 0);
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

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);