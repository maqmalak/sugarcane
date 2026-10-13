import { useCallback } from "react";
import { useFrappeGetDocList, useFrappeEventListener, useFrappeUpdateDoc } from "frappe-react-sdk";
import { useAuth } from "./useAuth";

export interface CrmNotificationDoc {
  name: string;
  type: string;
  from_user: string;
  to_user: string;
  read: 0 | 1;
  notification_text?: string;
  reference_doctype?: string;
  reference_name?: string;
  creation: string;
}

/**
 * Follow-up/reminder & assignment notifications for the current user
 * (`CRM Notification`, populated by the CRM app's assignment/mention hooks
 * and by our own `crm_reminders` scheduled job).
 *
 * Queries the doctype directly rather than via `crm.api.notifications.
 * get_notifications` — that endpoint hardcodes every row's `reference_doctype`
 * to just `"deal"`/`"lead"` (`"deal" if ... == "CRM Deal" else "lead"`,
 * confirmed in apps/crm/crm/api/notifications.py) regardless of what it
 * actually is, which breaks navigation for our Task/Event reminders (neither
 * a Lead nor a Deal). A direct query gets the real `reference_doctype`/
 * `reference_name` untouched.
 *
 * The server publishes a realtime `crm_notification` socketio event on every
 * insert, which we refetch on immediately — but that socket connection isn't
 * guaranteed (proxying, reconnects, tab left in the background), so a
 * `refreshInterval` poll is the reliable floor under it: worst case the bell
 * count is `POLL_INTERVAL_MS` stale, never stuck indefinitely.
 */
const POLL_INTERVAL_MS = 30_000;

export function useCrmNotifications() {
  const { currentUser } = useAuth();
  const { data, error, isLoading, mutate } = useFrappeGetDocList<CrmNotificationDoc>(
    "CRM Notification",
    {
      fields: ["name", "type", "from_user", "to_user", "read", "notification_text", "reference_doctype", "reference_name", "creation"],
      filters: currentUser ? [["to_user", "=", currentUser]] : [["name", "=", ""]],
      orderBy: { field: "creation", order: "desc" },
      limit: 30,
    },
    currentUser ? `micromax.crm.notifications.${currentUser}` : null,
    { refreshInterval: POLL_INTERVAL_MS },
  );

  useFrappeEventListener("crm_notification", () => {
    void mutate();
  });

  const { updateDoc } = useFrappeUpdateDoc();
  const markRead = useCallback(
    async (name?: string) => {
      const targets = name ? [name] : (data ?? []).filter((n) => !n.read).map((n) => n.name);
      await Promise.all(targets.map((n) => updateDoc("CRM Notification", n, { read: 1 })));
      void mutate();
    },
    [data, updateDoc, mutate],
  );

  const notifications = data ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, isLoading, error, markRead, mutate };
}
