import * as React from "react";
import { cn } from "@/utils/cn";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RichTextEditor } from "./rich-text-editor";
import { postCall } from "@/services/frappe";
import {
  type FormFieldMeta,
  type FormValues,
  FrappeLinkField,
  splitOptions,
} from "./field-primitives";

/**
 * Client-side mirror of ERPNext `fetch_from` (source.link -> field.fieldname).
 */
function applyFetch(meta: FormFieldMeta, values: FormValues, row?: FormValues): unknown {
  const f = meta.fetch_from;
  if (!f) return undefined;
  const [srcField, srcKey] = f.split(".");
  const src = values[srcField] ?? row?.[srcField];
  if (src && typeof src === "object") return (src as Record<string, unknown>)[srcKey];
  return undefined;
}

/**
 * Renders a single form field from its ERPNext-style metadata.
 *
 *  - Blank/invalid fields are skipped
 *  - read_only     -> static read-only text
 *  - Section/Column breaks are layout hints handled by <FrappeForm/>
 *  - fetch_from    -> copies a value from a selected Link in the same row
 *                       (lightweight client-side mirror; server stays truth)
 */
/**
 * Date / datetime box that can be typed into. A native date input reports "" while it is only half typed
 * (e.g. month entered, year still empty); feeding that back through a controlled `value` wipes what the user
 * typed so far, so the box is left uncontrolled and only pushes complete (or deliberately cleared) values up.
 */
export function DateInput({ type, value, onValue, disabled, error, className }: { type: "date" | "datetime-local"; value: string; onValue: (v: string) => void; disabled?: boolean; error?: string; className?: string }) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (el && el.value !== value && !el.validity.badInput) el.value = value;
  }, [value]);
  return (
    <Input
      ref={ref}
      type={type}
      defaultValue={value}
      disabled={disabled}
      error={error}
      className={className}
      onChange={(e) => {
        if (!e.target.validity.badInput) onValue(e.target.value);
      }}
    />
  );
}

/** Display precision: money always 2 decimals; quantities up to 3 (small scrap/blend quantities stay visible). */
const DECIMALS: Partial<Record<FormFieldMeta["fieldtype"], [number, number]>> = { Currency: [2, 2], Float: [0, 3], Int: [0, 0] };

