import type { ReactNode } from "react";
import { StatusBadge } from "@/components/common/status-badge";
import { PercentBar } from "@/components/common/percent-bar";
import type { ColumnDef } from "@/components/tables/data-table";
import { formatDate, formatDateTime } from "@/utils/dates";
import { formatMoney } from "@/utils/currency";
import { asNumber } from "@/utils/cn";
import type { DocField } from "./doc-config";

/* ------------------------------------------------------------------ form-field builders
 * Terse constructors so a DocType's form reads like its layout: sec("Order"), link(...), date(...).
 * `label`s and `reqd`/`read_only` come from the DocType's real field definitions. */

type Extra = Partial<DocField>;
let breaks = 0;

export const sec = (label = ""): DocField => ({ fieldname: `__section_${breaks++}`, fieldtype: "Section Break", label });
export const colBreak = (): DocField => ({ fieldname: `__column_${breaks++}`, fieldtype: "Column Break" });
/** Starts a form tab: fields after it (until the next tab) belong to it. Child tables / panels join a tab by its label. */
export const tab = (label: string): DocField => ({ fieldname: `__tab_${breaks++}`, fieldtype: "Tab Break", label });

const make = (fieldtype: DocField["fieldtype"]) => (fieldname: string, label: string, extra: Extra = {}): DocField => ({ fieldname, fieldtype, label, ...extra });
export const data = make("Data");
export const date = make("Date");
export const datetime = make("Datetime");
export const int = make("Int");
export const float = make("Float");
export const currency = make("Currency");
export const check = make("Check");
export const text = make("Text");
export const richText = make("Text Editor");
export const link = (fieldname: string, label: string, options: string, extra: Extra = {}): DocField => ({ fieldname, fieldtype: "Link", label, options, ...extra });
export const select = (fieldname: string, label: string, options: string[], extra: Extra = {}): DocField => ({
  fieldname,
  fieldtype: "Select",
  label,
  options: options.join("\n"),
  ...extra,
});
/** Read-only, calculated by the server (or by the config's `compute`). */
export const ro = (f: DocField): DocField => ({ ...f, read_only: true });
export const req = (f: DocField): DocField => ({ ...f, reqd: true });
export const when = (f: DocField, showIf: (v: Record<string, any>) => boolean): DocField => ({ ...f, showIf });

/* ------------------------------------------------------------------ list-column builders */

export const nameCol = <T extends Record<string, any>>(label: string, sub?: (r: T) => ReactNode): ColumnDef<T> => ({
  key: "name",
  label,
  render: (r) => (
    <div className="flex flex-col">
      <span className="font-medium">{r.name}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub(r)}</span>}
    </div>
  ),
});

export const textCol = <T extends Record<string, any>>(key: string, label: string, opts: Partial<ColumnDef<T>> = {}): ColumnDef<T> => ({
  key,
  label,
  render: (r) => (r[key] ? String(r[key]) : <span className="text-muted-foreground">—</span>),
  ...opts,
});

export const dateCol = <T extends Record<string, any>>(key: string, label: string): ColumnDef<T> => ({ key, label, render: (r) => formatDate(r[key]) });
export const dateTimeCol = <T extends Record<string, any>>(key: string, label: string): ColumnDef<T> => ({ key, label, render: (r) => formatDateTime(r[key]) });

export const numCol = <T extends Record<string, any>>(key: string, label: string, digits = 2): ColumnDef<T> => ({
  key,
  label,
  align: "right",
  getValue: (r) => asNumber(r[key]),
  render: (r) => asNumber(r[key]).toLocaleString(undefined, { maximumFractionDigits: digits }),
});

export const moneyCol = <T extends Record<string, any>>(key: string, label: string): ColumnDef<T> => ({
  key,
  label,
  align: "right",
  getValue: (r) => asNumber(r[key]),
  render: (r) => formatMoney(r[key]),
});

export const statusCol = <T extends Record<string, any>>(key = "status", label = "Status", fallback = "Draft"): ColumnDef<T> => ({
  key,
  label,
  render: (r) => <StatusBadge status={r[key] || fallback} />,
});

/** Draft / Submitted / Cancelled from docstatus (for DocTypes with no status field). */
export const docstatusCol = <T extends Record<string, any>>(): ColumnDef<T> => ({
  key: "docstatus",
  label: "State",
  render: (r) => <StatusBadge status={["Draft", "Submitted", "Cancelled"][r.docstatus ?? 0]} />,
});

export const yesNoCol = <T extends Record<string, any>>(key: string, label: string, yes = "Yes", no = "No"): ColumnDef<T> => ({
  key,
  label,
  render: (r) => <StatusBadge status={r[key] ? yes : no} />,
});

/** done / total as a bar with the raw numbers underneath. */
export const progressCol = <T extends Record<string, any>>(doneKey: string, totalKey: string, label: string, opts: Partial<ColumnDef<T>> = {}): ColumnDef<T> => {
  const pct = (r: T) => {
    const total = asNumber(r[totalKey]);
    return total > 0 ? Math.min(100, (asNumber(r[doneKey]) / total) * 100) : 0;
  };
  return {
    key: doneKey,
    label,
    getValue: pct,
    render: (r) => (
      <div className="flex flex-col gap-0.5">
        <PercentBar value={pct(r)} />
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {asNumber(r[doneKey]).toLocaleString(undefined, { maximumFractionDigits: 2 })} / {asNumber(r[totalKey]).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>
    ),
    ...opts,
  };
};

export const percentCol = <T extends Record<string, any>>(key: string, label: string): ColumnDef<T> => ({
  key,
  label,
  getValue: (r) => asNumber(r[key]),
  render: (r) => <PercentBar value={r[key]} />,
});

/** A number formatted for summary cards. */
export const fmt = (v: unknown, digits = 2) => asNumber(v).toLocaleString(undefined, { maximumFractionDigits: digits });
/** Money amounts: always exactly 2 decimals (e.g. 1,923.40, 0.35). */
export const fmtMoney = (v: unknown) => asNumber(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const time = make("Time");
export const percent = make("Percent");
