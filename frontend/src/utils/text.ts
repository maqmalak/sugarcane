/**
 * Plain text from a string that may hold HTML (e.g. the crm app stores CRM Notification.notification_text as
 * `<div class="…"><span>Corporate Wise</span> assigned …</div>`). Uses the browser's parser — tags dropped,
 * entities decoded, nothing executed (a parsed, never-attached document runs no scripts or handlers).
 */
export function htmlToText(value: string | null | undefined): string {
  if (!value) return "";
  if (!/[<&]/.test(value)) return value;
  const doc = new DOMParser().parseFromString(value, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}
