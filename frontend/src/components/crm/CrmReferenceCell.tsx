import { Link } from "react-router-dom";
import type { CrmReference } from "@/hooks/useCrmReferenceLabels";

function hrefFor(ref: CrmReference, name: string): string {
  return ref.doctype === "CRM Deal" ? `/crm/deals/${encodeURIComponent(name)}` : `/crm/leads/${encodeURIComponent(name)}`;
}

/**
 * Shows a Task/Note/Call Log's linked Lead/Deal as "resolved name" + "reference
 * no.", and — when the reference resolves to a known Lead/Deal — makes it a
 * real link to that record's detail page, not just display text.
 */
export function CrmReferenceCell({
  referenceDocname,
  referenceMap,
  className,
}: {
  referenceDocname?: string;
  referenceMap: Map<string, CrmReference>;
  className?: string;
}) {
  if (!referenceDocname) {
    return <span className={`text-sm text-muted-foreground ${className ?? ""}`}>—</span>;
  }
  const ref = referenceMap.get(referenceDocname);
  if (!ref) {
    // Resolves to neither a known Lead nor Deal (e.g. a different reference
    // doctype, or the record was since deleted) — show it, but as plain text
    // since we can't build a reliable link target.
    return (
      <div className={`min-w-0 ${className ?? ""}`}>
        <p className="truncate text-sm font-medium">{referenceDocname}</p>
      </div>
    );
  }
  return (
    <Link
      to={hrefFor(ref, referenceDocname)}
      onClick={(e) => e.stopPropagation()}
      className={`block min-w-0 ${className ?? ""}`}
    >
      <p className="truncate text-sm font-medium text-primary hover:underline">{ref.label}</p>
      <p className="truncate text-xs text-muted-foreground">{referenceDocname}</p>
    </Link>
  );
}
