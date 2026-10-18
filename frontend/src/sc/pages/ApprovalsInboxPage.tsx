import { useState } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import toast from "react-hot-toast";
import { CheckCircle2, Clock, Inbox, Layers, Map as MapIcon, RefreshCw, Workflow, XCircle } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { docUrl } from "@/app/doc-routes";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { notifyDataChanged } from "@/hooks/useRealtime";
import { humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/currency";

interface Pending {
  doctype: string; name: string; state: string; title: string; amount?: number | null; since: string; owner: string;
  actions: string[]; category: "hr" | "workflow" | "overlap" | "indent" | "elp"; workflow?: string | null; survey?: string; other_survey?: string;
}
interface Change { doctype: string; name: string; state: string; by: string; at: string; category: "hr" | "workflow" | "overlap" | "indent" | "elp" }
interface InboxData { pending: Pending[]; recent: Change[]; counts: { pending: number; hr: number; overlap?: number; indent?: number; elp?: number } }

const TABS = [
  { key: "all", label: "All" },
  { key: "indent", label: "Indent batches" },
  { key: "elp", label: "Loads to verify" },
  { key: "overlap", label: "Overlap reviews" },
  { key: "hr", label: "HR approvals" },
  { key: "workflow", label: "Other workflows" },
] as const;

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso.replace(" ", "T")).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function DocLink({ doctype, name, className, children }: { doctype: string; name: string; className?: string; children: React.ReactNode }) {
  const u = docUrl(doctype, name);
  return u.external ? <a href={u.href} className={className}>{children}</a> : <Link to={u.href} className={className}>{children}</Link>;
}

const stateTone = (s: string) =>
  /approv|confirm|complete|accept/i.test(s) ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : /reject|cancel|close/i.test(s) ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
      : "bg-amber-500/10 text-amber-700 dark:text-amber-400";

/** /approvals/inbox — overlap reviews, workflow documents and HR requests waiting for the user's decision, and recent decisions.
 *  Ported from the real-estate app; the server side is sugarcane.api.v1.approvals (overrides mm_core.approvals). */
