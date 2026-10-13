import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import useSWR from "swr";
import { useFrappeGetDocList, useFrappeGetCall, useFrappeCreateDoc } from "frappe-react-sdk";
import toast from "react-hot-toast";
import { ChevronDown, ChevronRight, Mail, Send, Link2, CalendarDays, ListTodo, Inbox, Paperclip, FileText, Download, MessageCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { RichTextEditor } from "@/components/forms/rich-text-editor";
import { postCall, humanizeError, uploadFile, fileURL, type FrappeFile } from "@/services/frappe";
import { getWhatsAppMessages, sendWhatsAppMessage } from "@/services/api";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import { formatDateTime } from "@/utils/dates";
import { cn } from "@/utils/cn";

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Email row from the Communication doctype (filtered to a document). */
export interface DocEmail {
  name: string;
  subject: string;
  sender: string;
  recipients: string;
  content: string;
  sent_or_received: string;
  creation: string;
}

/** Strip HTML tags & collapse whitespace for a plain-text preview (used for Email bodies and Note content, both stored as HTML by their Text Editor fields). */
export function textPreview(html: string, max = 140): string {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const EMAIL_FIELDS = [
  "name", "subject", "sender", "recipients", "content", "sent_or_received", "creation",
] as const;

/** One entry in a connections group. */
export interface ConnectionItem {
  label: string;
  sub?: string;
  /** Internal route — renders as a link; otherwise a static row. */
  to?: string;
  tone?: "sky" | "indigo" | "amber" | "emerald" | "slate";
}

export interface ConnectionGroup {
  title: string;
  items: ConnectionItem[];
}

const TONE_CHIP: Record<NonNullable<ConnectionItem["tone"]>, string> = {
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
};

export const CONNECTION_ICONS = { mail: Mail, calendar: CalendarDays, task: ListTodo, link: Link2 } as const;

/**
 * Emails attached to a document (Communication.reference_doctype/docname),
 * with an inbox-style list and a compose box. If the backend has no outgoing
 * email account configured, the message is still logged as a sent
 * Communication so the thread is preserved.
 */
export function EmailPanel({
  referenceDoctype,
  referenceDocname,
  referenceDoc,
  defaultRecipient,
  className,
}: {
  referenceDoctype: string;
  referenceDocname?: string;
  /** The full current record (Lead/Deal, all fields) — used as the Jinja
   * context so a selected template's `{{ field }}` placeholders render
   * against real data instead of being sent out as literal `{{ ... }}` text. */
  referenceDoc?: Record<string, any>;
  defaultRecipient?: string;
  className?: string;
}) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState(defaultRecipient ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const { createDoc: logCommunication } = useFrappeCreateDoc();
  const { templates } = useEmailTemplates();

  const applyTemplate = async (templateName: string) => {
    if (!templateName) return;
    try {
      // Render server-side (frappe.render_template against `referenceDoc`)
      // rather than copying the template's raw `{{ field }}` source — a
      // client-side copy would send those placeholders out verbatim instead
      // of the lead/deal's actual field values.
      const rendered = await postCall<{ subject: string; message: string }>(
        "frappe.email.doctype.email_template.email_template.get_email_template",
        { template_name: templateName, doc: referenceDoc ?? { doctype: referenceDoctype, name: referenceDocname } },
      );
      setSubject(rendered.subject ?? "");
      setMessage(rendered.message ?? "");
    } catch (err) {
      toast.error(humanizeError(err));
    }
  };

  const { data: emails, isLoading, mutate } = useFrappeGetDocList<DocEmail>("Communication", {
    fields: [...EMAIL_FIELDS],
    filters: [
      ["reference_doctype", "=", referenceDoctype],
      // Communication's own reference field is `reference_name`, unlike CRM
      // Task/Note/Call Log/Event Participants which all use
      // `reference_docname` — confirmed against the live backend (a filter
      // on `reference_docname` here silently matched nothing).
      ["reference_name", "=", referenceDocname ?? ""],
      ["communication_medium", "=", "Email"],
    ],
    orderBy: { field: "creation", order: "desc" },
    limit: 50,
  }, referenceDocname ? `micromax.doc.emails.${referenceDocname}` : null);

  // Delivery status per email — a "sent" toast only means the Communication
  // was created/queued, not that it was actually delivered (Frappe queues
  // outgoing mail via Email Queue and the scheduler sends it after; SMTP
  // rejections land here as status "Error" with the server's reason). This
  // surfaces that directly on the record instead of it being a silent gap.
  const sentEmailNames = useMemo(
    () => (emails ?? []).filter((e) => e.sent_or_received === "Sent").map((e) => e.name),
    [emails],
  );
  const { data: queueRows, mutate: mutateQueue } = useFrappeGetDocList<{
    communication: string;
    status: string;
    error?: string;
  }>(
    "Email Queue",
    {
      fields: ["communication", "status", "error"],
      filters: [["communication", "in", sentEmailNames]],
      limit: 0,
    },
    sentEmailNames.length ? `micromax.doc.email-queue.${sentEmailNames.join(",")}` : null,
  );
  const queueByCommunication = useMemo(() => {
    const map = new Map<string, { status: string; error?: string }>();
    (queueRows ?? []).forEach((q) => map.set(q.communication, q));
    return map;
  }, [queueRows]);
  const queueBadgeVariant = (status?: string): "success" | "warning" | "destructive" | "outline" => {
    if (status === "Sent") return "success";
    if (status === "Error") return "destructive";
    if (status === "Not Sent" || status === "Sending" || status === "Partially Sent") return "warning";
    return "outline";
  };

  const send = async () => {
    if (!to.trim() || !subject.trim() || !message.trim()) {
      toast.error("To, subject and message are required");
      return;
    }
    setSending(true);
    try {
      await postCall("frappe.core.doctype.communication.email.make", {
        recipients: to.trim(),
        subject: subject.trim(),
        content: message.trim(),
        doctype: referenceDoctype,
        name: referenceDocname,
        send_email: true,
      });
      toast.success("Email sent");
    } catch (err) {
      const msg = humanizeError(err);
      if (/email account|outgoing/i.test(msg)) {
        // No SMTP configured on the backend — log it so the thread is kept.
        try {
          await logCommunication("Communication", {
            communication_type: "Communication",
            communication_medium: "Email",
            sent_or_received: "Sent",
            subject: subject.trim(),
            content: message.trim(),
            recipients: to.trim(),
            reference_doctype: referenceDoctype,
            reference_name: referenceDocname,
          });
          toast.success("No outgoing mail server configured — email logged to the thread");
        } catch (logErr) {
          toast.error(humanizeError(logErr));
        }
      } else {
        toast.error(msg);
      }
    } finally {
      setSending(false);
      setComposeOpen(false);
      setSubject("");
      setMessage("");
      void mutate();
      void mutateQueue();
    }
  };

  return (
    <SectionCard
      title="Emails"
      className={className}
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            title="Refresh delivery status"
            onClick={() => {
              void mutate();
              void mutateQueue();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setComposeOpen(true)}>
            <Mail className="h-3.5 w-3.5" /> Compose
          </Button>
        </div>
      }
    >
      {composeOpen && (
        <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="email-to" className="text-xs">To</Label>
              <Input id="email-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email-subject" className="text-xs">Subject</Label>
              <Input id="email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
            </div>
          </div>
          {templates.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="email-template" className="text-xs">Template</Label>
              <Select id="email-template" defaultValue="" onChange={(e) => void applyTemplate(e.target.value)}>
                <option value="" disabled>Insert a template…</option>
                {templates.map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="email-body" className="text-xs">Message</Label>
            <RichTextEditor
              value={message}
              onChange={setMessage}
              placeholder="Write your email…"
              className="[&_.ql-editor]:min-h-[220px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => void send()} disabled={sending}>
              <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send Email"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading emails…</p>
      ) : (emails ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-4 text-center">
          <Inbox className="h-5 w-5 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">No emails yet — start the conversation.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {(emails ?? []).map((e) => {
            const isOpen = expanded === e.name;
            const queue = e.sent_or_received === "Sent" ? queueByCommunication.get(e.name) : undefined;
            return (
              <li key={e.name} className="rounded-lg border border-border transition-colors hover:bg-accent/40">
                <button
                  type="button"
                  className="flex w-full items-start gap-2 p-3 text-left"
                  onClick={() => setExpanded(isOpen ? null : e.name)}
                >
                  <span className="mt-0.5 rounded-full bg-sky-100 p-1.5 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
                    {e.sent_or_received === "Sent" ? <Send className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{e.subject || "(no subject)"}</span>
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    </span>
                    {!isOpen && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{textPreview(e.content)}</span>
                    )}
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{e.sent_or_received}</Badge>
                      {queue && (
                        <Badge variant={queueBadgeVariant(queue.status)} className="px-1.5 py-0 text-[10px]">
                          {queue.status === "Error" && <AlertTriangle className="h-2.5 w-2.5" />}
                          {queue.status}
                        </Badge>
                      )}
                      <span className="truncate">{e.sent_or_received === "Sent" ? `to ${e.recipients}` : `from ${e.sender}`}</span>
                      <span>· {formatDateTime(e.creation)}</span>
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-border px-3 py-2 text-sm text-foreground/90">
                    <div dangerouslySetInnerHTML={{ __html: e.content }} />
                    {queue?.status === "Error" && queue.error && (
                      <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                        <p className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle className="h-3 w-3" /> Delivery failed</p>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{queue.error}</pre>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/**
 * WhatsApp thread for a Lead/Deal, via the `frappe/whatsapp` app's generic
 * reference-based conversation API (`whatsapp.whatsapp.api.messages`) — no
 * CRM-specific code lives in that app; this panel is the only place that
 * knows a Lead/Deal has a WhatsApp thread at all. Sending throws a clear,
 * user-facing error until a WhatsApp Account is configured (Desk ->
 * WhatsApp Account — access token, phone number ID from Meta's WhatsApp
 * Business Cloud API), which this panel surfaces as a toast rather than a
 * crash.
 */
export function WhatsAppPanel({
  referenceDoctype,
  referenceDocname,
  defaultRecipient,
  className,
}: {
  referenceDoctype: string;
  referenceDocname?: string;
  defaultRecipient?: string;
  className?: string;
}) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState(defaultRecipient ?? "");
  const [message, setMessage] = useState("");

  const key = referenceDocname ? `micromax.doc.whatsapp.${referenceDoctype}.${referenceDocname}` : null;
  const { data: messages, isLoading, mutate } = useSWR(
    key,
    () => getWhatsAppMessages([[referenceDoctype, referenceDocname!]]),
    { refreshInterval: 15_000 },
  );

  const send = async () => {
    if (!to.trim() || !message.trim()) {
      toast.error("To and message are required");
      return;
    }
    setSending(true);
    try {
      await sendWhatsAppMessage({
        to: to.trim(),
        message: message.trim(),
        referenceDoctype,
        referenceDocname,
      });
      toast.success("Message sent");
      setMessage("");
      setComposeOpen(false);
      void mutate();
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <SectionCard
      title="WhatsApp"
      className={className}
      actions={
        <Button size="sm" variant="outline" onClick={() => setComposeOpen((v) => !v)}>
          <MessageCircle className="h-3.5 w-3.5" /> Message
        </Button>
      }
    >
      {composeOpen && (
        <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="space-y-1">
            <Label htmlFor="wa-to" className="text-xs">To</Label>
            <Input id="wa-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="+92 300 1234567" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wa-message" className="text-xs">Message</Label>
            <Textarea id="wa-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your message…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => void send()} disabled={sending}>
              <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading messages…</p>
      ) : !messages?.length ? (
        <div className="flex flex-col items-center gap-1 py-4 text-center">
          <MessageCircle className="h-5 w-5 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">No WhatsApp messages yet — start the conversation.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li
              key={m.name}
              className={cn(
                "max-w-[85%] rounded-lg border border-border px-3 py-2 text-sm",
                m.direction === "Outgoing" ? "ml-auto bg-primary/10" : "bg-muted/40",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{m.message}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>{formatDateTime(m.creation)}</span>
                {m.direction === "Outgoing" && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{m.status}</Badge>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** Card listing everything connected to a record — cross-linked docs, events, tasks. */
export function ConnectionsPanel({
  groups,
  className,
  loading,
}: {
  groups: ConnectionGroup[];
  className?: string;
  loading?: boolean;
}) {
  const total = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);
  return (
    <SectionCard
      title="Connections"
      className={className}
      actions={<Badge variant="outline" className="text-[11px]">{loading ? "…" : total} linked</Badge>}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading connections…</p>
      ) : total === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing connected yet. Link deals, schedule activities or create follow-ups.</p>
      ) : (
        <div className="space-y-4">
          {groups.filter((g) => g.items.length > 0).map((g) => (
            <div key={g.title}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
              <ul className="space-y-1.5">
                {g.items.map((item) => {
                  const body = (
                    <>
                      <span className={`rounded-full p-1.5 ${TONE_CHIP[item.tone ?? "slate"]}`}>
                        <Link2 className="h-3 w-3" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.label}</span>
                        {item.sub && <span className="block truncate text-xs text-muted-foreground">{item.sub}</span>}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </>
                  );
                  const cls = "flex w-full items-center gap-2 rounded-lg border border-border p-2 transition-colors hover:bg-accent/40";
                  return (
                    <li key={`${g.title}-${item.label}-${item.to ?? ""}`}>
                      {item.to ? (
                        <Link to={item.to} className={cls}>{body}</Link>
                      ) : (
                        <div className={cls}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/** Events linked to a document via the Event Participants child table. */
export function useLinkedEvents(referenceDoctype: string, referenceDocname?: string) {
  // Event Participants is a child table (istable=1) — Frappe's permission
  // model for child tables (has_child_permission) checks access against the
  // PARENT doctype, but only if the caller tells it which parent via a
  // `parent` kwarg; without it, the check has nothing to resolve and denies
  // unconditionally for every non-Administrator user (regardless of any
  // DocPerm granted on Event Participants itself — that grant is simply
  // never consulted). useFrappeGetDocList's REST-based query has no way to
  // send that extra kwarg, so this goes through the RPC method call instead
  // (frappe.client.get_list), same as useAuth.tsx's "Has Role" query, which
  // hits this identical child-table gotcha and passes `parent: "User"`.
  const participantsKey = referenceDocname ? `micromax.doc.eventparticipants.${referenceDocname}` : null;
  const { data: participantsResponse, isLoading: participantsLoading, mutate: mutateParticipants } = useFrappeGetCall<{ message: { parent: string }[] }>(
    "frappe.client.get_list",
    {
      doctype: "Event Participants",
      parent: "Event",
      filters: JSON.stringify([
        ["reference_doctype", "=", referenceDoctype],
        ["reference_docname", "=", referenceDocname ?? ""],
      ]),
      fields: JSON.stringify(["parent"]),
      limit_page_length: 50,
    },
    participantsKey,
  );
  const participants = { data: participantsResponse?.message, isLoading: participantsLoading, mutate: mutateParticipants };

  const eventNames = useMemo(
    () => Array.from(new Set((participants.data ?? []).map((p) => p.parent))),
    [participants.data],
  );

  const events = useFrappeGetDocList<{ name: string; subject: string; starts_on: string; event_type: string }>("Event", {
    fields: ["name", "subject", "starts_on", "event_type"],
    filters: [["name", "in", eventNames]],
    orderBy: { field: "starts_on", order: "asc" },
    limit: 50,
  }, eventNames.length ? `micromax.doc.events.${eventNames.join(",")}` : null);

  return {
    events: events.data ?? [],
    isLoading: participants.isLoading || events.isLoading,
    mutate: () => { void participants.mutate(); void events.mutate(); },
  };
}

/**
 * Files attached to a document (core Frappe `File` doctype, filtered by
 * `attached_to_doctype`/`attached_to_name` — the same reverse-link mechanism
 * as reference_doctype/reference_docname on Task/Note/Call Log, just named
 * differently on File). Lists existing attachments and lets the user add
 * more via the standard `upload_file` endpoint.
 */
export function AttachmentsPanel({
  doctype,
  docname,
  className,
}: {
  doctype: string;
  docname?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: files, isLoading, mutate } = useFrappeGetDocList<FrappeFile>(
    "File",
    {
      fields: ["name", "file_name", "file_url", "file_size", "is_private", "creation"],
      filters: docname
        ? [
            ["attached_to_doctype", "=", doctype],
            ["attached_to_name", "=", docname],
          ]
        : [["name", "=", ""]],
      orderBy: { field: "creation", order: "desc" },
      limit: 50,
    },
    docname ? `micromax.doc.files.${doctype}.${docname}` : null,
  );

  const handleFile = async (file: File) => {
    if (!docname) return;
    setUploading(true);
    try {
      await uploadFile(file, { doctype, docname });
      toast.success("File attached");
      void mutate();
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <SectionCard
      title="Attachments"
      className={className}
      actions={
        <>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading || !docname}>
            <Paperclip className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Attach"}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading attachments…</p>
      ) : (files ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No attachments yet.</p>
      ) : (
        <ul className="space-y-2">
          {(files ?? []).map((f) => (
            <li key={f.name} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
              <a
                href={fileURL(f.file_url)}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-2 text-sm hover:underline"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{f.file_name}</span>
              </a>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {formatBytes(f.file_size)}
                <Download className="h-3.5 w-3.5" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

