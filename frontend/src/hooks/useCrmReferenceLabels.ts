import { useMemo } from "react";
import { useFrappeGetDocList } from "frappe-react-sdk";

export interface CrmReference {
  doctype: "CRM Lead" | "CRM Deal";
  label: string;
}

/**
 * Resolves a CRM Task/Note/Call Log's `reference_docname` (the record's own
 * name, e.g. "CRM-LEAD-2026-00002") to a human label (the Lead's `lead_name`
 * or Deal's `organization`) — used for the "Lead/Deal" column on the global
 * Tasks/Notes/Call Logs list & pipeline views, where each row can point at
 * either doctype via the generic reference_doctype/reference_docname pair.
 *
 * One-time bulk fetch of both doctypes' names rather than resolving each row
 * individually — demo-scale data (tens to low hundreds of Leads/Deals), so a
 * full table scan per doctype is cheap and avoids N+1 lookups per row.
 */
export function useCrmReferenceLabels() {
  const { data: leads, isLoading: leadsLoading } = useFrappeGetDocList<{ name: string; lead_name?: string }>(
    "CRM Lead",
    { fields: ["name", "lead_name"], limit: 1000 },
    "micromax.crm.reflabels.leads",
  );
  const { data: deals, isLoading: dealsLoading } = useFrappeGetDocList<{ name: string; organization?: string }>(
    "CRM Deal",
    { fields: ["name", "organization"], limit: 1000 },
    "micromax.crm.reflabels.deals",
  );

  const map = useMemo(() => {
    const m = new Map<string, CrmReference>();
    (leads ?? []).forEach((l) => m.set(l.name, { doctype: "CRM Lead", label: l.lead_name || l.name }));
    (deals ?? []).forEach((d) => m.set(d.name, { doctype: "CRM Deal", label: d.organization || d.name }));
    return m;
  }, [leads, deals]);

  return { referenceMap: map, isLoading: leadsLoading || dealsLoading };
}
