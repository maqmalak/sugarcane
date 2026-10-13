import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { ColumnDef } from "@/components/tables/data-table";
import type { FormFieldMeta } from "@/components/forms/field-primitives";
import type { ChildRow } from "@/components/tables/child-table";
import type { STAT_TONES } from "@/components/common/stat-card";

/**
 * Config for the generic list / form pages (DocListPage, DocFormPage).
 *
 * A DocType becomes a full management screen — status tabs, filters, server-side search and paging,
 * create / edit / submit / cancel / delete, editable child tables, live calculations — by describing
 * it here instead of writing a 400-line page. Field metadata (`FormFieldMeta`) is the same shape
 * the rest of the app's forms already use.
 */

export type DocValues = Record<string, any>;
export type ChildRows = Record<string, ChildRow[]>;

/** A form field that can also be conditionally shown (FrappeForm itself ignores `depends_on`). */
export type DocField = FormFieldMeta & { showIf?: (values: DocValues) => boolean };

export interface SummaryItem {
  label: string;
  value: ReactNode;
  tone?: keyof typeof STAT_TONES;
}

export interface ChildTableSpec {
  /** Fieldname of the Table field on the parent, e.g. "items". */
  key: string;
  label: string;
  description?: string;
  /** Child DocType — sent as `doctype` on new rows. */
  doctype: string;
  columns: FormFieldMeta[];
  /** Extra fields shown only in the row-edit dialog. */
  dialogColumns?: FormFieldMeta[];
  /** Table is calculated / system-managed: shown, never edited. */
  readOnly?: boolean;
  /** At least this many rows are required to save. */
  minRows?: number;
  /** Defaults for a newly added row. */
  newRow?: (values: DocValues, rows: ChildRow[]) => ChildRow;
  /** Fill other row fields when a Link column changes (e.g. item_code → item_name, uom). */
  linkEffects?: Record<string, (value: string, row: ChildRow, values: DocValues) => Promise<ChildRow | void> | ChildRow | void>;
  /** Footer totals under the grid. */
  totals?: (rows: ChildRow[]) => { label: string; value: ReactNode; align?: "left" | "right" }[];
  /** Show the column picker / row dialog for wide tables. */
  wide?: boolean;
  /** Only show (and validate) this table when true. */
  showIf?: (values: DocValues) => boolean;
  /** Display-only values per row (e.g. a rate derived from stored totals) — shown in the grid, never saved. */
  derive?: (row: ChildRow) => ChildRow;
  /** Form tab (its label) this table belongs to — defaults to the first tab. */
  tab?: string;
  /** Custom display for a cell (e.g. a voucher number as a link); return undefined for the normal cell. */
  renderCell?: (row: ChildRow, col: FormFieldMeta) => ReactNode | undefined;
}

/** A patch to the form: header values, and/or whole child tables (keyed by the Table fieldname). */
export type FormPatch = DocValues;

export interface ExtraContext {
  name?: string;
  isNew: boolean;
  docstatus?: number;
  readOnly: boolean;
  values: DocValues;
  rows: ChildRows;
  reload: () => void;
  /** Apply a patch — keys that name a child table replace that table's rows, the rest are header values. */
  patch: (patch: FormPatch) => void;
}

/** An entry in the form's "Actions" menu. */
export interface FormAction {
  label: string;
  icon?: LucideIcon;
  /** "create" entries are listed under "Create", the rest under "Actions". */
  group?: "create" | "action";
  /** Show only when true (default: saved documents). */
  show?: (ctx: ExtraContext) => boolean;
  /** Map this document with a whitelisted ERPNext mapper and open the saved draft. Called with `source_name`
   *  unless `makeArgs` supplies the arguments. */
  make?: string;
  makeArgs?: (ctx: ExtraContext) => Record<string, unknown>;
  /** Custom handler. */
  run?: (ctx: ExtraContext) => void | Promise<void>;
}