export function formatNumeric(fieldtype: FormFieldMeta["fieldtype"], value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (value === null || value === undefined || value === "" || Number.isNaN(n)) return "";
  const [min, max] = DECIMALS[fieldtype] ?? [0, 3];
  return n.toLocaleString("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });
}

/**
 * Number box that shows a formatted value (thousands separators, 2-decimal money) while not being edited,
 * and the raw number while focused — the stored value is never rounded.
 */
function NumericInput({ fieldtype, value, disabled, onValue, error, placeholder }: {
  fieldtype: FormFieldMeta["fieldtype"]; value: unknown; disabled?: boolean; onValue: (v: number | null) => void; error?: string; placeholder?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  if (disabled || !editing) {
    return (
      <Input
        type="text"
        inputMode="decimal"
        value={formatNumeric(fieldtype, value)}
        disabled={disabled}
        readOnly={disabled}
        onFocus={() => !disabled && setEditing(true)}
        onChange={() => undefined}
        error={error}
        placeholder={placeholder}
        className="text-right tabular-nums"
        title={value !== null && value !== undefined && value !== "" ? String(value) : undefined}
      />
    );
  }
  return (
    <Input
      type="number"
      step={fieldtype === "Int" ? "1" : "any"}
      autoFocus
      value={value === null || value === undefined ? "" : String(value)}
      onBlur={() => setEditing(false)}
      onChange={(e) => onValue(e.target.value === "" ? null : Number(e.target.value))}
      error={error}
      placeholder={placeholder}
      className="text-right tabular-nums"
    />
  );
}

export function FieldRenderer({
  meta,
  values,
  onChange,
  errors,
  readOnly,
  fetchValues,
  hideLabel,
}: {
  meta: FormFieldMeta;
  values: FormValues;
  onChange: (fieldname: string, value: any) => void;
  errors?: Record<string, string>;
  readOnly?: boolean;
  fetchValues?: FormValues;
  /** Skip the field's own label — for contexts that already show it elsewhere (e.g. a table column header). */
  hideLabel?: boolean;
}) {
  const { fieldname, fieldtype } = meta;
  const label = meta.label ?? fieldname.replace(/_/g, " ");

  if (fieldtype === "Section Break" || fieldtype === "Column Break") return null;

  const disabled = readOnly || meta.read_only;
  const error = errors?.[fieldname];
  const raw = values[fieldname];

  const fetched = !meta.read_only && !raw ? (applyFetch(meta, values, fetchValues) as any) : undefined;
  const value = raw ?? fetched;

  let input: React.ReactNode;
  switch (fieldtype) {
    case "Data":
      input = <Input type="text" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(fieldname, e.target.value)} error={error} placeholder={meta.placeholder} />;
      break;
    case "Date":
    case "Datetime":
      input = (
        <DateInput
          type={fieldtype === "Date" ? "date" : "datetime-local"}
          // A datetime-local box only understands "YYYY-MM-DDTHH:mm"; Frappe returns "YYYY-MM-DD HH:mm:ss.ffffff".
          value={fieldtype === "Datetime" && value ? String(value).replace(" ", "T").slice(0, 16) : value ?? ""}
          disabled={disabled}
          onValue={(v) => onChange(fieldname, v)}
          error={error}
        />
      );
      break;
    case "Time":
      // Frappe stores "HH:mm:ss" (sometimes "H:mm:ss"); the time box wants zero-padded "HH:mm".
      input = (
        <Input
          type="time"
          value={value ? String(value).padStart(8, "0").slice(0, 5) : ""}
          disabled={disabled}
          onChange={(e) => onChange(fieldname, e.target.value ? `${e.target.value}:00` : "")}
          error={error}
        />
      );
      break;
    case "Int":
    case "Float":
    case "Percent":
    case "Currency":
      input = (
        <NumericInput fieldtype={fieldtype === "Percent" ? "Float" : fieldtype} value={value} disabled={disabled} onValue={(v) => onChange(fieldname, v)} error={error} placeholder={meta.placeholder} />
      );
      break;
    case "Select": {
      const options = splitOptions(meta.options);
      // splitOptions drops the blank entry, so without this an optional Select that is still empty would LOOK
      // like it holds its first option. Offer an explicit blank for optional fields (and for required ones
      // until a choice has been made).
      const blank = !meta.reqd || !value;
      input = (
        <Select value={value ?? ""} disabled={disabled} onChange={(e) => onChange(fieldname, e.target.value)} error={error}>
          {blank && !options.includes("") && <option value=""> </option>}
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
      break;
    }
    case "Link":
      input = (
        <FrappeLinkField meta={meta} value={value ?? ""} onChange={(v) => onChange(fieldname, v)} disabled={disabled} />
      );
      break;
    case "Dynamic Link": {
      // The target doctype is the value of the field named in `options` (e.g. Quotation.party_name -> quotation_to:
      // Customer / Lead / Prospect / CRM Deal): a searchable picker on that doctype, like a normal Link.
      const target = meta.options ? String(values[meta.options] ?? "") : "";
      input = target ? (
        <FrappeLinkField
          key={target}
          meta={{ ...meta, fieldtype: "Link", options: target }}
          value={value ?? ""}
          onChange={(v) => onChange(fieldname, v)}
          disabled={disabled}
        />
      ) : (
        <Input type="text" value={value ?? ""} disabled placeholder={`Select ${meta.options?.replace(/_/g, " ") ?? "type"} first`} />
      );
      break;
    }
    case "Check":
      input = (
        <Checkbox checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(fieldname, e.target.checked ? 1 : 0)} label={label} />
      );
      break;
    case "Text Editor":
      input = (
        <RichTextEditor value={value ?? ""} onChange={(html) => onChange(fieldname, html)} placeholder={meta.placeholder} readOnly={disabled} />
      );
      break;
    case "Text":
      input = (
        <Textarea
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(fieldname, e.target.value)}
          placeholder={meta.placeholder}
          className={cn("w-full", error && "border-destructive focus-visible:ring-destructive")}
        />
      );
      break;
    default:
      input = (
        <Input value={value ?? ""} disabled={disabled} onChange={(e) => onChange(fieldname, e.target.value)} error={error} />
      );
  }

  return (
    <div className={cn("space-y-1", fieldtype === "Check" && "pt-5")}>
      {fieldtype !== "Check" && !hideLabel && (
        <Label required={meta.reqd}>{label}</Label>
      )}
      {input}
      {meta.description && !error && <p className="text-xs text-muted-foreground">{meta.description}</p>}
    </div>
  );
}

