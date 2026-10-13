import * as React from "react";
import { createPortal } from "react-dom";
import { useFrappeGetDocList } from "frappe-react-sdk";
import { Link as LinkIcon, Plus, Search, X } from "lucide-react";
import { LinkQuickCreateDialog, useQuickCreate } from "./link-quick-create";
import { useSelectedCompany } from "@/hooks/useCompanyContext";
import { StatusBadge } from "@/components/common/status-badge";

/** Masters that belong to one company: link pickers list only the selected company's records. */
const COMPANY_SCOPED: Record<string, string> = {
  Account: "company",
  "Cost Center": "company",
  Warehouse: "company",
  "Bank Account": "company",
  Department: "company",
  Employee: "company",
  Project: "company",
  "Asset": "company",
  "Sales Taxes and Charges Template": "company",
  "Purchase Taxes and Charges Template": "company",
  "Item Tax Template": "company",
};

/**
 * ERPNext-style form field metadata.
 * Mirrors the DocField attributes the Frappe server exposes via
 * /api/method/frappe.client.get_list(doctype="DocField"...) or the DocType JSON.
 */
export interface FormFieldMeta {
  fieldname: string;
  label?: string;
  fieldtype:
    | "Data"
    | "Select"
    | "Link"
    | "Dynamic Link"
    | "Date"
    | "Datetime"
    | "Time"
    | "Percent"
    | "Currency"
    | "Float"
    | "Int"
    | "Check"
    | "Text"
    | "Text Editor"
    | "Attach"
    | "Attach Image"
    | "Table"
    | "Section Break"
    | "Column Break"
    | "Tab Break";
  options?: string;
  reqd?: boolean;
  read_only?: boolean;
  hidden?: boolean;
  depends_on?: string;
  mandatory_depends_on?: string;
  fetch_from?: string;
  fetch_if_empty?: boolean;
  default?: unknown;
  precision?: string | number;
  placeholder?: string;
  description?: string;
  in_list_view?: boolean;
  [key: string]: unknown;
}

export type FormValues = Record<string, any>;

