import { useMemo } from "react";
import { useFrappeGetDocList } from "frappe-react-sdk";

export interface CrmEmailActivityRow {
  referenceDoctype: string;
  referenceDocname: string;
  received: number;
  replied: number;
  lastActivity?: string;
}

/**
 * Per-lead/deal email activity — "mail received" vs "replied" — aggregated
 * client-side from the core `Communication` doctype (the same one `EmailPanel`
 * reads/writes), filtered to CRM Lead/Deal references. Demo-scale data, so a
 * single bulk fetch + client-side group-by is simpler and cheaper than N
 * per-record queries.
 *
 * Communication's own reference field is `reference_name`, not
 * `reference_docname` (unlike CRM Task/Note/Call Log/Event Participants,
 * which all use `reference_docname`) — confirmed against the live backend:
 * filtering/selecting `reference_docname` here silently returned nothing.
 */
export function useCrmEmailActivity() {
  const { data, isLoading, error, mutate } = useFrappeGetDocList<{
    reference_doctype: string;
    reference_name: string;
    sent_or_received: string;
    creation: string;
  }>(
    "Communication",
    {
      fields: ["reference_doctype", "reference_name", "sent_or_received", "creation"],
      filters: [
        ["reference_doctype", "in", ["CRM Lead", "CRM Deal"]],
        ["communication_medium", "=", "Email"],
      ],
      limit: 5000,
      orderBy: { field: "creation", order: "desc" },
    },
    "micromax.crm.email-activity",
  );

  const rows: CrmEmailActivityRow[] = useMemo(() => {
    const byRef = new Map<string, CrmEmailActivityRow>();
    (data ?? []).forEach((c) => {
      // A handful of demo Communication rows are orphaned (reference_name
      // null) — not attributable to any prospect, so they'd otherwise
      // render a blank-label row.
      if (!c.reference_name) return;
      const key = `${c.reference_doctype}::${c.reference_name}`;
      const existing = byRef.get(key) ?? {
        referenceDoctype: c.reference_doctype,
        referenceDocname: c.reference_name,
        received: 0,
        replied: 0,
      };
      if (c.sent_or_received === "Received") existing.received += 1;
      else existing.replied += 1;
      if (!existing.lastActivity || c.creation > existing.lastActivity) existing.lastActivity = c.creation;
      byRef.set(key, existing);
    });
    return [...byRef.values()].sort((a, b) => b.received + b.replied - (a.received + a.replied));
  }, [data]);

  const totals = useMemo(
    () => ({
      received: rows.reduce((sum, r) => sum + r.received, 0),
      replied: rows.reduce((sum, r) => sum + r.replied, 0),
    }),
    [rows],
  );
  const replyRate = totals.received > 0 ? Math.round((totals.replied / totals.received) * 100) : 0;

  return { rows, totals, replyRate, isLoading, error, mutate };
}
