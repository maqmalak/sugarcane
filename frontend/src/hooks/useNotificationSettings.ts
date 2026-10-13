import { useFrappeGetDoc, useFrappeUpdateDoc } from "frappe-react-sdk";
import { useAuth } from "./useAuth";

/**
 * Core Frappe `Notification Settings` — one document per user (named after
 * the user's id), auto-created on first access. Governs both the in-app
 * "System Notification" feed and which events also send an email (mentions,
 * assignments, document shares, and — directly relevant to the CRM
 * calendar's "Reminder" events — `enable_email_event_reminders`, which gates
 * core Frappe's own daily `send_event_digest()` scheduler job).
 */
export interface NotificationSettingsDoc {
  name: string;
  enabled?: 0 | 1;
  enable_email_notifications?: 0 | 1;
  enable_email_mention?: 0 | 1;
  enable_email_assignment?: 0 | 1;
  enable_email_share?: 0 | 1;
  enable_email_event_reminders?: 0 | 1;
  enable_email_threads_on_assigned_document?: 0 | 1;
}

export function useNotificationSettings() {
  const { currentUser } = useAuth();
  const { data, error, isLoading, mutate } = useFrappeGetDoc<NotificationSettingsDoc>(
    "Notification Settings",
    currentUser ?? undefined,
    currentUser ? `micromax.notification-settings.${currentUser}` : null,
  );

  const { updateDoc: update, loading: saving } = useFrappeUpdateDoc<NotificationSettingsDoc>();

  const save = async (values: Partial<NotificationSettingsDoc>) => {
    if (!currentUser) return;
    const doc = await update("Notification Settings", currentUser, values);
    void mutate();
    return doc;
  };

  return { settings: data, isLoading, error, mutate, save, saving };
}
