import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Save, Trash2, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FrappeForm } from "@/components/forms/frappe-form";
import { ICON_GRADIENT } from "@/components/ui/app-icon";
import { cn } from "@/utils/cn";

/**
 * Building blocks of the full-page HR master forms (Department, Designation): a framed panel, a toggle tile, a
 * chip list with a Link picker, the coloured hero header and the sticky save bar. All use the `surface` styles so
 * they stay visible in dark mode.
 */

export function Panel({ icon: Icon, title, description, children, className, bodyClassName }: {
  icon: LucideIcon; title: string; description?: string; children: ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={cn("surface rounded-2xl", className)}>
      <header className="flex items-start gap-3 border-b border-border px-5 py-4 dark:border-white/10">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4.5 w-4.5" /></span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </header>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** A yes/no setting shown as a selectable tile instead of a bare checkbox. */
export function ToggleTile({ checked, onChange, title, hint, tone }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string; tone: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} aria-pressed={checked}
      className={cn("flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition",
        checked ? `${tone} shadow-sm` : "surface-inset hover:border-primary/40")}>
      <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
        checked ? "border-transparent bg-primary text-primary-foreground" : "border-input bg-background")}>
        {checked && <Check className="h-3.5 w-3.5" />}
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

/** Child-table rows that hold one Link each (approvers, skills): chips plus a picker that adds one per pick. */
export function LinkChips<K extends string>({ rows, field, doctype, label, empty, onChange }: {
  rows: Record<K, string>[]; field: K; doctype: string; label: string; empty: string; onChange: (rows: Record<K, string>[]) => void;
}) {
  const [pick, setPick] = useState<Record<string, unknown>>({});
  return (
    <div className="space-y-2.5">
      {rows.length ? (
        <div className="flex flex-wrap gap-1.5">
          {rows.map((r) => (
            <span key={r[field]} className="surface-inset inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1 text-xs">
              {r[field]}
              <button type="button" onClick={() => onChange(rows.filter((x) => x[field] !== r[field]))}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${r[field]}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : <p className="text-xs text-muted-foreground">{empty}</p>}
      <div className="form-flat form-single">
        <FrappeForm
          fields={[{ fieldname: field, label, fieldtype: "Link", options: doctype }]}
          values={pick}
          onChange={(_, v) => {
            const value = String(v ?? "");
            if (value && !rows.some((r) => r[field] === value)) onChange([...rows, { [field]: value } as Record<K, string>]);
            setPick({});
          }}
        />
      </div>
    </div>
  );
}

/** The coloured header of a master form: back link, glossy icon, title, Urdu name, chips and a figures box. */
export function FormHero({ backTo, backLabel, icon: Icon, hue, kicker, title, urdu, chips, figures }: {
  backTo: string; backLabel: string; icon: LucideIcon; hue: string; kicker: string; title: string; urdu?: string;
  chips?: ReactNode; figures?: { label: string; value: ReactNode; tone?: string }[];
}) {
  const gradient = ICON_GRADIENT[hue] ?? ICON_GRADIENT.blue;
  return (
    <div className="surface relative overflow-hidden rounded-3xl p-6">
      <div aria-hidden className={cn("pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-gradient-to-br opacity-25 blur-3xl", gradient)} />
      <div aria-hidden className={cn("pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-gradient-to-br opacity-10 blur-3xl", gradient)} />
      <div className="relative flex flex-wrap items-center gap-5">
        <Link to={backTo} className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background/60 text-muted-foreground transition hover:text-foreground" aria-label={backLabel}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className={cn("relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-gradient-to-b text-white shadow-xl ring-1 ring-inset ring-white/25", gradient)}>
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-white/0" />
          <Icon className="relative h-8 w-8 drop-shadow-sm" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{kicker}</p>
          <h1 className="truncate text-2xl font-bold leading-tight">{title}</h1>
          {urdu && <p className="urdu text-left text-lg leading-[2.2] text-muted-foreground" dir="rtl">{urdu}</p>}
          {chips && <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{chips}</div>}
        </div>
        {figures?.length ? (
          <div className="surface-inset flex flex-wrap gap-6 rounded-2xl px-5 py-3 text-center">
            {figures.map((f) => (
              <div key={f.label}><p className={cn("text-2xl font-bold tabular-nums", f.tone)}>{f.value}</p><p className="text-[11px] text-muted-foreground">{f.label}</p></div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A small rounded label for the hero (company, parent, abbreviation …). */
export function HeroChip({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={cn("rounded-full px-2 py-0.5", tone ?? "border border-border bg-background/60")}>{children}</span>;
}

/** Sticky save bar at the bottom of the page. */
export function SaveBar({ isNew, dirty, saving, createLabel, onSave, onCancel, onDelete }: {
  isNew: boolean; dirty: boolean; saving: boolean; createLabel: string; onSave: () => void; onCancel: () => void; onDelete?: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-30 -mx-3 border-t border-border bg-background/90 backdrop-blur sm:-mx-5 lg:-mx-6 dark:border-white/10">
      <div className="flex items-center gap-3 px-6 py-3">
        <span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : isNew ? "Fill in the details and create" : "All changes saved"}</span>
        <div className="ml-auto flex gap-2">
          {!isNew && onDelete && (
            <Button variant="outline" onClick={onDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="create" onClick={onSave} loading={saving} disabled={!isNew && !dirty}>
            <Save className="h-4 w-4" /> {isNew ? createLabel : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
