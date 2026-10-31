import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SlidersHorizontal, ChevronUp, ChevronDown, Play, Boxes, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingOverlay } from "@/components/common/loading-overlay";
import { KpiCard } from "@/pages/Dashboard/KpiCard";
import { FrappeDataTable, type ColumnDef } from "@/components/tables/data-table";
import { FrappeLinkField } from "@/components/forms/field-primitives";
import { useQueryReport } from "@/hooks/useAccounting";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { formatNumber } from "@/utils/currency";
import { asNumber } from "@/utils/cn";
import { todayISO, startOfMonthISO } from "@/utils/dates";
import { humanizeError } from "@/services/frappe";
import type { QueryReportColumn } from "@/types/frappe";

const NUMERIC_TYPES = new Set(["Currency", "Float", "Int"]);

// voucher_type -> the detail route this app has for it. voucher_no links only
// go live for types we actually have a page for; everything else stays plain text.
const VOUCHER_TYPE_ROUTES: Record<string, string> = {
  "Purchase Receipt": "/purchase/receipts",
  "Purchase Invoice": "/purchase/invoices",
  "Delivery Note": "/selling/delivery-notes",
  "Sales Invoice": "/selling/sales-invoices",
  "Stock Entry": "/inventory/stock-entries",
};

/**
 * Stock Ledger — every Stock Ledger Entry in a date range, delegated to
 * ERPNext's own report engine (`frappe.desk.query_report.run`), mirroring
 * how the General Ledger report reuses it. Results match ERPNext's own desk
 * report exactly; nothing here recomputes running balances.
 */
