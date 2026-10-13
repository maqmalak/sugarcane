/**
 * A record's activity as a chain of blocks: block #0 is the document's creation, then every change, comment, file,
 * workflow step, email and later-linked document in time order. Each block shows its own hash and the previous
 * block's hash (SHA-256, computed on the server), joined by chain links. Server: sugarcane.api.v1.activity.get_chain.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import {
  ArrowDownUp, ArrowRight, Ban, Blocks, CheckCircle2, FilePlus2, GitBranch, Heart, Info, Mail, MessageSquare, Paperclip,
  PencilLine, Share2, Sparkles, UserPlus, type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDateTime } from "@/utils/dates";
import { cn } from "@/utils/cn";
import { docUrl } from "@/app/doc-routes";
import { SC_DOCS as RE_DOCS, docBase } from "@/sc/registry";

interface Change { field: string; old: string; new: string }
interface ChainBlock {
  index: number; kind: string; title: string; at: string; by: string; by_name: string; changes: Change[]; ref: string;
  text?: string; to?: string; doctype?: string; docname?: string; status?: string; hash: string; prev: string;
}
interface Chain { blocks: ChainBlock[]; counts: Record<string, number>; head: string }

const LOOK: Record<string, { icon: LucideIcon; tone: string; label: string }> = {
  create: { icon: Sparkles, tone: "#6366f1", label: "Genesis" },
  change: { icon: PencilLine, tone: "#0ea5e9", label: "Change" },
  submit: { icon: CheckCircle2, tone: "#10b981", label: "Submitted" },
  cancel: { icon: Ban, tone: "#e11d48", label: "Cancelled" },
  comment: { icon: MessageSquare, tone: "#8b5cf6", label: "Comment" },
  info: { icon: Info, tone: "#64748b", label: "Info" },
  file: { icon: Paperclip, tone: "#f59e0b", label: "File" },
  workflow: { icon: GitBranch, tone: "#14b8a6", label: "Workflow" },
  assign: { icon: UserPlus, tone: "#f97316", label: "Assignment" },
  share: { icon: Share2, tone: "#06b6d4", label: "Share" },
  like: { icon: Heart, tone: "#ec4899", label: "Like" },
  email: { icon: Mail, tone: "#3b82f6", label: "Email" },
  linked: { icon: FilePlus2, tone: "#a855f7", label: "Linked" },
};
const FILTERS: [string, string, string[]][] = [
  ["all", "All", []],
  ["changes", "Changes", ["create", "change", "submit", "cancel"]],
  ["comments", "Comments", ["comment", "info", "workflow", "assign", "share", "like"]],
  ["files", "Files & emails", ["file", "email"]],
  ["linked", "Linked documents", ["linked"]],
];
const RE_SET = new Set(RE_DOCS.map((d) => d.doctype));
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

function linkFor(dt: string, name: string) {
  return RE_SET.has(dt) ? { href: `${docBase(dt)}/${encodeURIComponent(name)}`, external: false } : docUrl(dt, name);
}

export function ActivityChain({ doctype, docname, refreshKey = 0 }: { doctype: string; docname: string; refreshKey?: number }) {
  const { data, isLoading, error } = useFrappeGetCall<{ message: Chain }>(
    "sugarcane.api.v1.activity.get_chain",
    { doctype, name: docname, _r: refreshKey },
    `activity.chain.${doctype}.${docname}.${refreshKey}`,
    { revalidateOnFocus: false },
  );
  const [filter, setFilter] = useState("all");
  const [newest, setNewest] = useState(true);
  const chain = data?.message;
  const blocks = useMemo(() => {
    const kinds = FILTERS.find(([k]) => k === filter)?.[2] ?? [];
    const list = (chain?.blocks ?? []).filter((b) => !kinds.length || kinds.includes(b.kind));
    return newest ? [...list].reverse() : list;
  }, [chain, filter, newest]);

  if (isLoading) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div>;
  if (error || !chain) return <Card className="p-6 text-sm text-destructive">Could not load the activity.</Card>;
  const count = (kinds: string[]) => (kinds.length ? kinds.reduce((a, k) => a + (chain.counts[k] ?? 0), 0) : chain.blocks.length);

  return (
    <Card className="space-y-4 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30"><Blocks className="size-4" /></span>
          <div>
            <h3 className="text-sm font-semibold">Activity chain</h3>
            <p className="text-xs text-muted-foreground">
              {chain.blocks.length} block{chain.blocks.length === 1 ? "" : "s"} · head <code className="font-mono text-[11px] text-foreground">{short(chain.head)}</code>
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setNewest((n) => !n)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted">
          <ArrowDownUp className="size-3.5" /> {newest ? "Newest first" : "Oldest first"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(([k, label, kinds]) => {
          const n = count(kinds);
          return (
            <button key={k} type="button" onClick={() => setFilter(k)} disabled={!n && k !== "all"}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-40",
                filter === k ? "border-primary bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted")}>
              {label}<span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", filter === k ? "bg-white/20" : "bg-muted")}>{n}</span>
            </button>
          );
        })}
      </div>

      {chain.blocks.length <= 1 && (
        <p className="rounded-xl border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Only the genesis block so far — edits, comments, files and linked documents will be added to the chain as they happen.
        </p>
      )}

      <ol className="relative">
        {blocks.map((b, i) => (
          <BlockRow key={`${b.index}-${b.ref}`} b={b} first={i === 0} last={i === blocks.length - 1} />
        ))}
        {!blocks.length && <li className="py-6 text-center text-sm text-muted-foreground">No blocks of this kind.</li>}
      </ol>
    </Card>
  );
}

/** One block: a linked circle on the left rail (icon inside, chain segments above / below), compact wrapping content on the right. */
function BlockRow({ b, first, last }: { b: ChainBlock; first: boolean; last: boolean }) {
  const look = LOOK[b.kind] ?? LOOK.info;
  const Icon = look.icon;
  const genesis = b.kind === "create";
  const target = b.doctype && b.docname ? linkFor(b.doctype, b.docname) : null;
  return (
    <li className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3">
      {/* rail: chain segment, circle link, chain segment */}
      <div aria-hidden className="relative flex justify-center">
        {!first && <span className="absolute left-1/2 top-0 h-2 -translate-x-1/2 border-l-2 border-dashed border-border" />}
        {!last && <span className="absolute bottom-0 left-1/2 top-9 -translate-x-1/2 border-l-2 border-dashed border-border" />}
        <span className="relative z-10 mt-2 grid size-7 place-items-center rounded-full text-white shadow-md ring-[3px] ring-background"
          style={{ background: `linear-gradient(135deg, ${look.tone}, ${look.tone}cc)`, boxShadow: `0 0 0 1.5px ${look.tone}66, 0 2px 6px ${look.tone}40` }}
          title={`${look.label} · ${b.hash}`}>
          <Icon className="size-3.5" />
        </span>
      </div>
      {/* block */}
      <div className={cn("mb-2 min-w-0 rounded-lg border bg-background/60 px-3 py-2 transition hover:bg-muted/40", genesis && "border-indigo-500/30")}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
          <span className="font-mono font-bold tabular-nums text-muted-foreground">#{b.index}</span>
          <span className="text-[13px] font-semibold" style={{ color: look.tone }}>{b.title}</span>
          <span className="text-muted-foreground">by <span className="font-medium text-foreground">{b.by_name}</span>{b.to ? <> → <span className="break-all">{b.to}</span></> : null}</span>
          <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">{formatDateTime(b.at)}</span>
        </div>
        {target && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {target.external ? (
              <a href={target.href} target="_blank" rel="noreferrer" className="break-all font-medium text-primary hover:underline">{b.docname} ↗</a>
            ) : (
              <Link to={target.href} className="break-all font-medium text-primary hover:underline">{b.docname}</Link>
            )}
            {b.status && <StatusBadge status={b.status} className="py-0 text-[10px]" />}
            {b.text && <span className="break-words text-muted-foreground">{b.text}</span>}
          </div>
        )}
        {!target && b.text && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/90">{b.text}</p>}
        {b.changes.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs">
            {b.changes.map((c, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 break-words">
                <span className="font-medium text-muted-foreground">{c.field}:</span>
                {c.old && <span className="break-all rounded bg-rose-500/10 px-1 text-rose-700 line-through decoration-rose-400/60 dark:text-rose-300">{c.old}</span>}
                {c.old && c.new && <ArrowRight className="size-3 shrink-0 self-center text-muted-foreground" />}
                {c.new && <span className="break-all rounded bg-emerald-500/10 px-1 text-emerald-700 dark:text-emerald-300">{c.new}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 font-mono text-[10px] text-muted-foreground/80">
          <span title={b.hash}>{short(b.hash)}</span> ← <span title={b.prev}>{genesis ? "genesis" : short(b.prev)}</span>
        </p>
      </div>
    </li>
  );
}
