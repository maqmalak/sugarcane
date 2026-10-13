import * as React from "react";
import { useFrappeCreateDoc, useFrappeGetCall } from "frappe-react-sdk";
import { useSWRConfig } from "swr";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError } from "@/services/frappe";
import type { FormFieldMeta } from "./field-primitives";
import {
  CRM_INDUSTRY_FORM_FIELDS,
  CRM_LEAD_SOURCE_FORM_FIELDS,
  CRM_LOST_REASON_FORM_FIELDS,
  CRM_ORGANIZATION_FORM_FIELDS,
  CRM_TERRITORY_FORM_FIELDS,
} from "./form-configs";

// FrappeForm imports field-primitives, which imports this file (for the "+" button) — a static import
// here would make that a cycle, so load the form lazily. By the time the dialog opens it's resolved.
const FrappeForm = React.lazy(() => import("./frappe-form").then((m) => ({ default: m.FrappeForm })));

interface QuickCreateSpec {
  /** Singular label for the dialog title / button ("New Territory"). */
  label: string;
  /** The SAME create-form definition the record's own management page uses. The FIRST field is the doc's name and is pre-filled with whatever was typed in the Link field. */
  fields: FormFieldMeta[];
}

/**
 * Link targets that can be created inline from a Link field's "+" button — the CRM masters whose
 * create form is self-contained. Each dialog mirrors that record's full create form (shared with its
 * management page via form-configs.ts). Anything needing more setup (an Account, an Item, a Lead
 * Status with type/colour/position…) still has to be created on its own page.
 */
const QUICK_CREATE: Record<string, QuickCreateSpec> = {
  "CRM Organization": { label: "Organization", fields: CRM_ORGANIZATION_FORM_FIELDS },
  "CRM Territory": { label: "Territory", fields: CRM_TERRITORY_FORM_FIELDS },
  "CRM Industry": { label: "Industry", fields: CRM_INDUSTRY_FORM_FIELDS },
  "CRM Lead Source": { label: "Lead Source", fields: CRM_LEAD_SOURCE_FORM_FIELDS },
  "CRM Lost Reason": { label: "Lost Reason", fields: CRM_LOST_REASON_FORM_FIELDS },
};

export function canQuickCreate(doctype: string): boolean {
  return doctype in QUICK_CREATE;
}

export function quickCreateLabel(doctype: string): string {
  return QUICK_CREATE[doctype]?.label ?? doctype;
}

interface QuickMeta { eligible: boolean; reason: string | null; label: string; fields: FormFieldMeta[] }

/**
 * The "New <Doctype>" form for a Link's "+": the hand-made CRM specs above, otherwise built from the target's own
 * required / quick-entry fields (server: sugarcane.api.v1.spa.quick_entry_meta). Null when inline creation isn't offered
 * (no create permission, submittable / single / child doctypes, doctypes needing child rows, sensitive masters).
 */
export function useQuickCreate(doctype: string, enabled = true): QuickCreateSpec | null {
  const fixed = QUICK_CREATE[doctype];
  const { data } = useFrappeGetCall<{ message: QuickMeta }>(
    "sugarcane.api.v1.spa.quick_entry_meta", { doctype },
    enabled && doctype && !fixed ? `quick-entry.${doctype}` : null,
    { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 600_000 },
  );
  if (fixed) return fixed;
  const m = data?.message;
  return m?.eligible && m.fields.length ? { label: m.label, fields: m.fields } : null;
}

/** Small "New <Doctype>" dialog; calls `onCreated(name)` with the new record's name. */
export function LinkQuickCreateDialog({
  doctype,
  open,
  initialValue,
  onClose,
  onCreated,
  spec: specProp,
}: {
  /** Form to show (from useQuickCreate); defaults to the fixed CRM specs. */
  spec?: QuickCreateSpec | null;
  doctype: string;
  open: boolean;
  /** Pre-fills the name field — usually the text the user had typed into the Link field. */
  initialValue?: string;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const spec = specProp ?? QUICK_CREATE[doctype];
  const { createDoc } = useFrappeCreateDoc<Record<string, any>>();
  const { mutate } = useSWRConfig();
  const [values, setValues] = React.useState<Record<string, any>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Reset every time the dialog opens so a previous entry doesn't linger.
  React.useEffect(() => {
    if (!open || !spec) return;
    const defaults: Record<string, any> = {};
    spec.fields.forEach((f) => {
      if (f.default !== undefined) defaults[f.fieldname] = f.default;
    });
    setValues({ ...defaults, [spec.fields[0].fieldname]: (initialValue ?? "").trim() });
    setErrors({});
    setError(null);
  }, [open, spec, initialValue]);

  if (!spec) return null;

  const onFieldChange = (fieldname: string, value: any) => {
    setValues((v) => ({ ...v, [fieldname]: value }));
    setErrors((e) => {
      if (!(fieldname in e)) return e;
      const next = { ...e };
      delete next[fieldname];
      return next;
    });
  };

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    spec.fields.forEach((f) => {
      const v = values[f.fieldname];
      if (f.reqd && (v === undefined || v === null || String(v).trim() === "")) {
        nextErrors[f.fieldname] = `${f.label ?? f.fieldname} is required`;
      }
    });
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    // Send only what was actually filled in (layout-only fields never carry a value).
    const payload: Record<string, any> = {};
    spec.fields.forEach((f) => {
      const v = values[f.fieldname];
      if (v === undefined || v === null) return;
      payload[f.fieldname] = typeof v === "string" ? v.trim() : v;
      if (payload[f.fieldname] === "") delete payload[f.fieldname];
    });
    setSaving(true);
    setError(null);
    try {
      const doc = await createDoc(doctype, payload);
      // Every doctype in QUICK_CREATE names its docs after the first field; fall back to that if the
      // server response ever omits `name`.
      const name = String(doc?.name ?? payload[spec.fields[0].fieldname]);
      // Refresh every cached Link search for this doctype so the new record shows up in all pickers.
      await mutate((key) => typeof key === "string" && key.startsWith(`micromax.link.${doctype}.`));
      notifyDataChanged();
      toast.success(`${spec.label} created`);
      onCreated(name);
      onClose();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="xl" title={`New ${spec.label}`}>
      <div
        className="space-y-5"
        // This dialog is portaled but still sits inside the opening form's React tree, so an Enter here
        // would bubble to that form's own handlers — submit ourselves and stop it. Escape is deliberately
        // NOT stopped: Dialog listens for it on `document` and a React stopPropagation would block that.
        // A textarea / rich-text editor keeps Enter for its own newlines.
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.stopPropagation();
          const el = e.target as HTMLElement;
          if (el.tagName === "TEXTAREA" || el.isContentEditable) return;
          e.preventDefault();
          if (!saving) void submit();
        }}
      >
        <React.Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-muted" />}>
          <FrappeForm fields={spec.fields} values={values} onChange={onFieldChange} errors={errors} />
        </React.Suspense>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="neutral" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" variant="save" onClick={() => void submit()} loading={saving}>
            Create
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