export interface DocConfig {
  doctype: string;
  /** URL base, e.g. "/production/work-orders" (list) — form lives at `${base}/:name` and `${base}/new`. */
  base: string;
  singular: string;
  plural: string;
  subtitle: string;
  icon: LucideIcon;
  submittable?: boolean;
  /** A single (settings) DocType: the form always edits the one record, there is no list, new or delete. */
  single?: boolean;

  // ---- list ------------------------------------------------------------------------------------
  listFields: string[];
  columns: ColumnDef<any>[];
  /** DB fields the search box matches (`like %text%`). */
  searchFields: string[];
  sort?: { key: string; dir: "asc" | "desc" };
  /** Field whose values become the status tabs (with live counts). */
  statusField?: string;
  statuses?: string[];
  /** Date filter (from / to) on this field. */
  dateField?: string;
  dateLabel?: string;
  /** Extra dropdown filters — fixed `options`, or `optionsFrom` a DocType whose names are listed. */
  filters?: { field: string; label: string; options?: string[]; optionsFrom?: string }[];
  /** Form sections (by title) shown side by side as compact cards, one array per row. */
  sectionRows?: string[][];
  /** A filter bar at the top of the list: a search box plus chip groups (with live counts) for these fields and the status. */
  topFilters?: { searchLabel?: string; fields: { field: string; label: string }[]; status?: boolean };
  /** Always applied (e.g. hide template tasks). */
  baseFilters?: unknown[][];
  /** Filters switched on by a URL flag (`?<param>=1`), e.g. from the home page's "Needs attention" cards. */
  urlFlags?: { param: string; label: string; filters: (ctx: { user?: string }) => unknown[][] }[];
  /** Company-scoped? Defaults to true when the form has a `company` field. */
  companyScoped?: boolean;
  /** Extra UI above the table (e.g. a view switcher). */
  /** Extra buttons in the list page header, before New. */
  /** Hook returning extra list filters that depend on the selected company (e.g. Banks the company holds accounts
   *  with — Bank has no company field). Return undefined while loading; the list waits. */
  useScopeFilters?: (company?: string) => unknown[][] | undefined;
  listActions?: ReactNode;
  listHeaderExtra?: ReactNode;

  // ---- form ------------------------------------------------------------------------------------
  fields: DocField[];
  children?: ChildTableSpec[];
  /** Defaults for a new document. */
  defaults?: (ctx: { company?: string; params: URLSearchParams }) => DocValues;
  /** Cards shown above the form. */
  summary?: (values: DocValues, rows: ChildRows) => SummaryItem[];
  /** Live calculation: called after every edit; return patches for header values and/or child rows. */
  compute?: (values: DocValues, rows: ChildRows) => { values?: DocValues; rows?: ChildRows } | void;
  /** Fill other fields when a header Link/Select changes. The returned patch may also carry child tables (by Table fieldname). */
  linkEffects?: Record<string, (value: any, values: DocValues) => Promise<FormPatch | void> | FormPatch | void>;
  /** Extra sections rendered below the form (panels, related lists…). */
  extra?: (ctx: ExtraContext) => ReactNode;
  /** Panels inside a form tab (keyed by tab label): `before` the tab's fields, `after` its child tables. */
  tabPanels?: Record<string, { before?: (ctx: ExtraContext) => ReactNode; after?: (ctx: ExtraContext) => ReactNode }>;
  /** "Connections" tab listing linked documents (server: mm_core.connections.get_connections). On by default;
   *  `false` hides it. */
  connections?: boolean;
  /** Entries for the "Actions" menu (next documents to create, custom operations). */
  actions?: FormAction[];
  /** Icons for the tab bar, keyed by tab label. */
  tabIcons?: Record<string, LucideIcon>;
  /** Text under the page title on the form. */
  titleOf?: (values: DocValues) => string;
  /** Business rules beyond "required": return { field: message }. */
  validate?: (values: DocValues, rows: ChildRows) => Record<string, string>;
  /** Fields that must not be sent back on save (server-managed). */
  omitOnSave?: string[];
}
