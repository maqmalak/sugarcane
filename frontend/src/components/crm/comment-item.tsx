import { useState } from "react";
import toast from "react-hot-toast";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { humanizeError, postCall } from "@/services/frappe";

/** Stored comment HTML → plain text for the editor (line breaks kept). */
const toText = (html?: string) =>
  (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
const toHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

/**
 * A posted comment on a Lead / Deal timeline. Its author (and Administrator) can edit it in place —
 * saved through Frappe's own `update_comment`, which enforces the same owner-only rule server-side.
 */
export function CrmCommentItem({ name, owner, content, currentUser, onSaved }: {
  name?: string; owner?: string; content?: string; currentUser?: string | null; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const canEdit = Boolean(name) && Boolean(currentUser) && (currentUser === owner || currentUser === "Administrator");

  const start = () => {
    setText(toText(content));
    setEditing(true);
  };
  const save = async () => {
    if (!name || !text.trim()) return;
    setSaving(true);
    try {
      await postCall("frappe.desk.form.utils.update_comment", { name, content: toHtml(text.trim()) });
      toast.success("Comment updated");
      setEditing(false);
      onSaved();
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{owner}</p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[70px]"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
          }}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void save()} disabled={saving || !text.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          <span className="text-[11px] text-muted-foreground">Ctrl+Enter to save · Esc to cancel</span>
        </div>
      </div>
    );
  }
  return (
    <div className="group flex items-start gap-2">
      <p className="min-w-0 flex-1 text-muted-foreground">
        <span className="font-medium text-foreground">{owner}</span>{" "}
        <span dangerouslySetInnerHTML={{ __html: content ?? "" }} />
      </p>
      {canEdit && (
        <button
          type="button"
          onClick={start}
          title="Edit comment"
          aria-label="Edit comment"
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