export interface FrappeFormProps {
  fields: FormFieldMeta[];
  values: FormValues;
  onChange: (fieldname: string, value: any) => void;
  errors?: Record<string, string>;
  readOnly?: boolean;
  /** Per-row link data used to resolve fetch_from defaults. */
  links?: Record<string, unknown>;
  /**
   * Escape hatch for a field that needs logic FieldRenderer's fieldtype
   * switch can't express — e.g. a top-level "Dynamic Link" whose target
   * doctype comes from another field's current value, or a Link whose
   * selection should also populate a different field (FieldRenderer's
   * default case renders a Dynamic Link as a plain text input, with no way
   * to see other fields' values or write to them). Gets the form's current
   * `values`/`onChange` so it can read sibling fields and trigger side
   * effects. Return `undefined` to fall back to the normal renderer. Mirrors
   * EditableChildTable's `renderCell` escape hatch.
   */
  renderField?: (
    meta: FormFieldMeta,
    ctx: { values: FormValues; onChange: (fieldname: string, value: any) => void },
  ) => React.ReactNode | undefined;
  children?: React.ReactNode;
  /** Sections (by title) to lay out side by side as compact cards, one array per row — e.g. short related sections. */
  sectionRows?: string[][];
}

/**
 * Generic ERPNext-style form engine. Lays fields out into sections with a
 * responsive 2-column grid whenever a Column Break is encountered.
 */
