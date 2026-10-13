import { useCallback } from "react";
import { useFrappeEventListener, useFrappeGetDocList } from "frappe-react-sdk";
import { useAuth } from "@/hooks/useAuth";
import { postCall } from "@/services/frappe";

export interface NotificationLogDoc {
  name: string;
  type: string;
  subject: string;
  document_type?: string;
  document_name?: string;
  from_user?: string;
  read: 0 | 1;
  creation: string;
}

/**
 * Frappe's own notifications for the current user (Notification Log): assignments, mentions, alerts from
 * Notification rules, shares, energy points. Refreshes on Frappe's realtime "notification" event and every 30 s.
 */
export function useNotificationLog() {
  const { currentUser } = useAuth();
  const { data, error, isLoading, mutate } = useFrappeGetDocList<NotificationLogDoc>(
    "Notification Log",
    {
      fields: ["name", "type", "subject", "document_type", "document_name", "from_user", "read", "creation"],
      filters: currentUser ? [["for_user", "=", currentUser]] : [["name", "=", ""]],
      orderBy: { field: "creation", order: "desc" },
      limit: 30,
    },
    currentUser ? `micromax.notification_log.${currentUser}` : null,
    { refreshInterval: 30_000 },
  );
  useFrappeEventListener("notification", () => void mutate());

  const markRead = useCallback(
    async (name?: string) => {
      if (name) await postCall("frappe.desk.doctype.notification_log.notification_log.mark_as_read", { docname: name });
      else await postCall("frappe.desk.doctype.notification_log.notification_log.mark_all_as_read");
      void mutate();
    },
    [mutate],
  );

  const notifications = data ?? [];
  return { notifications, unreadCount: notifications.filter((n) => !n.read).length, isLoading, error, markRead, mutate };
}
