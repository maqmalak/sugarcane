import {
  useFrappeGetDocList,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
} from "frappe-react-sdk";
import { todayISO } from "@/utils/dates";
import type { CrmTask } from "@/types/frappe";

const CRM_TASK_FIELDS = [
  "name",
  "title",
  "task_category",
  "description",
  "status",
  "priority",
  "start_date",
  "due_date",
  "assigned_to",
  "reference_doctype",
  "reference_docname",
  "modified",
] as const;

/**
 * CRM Tasks — the follow-up/reminder mechanism for Leads & Deals
 * (`reference_doctype`/`reference_docname` points back at the CRM Lead or
 * CRM Deal). Pass `referenceDoctype`/`referenceDocname` to scope to one
 * record's follow-ups, or omit both for the global Follow-ups page.
 */
export function useCrmTasks(args?: {
  referenceDoctype?: string;
  referenceDocname?: string;
  status?: string[];
  dueBefore?: string;
  limit?: number;
  enabled?: boolean;
  /**
   * "Task" and "Follow-up" both live on this same doctype, distinguished by
   * task_category. A blank/legacy value (rows created before that field
   * existed) is excluded from neither bucket — it still shows up under both
   * — so old data never silently disappears from a list it used to be on.
   */
  category?: "Task" | "Follow-up";
}) {
  const { referenceDoctype, referenceDocname, status, dueBefore, limit = 200, enabled = true, category } = args ?? {};
  const filters: unknown[][] = [];
  if (referenceDoctype) filters.push(["reference_doctype", "=", referenceDoctype]);
  if (referenceDocname) filters.push(["reference_docname", "=", referenceDocname]);
  if (status && status.length > 0) filters.push(["status", "in", status]);
  if (dueBefore) filters.push(["due_date", "<=", dueBefore]);
  if (category === "Task") filters.push(["task_category", "!=", "Follow-up"]);
  if (category === "Follow-up") filters.push(["task_category", "!=", "Task"]);

  return useFrappeGetDocList<CrmTask>(
    "CRM Task",
    {
      fields: CRM_TASK_FIELDS as unknown as (keyof CrmTask)[],
      filters: filters as any,
      limit,
      orderBy: { field: "due_date", order: "asc" },
    },
    enabled ? `micromax.crm.tasks.${JSON.stringify({ referenceDoctype, referenceDocname, status, dueBefore, limit, category })}` : null,
  );
}

/** Create / Update / Delete mutations for CRM Task. */
export function useCrmTaskMutations(onSuccess?: (doc: CrmTask) => void) {
  const create = useFrappeCreateDoc<CrmTask>();
  const update = useFrappeUpdateDoc<CrmTask>();
  const del = useFrappeDeleteDoc();

  return {
    createDoc: async (values: Partial<CrmTask>) => {
      const doc = await create.createDoc("CRM Task", values as CrmTask);
      onSuccess?.(doc);
      return doc;
    },
    updateDoc: async (name: string, values: Partial<CrmTask>) => {
      const doc = await update.updateDoc("CRM Task", name, values);
      onSuccess?.(doc);
      return doc;
    },
    /** Convenience one-liner for the "mark done" / "snooze" quick actions. */
    setStatus: async (name: string, taskStatus: CrmTask["status"]) => {
      const doc = await update.updateDoc("CRM Task", name, { status: taskStatus });
      onSuccess?.(doc);
      return doc;
    },
    reschedule: async (name: string, due_date: string) => {
      const doc = await update.updateDoc("CRM Task", name, { due_date });
      onSuccess?.(doc);
      return doc;
    },
    deleteDoc: (name: string) => del.deleteDoc("CRM Task", name),
    loading: create.loading || update.loading || del.loading,
    error: create.error || update.error || del.error,
  };
}

const OPEN_STATUSES: CrmTask["status"][] = ["Backlog", "Todo", "In Progress"];

/** Splits open tasks into overdue / due-today / upcoming buckets for the Follow-ups page. */
export function bucketCrmTasks(rows: CrmTask[] | undefined) {
  const todayStr = todayISO();
  const overdue: CrmTask[] = [];
  const dueToday: CrmTask[] = [];
  const upcoming: CrmTask[] = [];

  (rows ?? [])
    .filter((t) => OPEN_STATUSES.includes(t.status))
    .forEach((t) => {
      if (!t.due_date) {
        upcoming.push(t);
        return;
      }
      const dueDay = t.due_date.slice(0, 10);
      if (dueDay < todayStr) overdue.push(t);
      else if (dueDay === todayStr) dueToday.push(t);
      else upcoming.push(t);
    });

  return { overdue, dueToday, upcoming };
}