export function FrappeForm({
  fields,
  values,
  onChange,
  errors,
  readOnly,
  links,
  renderField,
  children,
  sectionRows,
}: FrappeFormProps) {
  // sections with nothing to show (e.g. only a desk HTML field) are dropped
  const groups = transformLayout(fields).filter((sec) => sec.columns.some((col) => col.some((m) => !m.hidden && !m.depends_on)));

  // Picking a Terms Template (tc_name) fills the form's Terms editor with that template's text, rendered against
  // this document (placeholders like {{ customer_name }}), as ERPNext's desk does on Sales / Purchase documents.
  const hasTerms = fields.some((f) => f.fieldname === "terms");
  const valuesRef = React.useRef(values);
  valuesRef.current = values;
  const change = React.useCallback(
    (fieldname: string, value: unknown) => {
      onChange(fieldname, value);
      // Changing a Dynamic Link's type field (e.g. quotation_to) clears the link: the old value names a record of
      // the previous type.
      if (valuesRef.current[fieldname] !== value) {
        for (const f of fields) {
          if (f.fieldtype === "Dynamic Link" && f.options === fieldname && valuesRef.current[f.fieldname]) onChange(f.fieldname, "");
        }
      }
      if (fieldname !== "tc_name" || !hasTerms || !value) return;
      postCall<string | null>("erpnext.setup.doctype.terms_and_conditions.terms_and_conditions.get_terms_and_conditions", {
        template_name: value,
        doc: JSON.stringify({ ...valuesRef.current, tc_name: value }),
      })
        .then((res) => {
          const html = typeof res === "string" ? res : (res as { message?: string } | null)?.message;
          if (html) onChange("terms", html);
        })
        .catch(() => undefined); // template unreadable / removed: the editor keeps its current text
    },
    [onChange, hasTerms, fields],
  );
  const renderSection = (section: LayoutSection, si: number, inRow = false) => (
        <section key={si} className="form-card">
          {section.title && (
            <h3 className="form-card-head">
              <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
              {section.title}
            </h3>
          )}
          {/* one dense grid per section: 1 / 2 / 3 columns by width; long-form fields span the row */}
            <div className={cn("form-card-body grid gap-x-5 gap-y-3", inRow ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3")}>
              {section.columns.flat().flatMap((meta) => {
                if (meta.hidden || meta.depends_on) return [];
                const custom = renderField?.(meta, { values, onChange: change });
                if (custom !== undefined) {
                  return [
                    <div key={meta.fieldname} className="space-y-1">
                      <Label required={meta.reqd}>{meta.label ?? meta.fieldname.replace(/_/g, " ")}</Label>
                      {custom}
                    </div>,
                  ];
                }
                if (meta.read_only && !meta.fetch_if_empty) {
                  // Text/Text Editor values can run to hundreds of characters
                  // (e.g. a scraper's raw extract) — a fixed single-line h-9
                  // box doesn't clip or grow for that, it just lets the text
                  // spill out over whatever sits above/below it. Long-form
                  // fieldtypes get a wrapping, height-flexible box instead;
                  // short fieldtypes keep the compact single-line box but
                  // truncate rather than overflow.
                  const longForm = meta.fieldtype === "Text" || meta.fieldtype === "Text Editor";
                  return [
                    <div key={meta.fieldname} className="space-y-1">
                      <Label>{meta.label}</Label>
                      <div
                        className={cn(
                          "rounded-md border border-dashed border-border bg-muted/40 px-3 text-sm font-medium text-foreground/80 dark:border-slate-600/70 dark:bg-white/[0.035] dark:text-slate-200",
                          longForm
                            ? "whitespace-pre-wrap py-2 leading-relaxed"
                            : "flex h-8 items-center truncate text-[13px]",
                        )}
                      >
                        {formatReadonly(meta, values[meta.fieldname])}
                      </div>
                    </div>,
                  ];
                }
                return [
                  <FieldRenderer
                    key={meta.fieldname}
                    meta={meta}
                    values={values}
                    onChange={change}
                    errors={errors}
                    readOnly={readOnly}
                    fetchValues={links}
                  />,
                ];
              }).map((el, k) => {
                const meta = section.columns.flat().filter((m) => !m.hidden && !m.depends_on)[k];
                return meta && WIDE.has(meta.fieldtype as string) && !inRow ? <div key={`w-${meta.fieldname}`} className="col-span-full">{el}</div> : el;
              })}
            </div>
        </section>
  );
  // walk the sections; a section named in sectionRows pulls its whole row in at its first appearance
  const placed = new Set<number>();
  const layout: React.ReactNode[] = [];
  groups.forEach((section, si) => {
    if (placed.has(si)) return;
    const row = sectionRows?.find((r) => section.title && r.includes(section.title));
    if (!row) {
      layout.push(renderSection(section, si));
      return;
    }
    const members = groups.map((g, i) => [g, i] as const).filter(([g]) => g.title && row.includes(g.title));
    members.forEach(([, i]) => placed.add(i));
    layout.push(
      <div key={`row-${si}`} className={cn("grid gap-4 md:grid-cols-2", members.length >= 3 && "xl:grid-cols-3")}>
        {members.map(([g, i]) => renderSection(g, i, true))}
      </div>,
    );
  });
  return (
    <div className="frappe-form space-y-4">
      {layout}
      {children}
    </div>
  );
}

export function formatReadonly(meta: FormFieldMeta, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (meta.fieldtype === "Check") return value ? "Yes" : "No";
  if (meta.fieldtype === "Currency" || meta.fieldtype === "Float" || meta.fieldtype === "Int") return formatNumeric(meta.fieldtype, value) || "—";
  return String(value);
}

type LayoutColumn = FormFieldMeta[];
/** Field types that take a whole row in the 3-column grid. */
const WIDE = new Set(["Text", "Text Editor", "Small Text", "Long Text", "Code", "JSON", "Markdown Editor", "Table", "Attach Image", "HTML"]);

type LayoutSection = { title?: string; columns: LayoutColumn[] };

/** Convert linear ERPNext field_order (Section/Column breaks) into layout groups. */
export function transformLayout(fields: FormFieldMeta[]): LayoutSection[] {
  const sections: LayoutSection[] = [];
  let current: LayoutSection | null = null;
  let column: FormFieldMeta[] = [];

  const finishColumn = () => {
    if (column.length && current) {
      current.columns.push(column);
      column = [];
    }
  };
  const ensure = () => {
    if (!current) {
      current = { title: undefined, columns: [] };
      sections.push(current);
    }
  };

  fields.forEach((f) => {
    switch (f.fieldtype) {
      case "Section Break":
        finishColumn();
        current = { title: f.label || undefined, columns: [] };
        sections.push(current);
        break;
      case "Column Break":
        finishColumn();
        break;
      default:
        ensure();
        column.push(f);
    }
  });
  finishColumn();
  // Assign app/section field to render in a single column if empty.
  sections.forEach((s) => {
    if (s.columns.length === 0) s.columns.push([]);
  });
  return sections;
}
