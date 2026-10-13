import { useState, type ReactNode } from "react";
import { History, LayoutList, Link2 } from "lucide-react";
import { cn } from "@/utils/cn";
import { ConnectionsPanel } from "./connections-panel";
import { ActivityTimeline, DocActionsPanel } from "@/components/common/activity-panel";

type TabId = string;
/** A page-specific tab shown between Details and Connections (e.g. a lead's second contact). */
export interface ExtraPageTab { id: string; label: string; icon: typeof LayoutList; content: ReactNode; badge?: ReactNode }
const TABS: { id: TabId; label: string; icon: typeof LayoutList }[] = [
  { id: "details", label: "Details", icon: LayoutList },
  { id: "connections", label: "Connections", icon: Link2 },
  { id: "activity", label: "Activity", icon: History },
];

/**
 * Tab bar for hand-built detail pages. Drop it right after the page header: the page's own content (every
 * following sibling) is the "Details" tab and is hidden while Connections or Activity is shown
 * (see `.doc-page-tabs[data-active]` in globals.css). The Activity tab carries the record's timeline (with email)
 * and its sidebar: assignments, attachments, tags and sharing.
 */
export function DocPageTabs({ doctype, name, extraTabs = [], initial = "details" }: { doctype: string; name?: string; extraTabs?: ExtraPageTab[]; /** Tab shown first (default "details"). */ initial?: string }) {
  const [active, setActive] = useState<TabId>(initial);
  if (!name) return null;
  // An extra tab that opens first also comes first in the bar.
  const lead = extraTabs.filter((t) => t.id === initial);
  const rest = extraTabs.filter((t) => t.id !== initial);
  const tabs: (typeof TABS[number] & { badge?: ReactNode })[] = [...lead, TABS[0], ...rest, ...TABS.slice(1)];
  const extra = extraTabs.find((t) => t.id === active);
  return (
    <div className="doc-page-tabs space-y-6" data-active={active}>
      <div className="sticky top-14 z-20 -mx-1 overflow-x-auto rounded-xl border border-border bg-card/90 p-1 shadow-sm backdrop-blur scrollbar-thin">
        <div role="tablist" className="flex min-w-max gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active === t.id}
              onClick={() => setActive(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
                active === t.id ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}{t.badge}
            </button>
          ))}
        </div>
      </div>
      {extra?.content}
      {active === "connections" && <ConnectionsPanel doctype={doctype} name={name} />}
      {active === "activity" && (
        // Timeline (comments, changes, emails + "New Email" with the Quill composer) beside Frappe's form
        // sidebar (assigned to, attachments, tags, shared with) — the same features DocFormPage pages show.
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <ActivityTimeline doctype={doctype} docname={name} />
          </div>
          <aside className="xl:sticky xl:top-20">
            <DocActionsPanel doctype={doctype} docname={name} />
          </aside>
        </div>
      )}
    </div>
  );
}