export function ApprovalsInboxPage() {
  const { company } = useCompanyContext();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading, isValidating, mutate } = useFrappeGetCall<{ message: InboxData }>(
    "mm_core.approvals.get_inbox", { company: company ?? "" }, `mm_core.approvals.${company ?? ""}`,
  );
  const inbox = (data as unknown as { message?: InboxData })?.message;
  const pending = (inbox?.pending ?? []).filter((p) => tab === "all" || p.category === tab);
  const recent = (inbox?.recent ?? []).filter((r) => tab === "all" || r.category === tab);

  const act = async (p: Pending, action: string) => {
    if (/reject/i.test(action) && !window.confirm(`${action} ${p.doctype} ${p.name}?`)) return;
    setBusy(`${p.doctype}|${p.name}`);
    try {
      await postCall("mm_core.approvals.act", { doctype: p.doctype, name: p.name, action });
      toast.success(`${p.name}: ${action}`);
      notifyDataChanged();
      await mutate();
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Approvals inbox"
        subtitle="Indent batches, overlapping fields, workflow documents and HR requests waiting for your decision, and what changed recently"
        icon={<Inbox className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Link to="/survey/d/survey-overlap-review" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted">
              <Layers className="h-4 w-4" /> All overlap reviews
            </Link>
            <Button variant="outline" onClick={() => void mutate()} disabled={isValidating}>
              <RefreshCw className={cn("h-4 w-4", isValidating && "animate-spin")} /> Refresh
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const n = !inbox ? undefined : t.key === "all" ? inbox.counts.pending : t.key === "hr" ? inbox.counts.hr
            : t.key === "overlap" ? inbox.counts.overlap ?? 0 : t.key === "indent" ? inbox.counts.indent ?? 0 : t.key === "elp" ? inbox.counts.elp ?? 0
            : inbox.counts.pending - inbox.counts.hr - (inbox.counts.overlap ?? 0) - (inbox.counts.indent ?? 0) - (inbox.counts.elp ?? 0);
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                tab === t.key ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
              {t.label}{n !== undefined ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-0">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Clock className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold">Waiting for you</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{pending.length}</span>
          </div>
          {isLoading && !inbox ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
          ) : pending.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing is waiting for you{tab === "hr" ? " in HR" : ""}.</p>
          ) : (
            <ul className="divide-y divide-border">
              {pending.map((p) => {
                const key = `${p.doctype}|${p.name}`;
                return (
                  <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <div className="min-w-[18rem] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <DocLink doctype={p.doctype} name={p.name} className="text-xs font-semibold hover:underline">{p.name}</DocLink>
                        <span className="text-[11px] text-muted-foreground">{p.doctype}</span>
                        <span className={cn("rounded px-1.5 text-[10px] font-medium", stateTone(p.state))}>{p.state}</span>
                        {p.category === "elp" && <span className="rounded bg-orange-500/10 px-1.5 text-[10px] font-medium text-orange-700 dark:text-orange-400">ELP</span>}
                        {p.category === "indent" && <span className="rounded bg-violet-500/10 px-1.5 text-[10px] font-medium text-violet-700 dark:text-violet-400">Indents</span>}
                        {p.category === "overlap" && <span className="rounded bg-rose-500/10 px-1.5 text-[10px] font-medium text-rose-700 dark:text-rose-400">Overlap</span>}
                        {p.category === "hr" && <span className="rounded bg-violet-500/10 px-1.5 text-[10px] font-medium text-violet-700 dark:text-violet-400">HR</span>}
                      </div>
                      <div className={cn("mt-0.5 text-[11px] text-muted-foreground", p.category !== "overlap" && "truncate")} title={p.title}>
                        {p.title || "—"}{p.amount ? ` · ${formatMoney(p.amount)}` : ""} · {ago(p.since)}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {p.actions.map((a) => (
                        <Button key={a} size="sm" variant={/approv|accept|authoriz/i.test(a) ? "default" : "outline"} className="h-7 px-2.5 text-xs"
                          disabled={busy === key} onClick={() => void act(p, a)}>
                          {/approv|accept|authoriz/i.test(a) ? <CheckCircle2 className="h-3.5 w-3.5" /> : /reject/i.test(a) ? <XCircle className="h-3.5 w-3.5" /> : null}
                          {a}
                        </Button>
                      ))}
                      {p.category === "elp" && (
                        <Link to={`/elp/gate?no=${encodeURIComponent(p.name)}`} className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground">Compare & verify</Link>
                      )}
                      {p.category === "overlap" && p.survey && (
                        <Link to={`/survey/map?focus=${encodeURIComponent(p.survey)}&from=${encodeURIComponent("/approvals/inbox")}`}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs hover:bg-muted"><MapIcon className="h-3.5 w-3.5" />Map</Link>
                      )}
                      <DocLink doctype={p.doctype} name={p.name} className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs hover:bg-muted">Review</DocLink>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-0">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Workflow className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Recent decisions</h2>
            <span className="text-[10px] text-muted-foreground">last 30 days</span>
          </div>
          {recent.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No workflow changes yet.</p>
          ) : (
            <ol className="max-h-[640px] space-y-0.5 overflow-y-auto p-2 scrollbar-thin">
              {recent.map((r, i) => (
                <li key={`${r.doctype}|${r.name}|${r.at}|${i}`}>
                  <DocLink doctype={r.doctype} name={r.name} className="flex items-start gap-2 rounded-md p-2 hover:bg-muted/50">
                    <span className={cn("mt-0.5 rounded px-1.5 text-[10px] font-medium", stateTone(r.state))}>{r.state}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{r.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{r.doctype} · {r.by} · {ago(r.at)}</span>
                    </span>
                  </DocLink>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