/** Split Select options ("\n" separated) into a clean list (empty first = placeholder). */
export function splitOptions(options?: string): string[] {
  if (!options) return [];
  return options
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Resolve a `fetch_from` target from a selected parent value (same row). */
export function applyFetchFrom(
  meta: FormFieldMeta,
  values: FormValues,
  fallback: Record<string, unknown> = {},
): unknown {
  const f = meta.fetch_from;
  if (!f) return undefined;
  const [sourceField] = f.split(".");
  const current = values[sourceField] ?? fallback[sourceField];
  if (current && typeof current === "object") {
    const [, targetKey] = f.split(".");
    return (current as Record<string, unknown>)[targetKey];
  }
  return undefined;
}

/** Title / search fields per common link doctypes. */
const LINK_TITLE_FIELDS: Record<string, string> = {
  Customer: "customer_name",
  Supplier: "supplier_name",
  Item: "item_name",
  Employee: "employee_name",
  Company: "company_name",
  User: "full_name",
  Warehouse: "warehouse_name",
  "Sales Order": "name",
  "Purchase Order": "name",
  "CRM Lead": "lead_name",
  "CRM Deal": "organization",
  "CRM Organization": "organization_name",
};

/** Extra columns shown (and searched) under each option for some Link targets — e.g. a plot's status, block and price. */
const LINK_DETAILS: Record<string, { fields: string[]; search?: string[]; status?: string; describe: (d: Record<string, any>) => string }> = {
  "RE Plot": {
    fields: ["status", "block", "plot_size", "list_price", "street", "is_corner"], search: ["block", "plot_size", "street"], status: "status",
    describe: (d) => [d.block, d.plot_size, d.list_price ? `Rs ${(Number(d.list_price) / 1e5).toFixed(1)} Lac` : "", d.street, d.is_corner ? "Corner" : ""].filter(Boolean).join(" · "),
  },
  Customer: { fields: ["mobile_no", "re_cnic"], search: ["mobile_no"], describe: (d) => [d.mobile_no, d.re_cnic].filter(Boolean).join(" · ") },
};

/** Title/search field for a Link doctype — exported so callers needing the
 * actual display value (not just the id) for a Dynamic Link selection, e.g.
 * to pre-populate a "full name" field a controller would otherwise guess
 * wrong for a multi-word doctype, can fetch the right field themselves. */
export function linkTitleField(doctype: string): string {
  return LINK_TITLE_FIELDS[doctype] ?? "name";
}

/** A link field with async search (DocType options). Loads on focus; searches as you type. */
export function FrappeLinkField({
  meta,
  value,
  onChange,
  disabled,
  onError,
  className,
  allowClear = true,
  allowCreate = true,
}: {
  meta: FormFieldMeta;
  value?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  onError?: (msg: string) => void;
  className?: string;
  allowClear?: boolean;
  /** Show the "+" / "Create …" quick-create for link targets that support it (see link-quick-create.tsx). Pass false for filter pickers. */
  allowCreate?: boolean;
}) {
  const doctype = String(meta.options ?? "");
  const titleField = linkTitleField(doctype);
  const quick = useQuickCreate(doctype, allowCreate && !disabled);
  const creatable = allowCreate && !disabled && Boolean(quick);
  const [createOpen, setCreateOpen] = React.useState(false);
  // Text typed into the search box, remembered past the blur that clicking "+" causes (blur clears `query`).
  const [createSeed, setCreateSeed] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const limit = 25;
  const q = query.trim();

  // The list is portaled to <body> and positioned with fixed coordinates so
  // it isn't clipped by ancestors that scroll (e.g. the child-table's
  // overflow-x-auto wrapper, which forces overflow-y:auto per the CSS spec
  // and would otherwise hide most of the list behind a scrollbar).
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = React.useState<{
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  const updateMenuPos = React.useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const desiredMax = 352; // 22rem — matches the intended "long list" height
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    // Prefer opening downward; flip above the field only when there's
    // meaningfully more room up there, so a tall list is never cut off by
    // the browser viewport edge for fields sitting low on the page.
    if (spaceBelow >= 160 || spaceBelow >= spaceAbove) {
      setMenuPos({
        left: rect.left,
        width: rect.width,
        top: rect.bottom + gap,
        maxHeight: Math.max(120, Math.min(desiredMax, spaceBelow)),
      });
    } else {
      setMenuPos({
        left: rect.left,
        width: rect.width,
        bottom: window.innerHeight - rect.top + gap,
        maxHeight: Math.max(120, Math.min(desiredMax, spaceAbove)),
      });
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updateMenuPos();
    window.addEventListener("scroll", updateMenuPos, true);
    window.addEventListener("resize", updateMenuPos);
    return () => {
      window.removeEventListener("scroll", updateMenuPos, true);
      window.removeEventListener("resize", updateMenuPos);
    };
  }, [open, updateMenuPos]);

  const selectedCompany = useSelectedCompany();
  const filters: unknown[][] = Array.isArray(meta.filters) ? [...(meta.filters as unknown[][])] : [];
  const companyField = COMPANY_SCOPED[doctype];
  if (companyField && selectedCompany && !filters.some((f) => Array.isArray(f) && f[0] === companyField)) {
    filters.push([companyField, "=", selectedCompany]);
  }
  if (doctype === "Customer" || doctype === "Supplier" || doctype === "Item") {
    filters.push(["disabled", "=", 0]);
  }
  // Group accounts are Chart-of-Accounts summary nodes — ERPNext rejects any
  // transaction posted against one, so never offer them where a Link field
  // picks a posting account (every "Account" Link in this app defaults to
  // exactly that). A caller that explicitly needs group accounts instead
  // (e.g. a "parent account" picker) passes its own `is_group` filter via
  // `meta.filters`, which this default must not clobber.
  if (doctype === "Account" && !filters.some((f) => Array.isArray(f) && f[0] === "is_group")) {
    filters.push(["is_group", "=", 0]);
  }

  const details = LINK_DETAILS[doctype];
  const orFilters: unknown[][] | undefined = q
    ? [
        ["name", "like", `%${q}%`],
        ...(titleField !== "name" ? [[titleField, "like", `%${q}%`] as unknown[]] : []),
        ...(details?.search ?? []).map((f) => [f, "like", `%${q}%`] as unknown[]),
      ]
    : undefined;

  const fields = [...new Set(["name", ...(titleField !== "name" ? [titleField] : []), ...(details?.fields ?? [])])];

  const { data, error, isLoading } = useFrappeGetDocList<Record<string, any>>(
    doctype,
    {
      fields: fields as any,
      filters: filters as any,
      ...(orFilters ? { orFilters: orFilters as any } : {}),
      limit,
      orderBy: { field: titleField !== "name" ? titleField : "name", order: "asc" },
    },
    // the key carries the filters: two pickers on one doctype with different filters must not share results
    doctype && open ? `micromax.link.${doctype}.${q || "__all__"}.${JSON.stringify(filters)}` : null,
  );

  React.useEffect(() => {
    if (error && onError) onError(`Could not search ${doctype}`);
  }, [error, doctype, onError]);

  const results = (data ?? []).map((d) => {
    const title = titleField !== "name" ? d[titleField] : undefined;
    const label = title && title !== d.name ? `${title} (${d.name})` : String(d.name ?? "");
    return { value: String(d.name ?? ""), label, sub: details?.describe(d) ?? "", status: details?.status ? String(d[details.status] ?? "") : "" };
  });

  const startCreate = (seed: string) => {
    setCreateSeed(seed);
    setCreateOpen(true);
    setOpen(false);
    setFocused(false);
  };

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <div className="relative min-w-0 flex-1" ref={wrapperRef}>
        <div className="relative">
          <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-8 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-muted/50 disabled:text-foreground dark:disabled:bg-white/[0.04]"
            value={focused ? query : value ?? ""}
            placeholder={meta.placeholder ?? `Search ${meta.label ?? doctype}…`}
            disabled={disabled || !doctype}
            onChange={(e) => {
              setFocused(true);
              setQuery(e.target.value);
              setCreateSeed(e.target.value);
              setOpen(true);
            }}
            // After picking an option the input keeps focus, so a second click fires no focus event — reopen here
            // so a wrong pick can be corrected straight away.
            onMouseDown={() => {
              if (open) return;
              setFocused(true);
              setQuery("");
              setCreateSeed("");
              setOpen(true);
            }}
            onFocus={() => {
              setFocused(true);
              setQuery("");
              setCreateSeed("");
              setOpen(true);
            }}
            onBlur={() => {
              setFocused(false);
              setOpen(false);
              setQuery("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query) {
                e.preventDefault();
                onChange(query.trim());
                setOpen(false);
                setFocused(false);
              }
              if (e.key === "Escape") {
                setOpen(false);
                setFocused(false);
              }
              if ((e.key === "ArrowDown" || e.key === "Enter") && !open && !query) {
                e.preventDefault();
                setFocused(true);
                setOpen(true);
              }
            }}
          />
          {allowClear && value && (
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange("");
                setQuery("");
              }}
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {open &&
          menuPos &&
          createPortal(
            <ul
              className="fixed z-50 overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg"
              style={{
                left: menuPos.left,
                width: menuPos.width,
                maxHeight: menuPos.maxHeight,
                ...(menuPos.top !== undefined ? { top: menuPos.top } : { bottom: menuPos.bottom }),
              }}
            >
              {isLoading && results.length === 0 && (
                <li className="px-2 py-1.5 text-sm text-muted-foreground">Searching…</li>
              )}
              {!isLoading && results.length === 0 && (
                <li className="px-2 py-1.5 text-sm text-muted-foreground">No results</li>
              )}
              {creatable && q && !results.some((r) => r.value.toLowerCase() === q.toLowerCase()) && (
                <li>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium text-primary hover:bg-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      startCreate(q);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{`Create ${(quick?.label ?? doctype)} “${q}”`}</span>
                  </button>
                </li>
              )}
              {results.map((r) => (
                <li key={r.value}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(r.value);
                      setOpen(false);
                      setFocused(false);
                      setQuery("");
                    }}
                  >
                    <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{r.label}</span>
                        {r.status && <StatusBadge status={r.status} className="ml-auto shrink-0 px-2 py-0 text-[10px]" />}
                      </span>
                      {r.sub && <span className="block truncate text-[11px] text-muted-foreground">{r.sub}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )}
      </div>
      {creatable && (
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={`New ${(quick?.label ?? doctype)}`}
          aria-label={`Create new ${(quick?.label ?? doctype)}`}
          // mousedown keeps the search input from blurring first, so its typed text is still available to seed the dialog
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => startCreate(createSeed)}
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
      {creatable && (
        <LinkQuickCreateDialog
          doctype={doctype}
          spec={quick}
          open={createOpen}
          initialValue={createSeed}
          onClose={() => setCreateOpen(false)}
          onCreated={(name) => {
            onChange(name);
            setQuery("");
            setCreateSeed("");
          }}
        />
      )}
    </div>
  );
}
