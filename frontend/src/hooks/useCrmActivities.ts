import useSWR from "swr";
import { useFrappeGetDocList, useFrappeCreateDoc } from "frappe-react-sdk";
import { getCrmActivities, addCrmComment, type CrmActivityItem } from "@/services/api";
import type { CrmNote, CrmCallLog } from "@/types/frappe";

export type { CrmActivityItem };

/**
 * Full activity timeline for a Lead or Deal detail page — creation, field
 * changes (added/removed/changed, already human-labeled server-side),
 * comments, communications and attachment log entries, newest first. Backed
 * by `crm.api.activities.get_activities`'s actual return value (`message`,
 * a `[activities, calls, notes, tasks, attachments]` tuple — confirmed live;
 * an earlier pass wrongly assumed `message` came back empty and read raw,
 * unformatted comments off the side-channel `docinfo` bundle instead, so the
 * timeline only ever showed manually-added comments and nothing else).
 * Follow-ups (CRM Task) and Notes (FCRM Note) are still fetched directly by
 * doctype below, the same reliable pattern the rest of this app uses.
 */
export function useCrmActivities(name?: string) {
  const key = name ? `micromax.crm.activities.${name}` : null;
  const { data, error, isLoading, mutate } = useSWR(key, () => getCrmActivities(name!));

  const activities = data?.activities ?? [];
  const comments = activities.filter((a) => a.activity_type === "comment");

  const addComment = async (content: string, referenceDoctype: string) => {
    if (!name) return;
    await addCrmComment(referenceDoctype, name, content);
    void mutate();
  };

  return { activities, comments, isLoading, error, addComment, mutate };
}

/** One line describing a non-comment activity entry (creation/changed/added/removed/communication/attachment_log). */
export function describeCrmActivity(a: CrmActivityItem): string {
  switch (a.activity_type) {
    case "creation":
      return typeof a.data === "string" ? a.data : "created this record";
    case "changed": {
      const d = a.data as { field_label?: string; value?: string; old_value?: string } | undefined;
      return `changed ${d?.field_label ?? "a field"} from "${d?.old_value ?? "—"}" to "${d?.value ?? "—"}"`;
    }
    case "added": {
      const d = a.data as { field_label?: string; value?: string } | undefined;
      return `set ${d?.field_label ?? "a field"} to "${d?.value ?? "—"}"`;
    }
    case "removed": {
      const d = a.data as { field_label?: string; value?: string } | undefined;
      return `cleared ${d?.field_label ?? "a field"} (was "${d?.value ?? "—"}")`;
    }
    case "communication": {
      const d = a.data as { subject?: string } | undefined;
      return `sent an email: ${d?.subject || "(no subject)"}`;
    }
    case "attachment_log": {
      const d = a.data as { type?: string; file_name?: string } | undefined;
      return `${d?.type === "removed" ? "removed" : "attached"} ${d?.file_name || "a file"}`;
    }
    default:
      return "";
  }
}

/** Notes (`FCRM Note`) linked to a Lead or Deal. */
export function useCrmNotes(referenceDoctype: string, referenceDocname?: string) {
  return useFrappeGetDocList<CrmNote>(
    "FCRM Note",
    {
      fields: ["name", "title", "content", "owner", "modified"] as (keyof CrmNote)[],
      filters: referenceDocname
        ? ([
            ["reference_doctype", "=", referenceDoctype],
            ["reference_docname", "=", referenceDocname],
          ] as any)
        : ([["name", "=", ""]] as any),
      limit: 50,
      orderBy: { field: "modified", order: "desc" },
    },
    referenceDocname ? `micromax.crm.notes.${referenceDoctype}.${referenceDocname}` : null,
  );
}

/** Create a Note (`FCRM Note`) linked to a Lead or Deal via reference_doctype/reference_docname. */
export function useCrmNoteMutations(onSuccess?: (doc: CrmNote) => void) {
  const { createDoc: create, loading, error } = useFrappeCreateDoc<CrmNote>();

  const createDoc = async (
    values: Partial<CrmNote>,
    referenceDoctype: string,
    referenceDocname: string,
  ) => {
    const doc = await create("FCRM Note", {
      ...values,
      reference_doctype: referenceDoctype,
      reference_docname: referenceDocname,
    } as CrmNote);
    onSuccess?.(doc);
    return doc;
  };

  return { createDoc, loading, error };
}

/**
 * Call logs (`CRM Call Log`) linked to a Lead or Deal — same reverse-link
 * pattern as useCrmNotes/useCrmTasks: the child doc carries
 * `reference_doctype`/`reference_docname` pointing back at the parent (there
 * is no forward Link field on CRM Lead/CRM Deal for this), so we filter the
 * child doctype by those two fields rather than reading anything off the
 * parent record.
 */
export function useCrmCallLogs(referenceDoctype: string, referenceDocname?: string) {
  return useFrappeGetDocList<CrmCallLog>(
    "CRM Call Log",
    {
      fields: ["name", "from", "to", "type", "status", "duration", "start_time", "caller", "receiver"] as (keyof CrmCallLog)[],
      filters: referenceDocname
        ? ([
            ["reference_doctype", "=", referenceDoctype],
            ["reference_docname", "=", referenceDocname],
          ] as any)
        : ([["name", "=", ""]] as any),
      limit: 50,
      orderBy: { field: "start_time", order: "desc" },
    },
    referenceDocname ? `micromax.crm.calllogs.${referenceDoctype}.${referenceDocname}` : null,
  );
}