export function ReportStockLedgerPage() {
  const navigate = useNavigate();
  const { company } = useCompanyContext();

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [fromDate, setFromDate] = useState(() => startOfMonthISO());
  const [toDate, setToDate] = useState(todayISO());
  const [itemCode, setItemCode] = useState("");
  const [warehouse, setWarehouse] = useState("");

  const filters = useMemo(
    () => ({
      company,
      from_date: fromDate,
      to_date: toDate,
      item_code: itemCode ? [itemCode] : undefined,
      warehouse: warehouse ? [warehouse] : undefined,
      valuation_field_type: "Currency",
    }),
    [company, fromDate, toDate, itemCode, warehouse],
  );

  // Every posting in the range, across every item/warehouse if unfiltered —
  // expensive, so it only runs when the user explicitly clicks Generate.
  const [generatedFiltersKey, setGeneratedFiltersKey] = useState<string | null>(null);
  const filtersKey = JSON.stringify(filters);
  const hasGenerated = generatedFiltersKey === filtersKey;

  const { data, error, isLoading, isPreparing, mutate } = useQueryReport(
    "Stock Ledger",
    filters,
    Boolean(company && fromDate && toDate && hasGenerated),
  );

  const rows = (data?.result ?? []).filter((r) => r && Object.keys(r).length > 0);

  const columns: QueryReportColumn[] = (data?.columns ?? []).filter((c) => !c.hidden);

  const tableColumns: ColumnDef<Record<string, unknown>>[] = useMemo(
    () =>
      columns.map((c) => {
        const numeric = NUMERIC_TYPES.has(c.fieldtype ?? "");
        return {
          key: c.fieldname,
          label: c.label,
          align: numeric ? "right" : "left",
          cellClassName:
            c.fieldname === "in_qty"
              ? "text-emerald-600 dark:text-emerald-400"
              : c.fieldname === "out_qty"
              ? "text-amber-600 dark:text-amber-400"
              : undefined,
          getValue: (r) => {
            const v = r[c.fieldname];
            return typeof v === "number" || typeof v === "string" ? v : String(v ?? "");
          },
          render: (r) => {
            const v = r[c.fieldname];
            if (v === null || v === undefined || v === "") return "—";
            if (numeric) return formatNumber(asNumber(v), c.fieldtype === "Int" ? 0 : 2);
            if (c.fieldname === "voucher_no") {
              const routeBase = VOUCHER_TYPE_ROUTES[String(r.voucher_type ?? "")];
              if (routeBase) {
                return (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`${routeBase}/${encodeURIComponent(String(v))}`);
                    }}
                  >
                    {String(v)}
                  </button>
                );
              }
            }
            return String(v);
          },
        };
      }),
    [columns, navigate],
  );

  const totalIn = rows.reduce((s, r) => s + asNumber(r.in_qty), 0);
  const totalOut = rows.reduce((s, r) => s + asNumber(r.out_qty), 0);
  const closingQty = rows.length ? asNumber(rows[rows.length - 1].qty_after_transaction) : 0;

  const activeFilterCount = [itemCode, warehouse].filter(Boolean).length;

  const clearFilters = () => {
    setItemCode("");
    setWarehouse("");
    setGeneratedFiltersKey(null);
  };

  const generateLedger = () => setGeneratedFiltersKey(filtersKey);

  return (
    <div className="space-y-4">
      <LoadingOverlay show={isPreparing} label="Generating Stock Ledger…" />
      <PageHeader title="Stock Ledger" subtitle="Every stock movement, item by item — computed live by ERPNext" />

      {!company ? (
        <EmptyState title="No company selected" description="Choose a company from the header to run this report." />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                Filters
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                  {activeFilterCount} active
                </span>
              </span>
              {filtersOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {filtersOpen && (
              <div className="border-t border-border p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label htmlFor="sl-from">From Date</Label>
                    <Input id="sl-from" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="sl-to">To Date</Label>
                    <Input id="sl-to" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Item</Label>
                    <FrappeLinkField
                      meta={{ fieldname: "item_code", label: "Item", fieldtype: "Link", options: "Item", placeholder: "All items" }}
                      value={itemCode}
                      onChange={setItemCode}
                    />
                  </div>
                  <div>
                    <Label>Warehouse</Label>
                    <FrappeLinkField
                      meta={{ fieldname: "warehouse", label: "Warehouse", fieldtype: "Link", options: "Warehouse", placeholder: "All warehouses" }}
                      value={warehouse}
                      onChange={setWarehouse}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear all
                  </Button>
                  <Button variant="primary" size="sm" onClick={generateLedger} disabled={!company || !fromDate || !toDate}>
                    <Play className="h-4 w-4" />
                    Generate Ledger
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {!hasGenerated ? (
            <EmptyState
              title="Set your filters and generate"
              description="Every stock ledger entry in the range gets pulled straight from ERPNext — narrow it down by item or warehouse first if you want, then click Generate Ledger to run it."
              actionLabel="Generate Ledger"
              onAction={company && fromDate && toDate ? generateLedger : undefined}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <KpiCard label="Total In Qty" value={formatNumber(totalIn, 2)} icon={ArrowDownRight} tone="success" loading={isLoading} />
                <KpiCard label="Total Out Qty" value={formatNumber(totalOut, 2)} icon={ArrowUpRight} tone="warning" loading={isLoading} />
                <KpiCard label="Closing Balance Qty" value={formatNumber(closingQty, 2)} icon={Boxes} tone="info" loading={isLoading} />
              </div>

              <FrappeDataTable
                columns={tableColumns}
                rows={rows}
                rowKey={(r) => `${r.item_code}-${r.warehouse}-${r.date}-${r.voucher_no}-${r.actual_qty}`}
                loading={isLoading}
                error={error}
                onRetry={() => void mutate()}
                searchPlaceholder="Search item, warehouse, voucher…"
                exportFilename="stock-ledger"
                title="Ledger Entries"
                subtitle={`${rows.length} entries`}
                emptyTitle="No stock ledger entries"
                emptyDescription={error ? humanizeError(error) : "No stock movement in this date range for the selected filters."}
                initialPageSize={25}
                pageSizeOptions={[25, 50, 100]}
                defaultSortKey="date"
                striped
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
