import { Building2, MapPin, HeartHandshake, User, ClipboardCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils/cn";
import { FieldRenderer, transformLayout, formatReadonly } from "@/components/forms/frappe-form";
import { CRM_PROSPECT_SCRAPE_FIELDS } from "@/components/forms/form-configs";

/** Section-per-card layout — split once from the static field list. */
const SECTIONS = transformLayout(CRM_PROSPECT_SCRAPE_FIELDS);
const SECTION_ICONS: Record<string, typeof Building2> = {
  Identity: Building2,
  Location: MapPin,
  Fundraising: HeartHandshake,
  Contact: User,
  Review: ClipboardCheck,
};

/**
 * The edit form for a scraped prospect, one boxed section per group of fields. Used by the quick-edit
 * dialog on the Prospect Scraper list (`stacked`: one column) and by the full-page view (`grid`: two
 * columns on wide screens, with long text fields spanning both).
 */
export function ProspectScrapeForm({
  values,
  onChange,
  layout = "stacked",
}: {
  values: Record<string, any>;
  onChange: (fieldname: string, value: any) => void;
  layout?: "stacked" | "grid";
}) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {SECTIONS.map((section, si) => {
        const Icon = (section.title && SECTION_ICONS[section.title]) || Building2;
        const fields = section.columns.flat();
        return (
          // A plain solid-ish box, not the shared glass `Card` — nesting Card's translucent/blurred background
          // inside an already-translucent Dialog panel washed out the Input borders (glass-on-glass).
          <div key={si} className="rounded-lg border border-border bg-background/60 p-4">
            {section.title && (
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {section.title}
              </h3>
            )}
            <div className={cn("grid grid-cols-1 gap-y-3", layout === "grid" && "gap-x-6 md:grid-cols-2")}>
              {fields.map((meta) => {
                const span = layout === "grid" && meta.fieldtype === "Text" ? "md:col-span-2" : undefined;
                return meta.read_only ? (
                  <div key={meta.fieldname} className={cn("space-y-1", span)}>
                    <Label>{meta.label}</Label>
                    <div className="min-h-9 whitespace-pre-wrap rounded-md border border-dashed border-border px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                      {formatReadonly(meta, values[meta.fieldname])}
                    </div>
                  </div>
                ) : (
                  <div key={meta.fieldname} className={span}>
                    <FieldRenderer meta={meta} values={values} onChange={onChange} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
