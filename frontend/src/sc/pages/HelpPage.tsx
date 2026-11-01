/**
 * Help (/help?m=<manual> | ?tab=guides): the user manuals for the signed-in person's roles (sugarcane/manuals/*.md, rendered on the
 * server), and the guides (A4 PDFs with screenshots) and demo videos — each manual shows its own guide and video at the top.
 * Managers see everything. Data: sugarcane.api.v1.help.
 */
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, PlayCircle, Printer, Video, X } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "@/sc/components/ui/badge";
import { Button } from "@/sc/components/ui/button";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get } from "@/sc/lib/api";
import { cn } from "@/sc/lib/utils";

const API = "sugarcane.api.v1.help";
interface Entry { slug: string; title: string; roles: string[]; mine: boolean }
interface Guide { slug: string; order: number; title: string; kind: "Guide" | "Video"; summary: string; roles: string[]; pdf_url: string | null; video_url: string | null; mine: boolean }
interface Manual { slug: string; title: string; roles: string[]; html: string; guides: Guide[] }

function VideoModal({ g, onClose }: { g: Guide; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-black shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 bg-zinc-900 px-4 py-2 text-sm text-white"><Video className="size-4 text-teal-400" /><b>{g.title}</b>
          <button type="button" onClick={onClose} className="ml-auto rounded p-1 hover:bg-white/10" title="Close"><X className="size-4" /></button></div>
        <video src={g.video_url!} controls autoPlay className="aspect-video w-full bg-black" />
      </div>
    </div>
  );
}

function GuideCard({ g, onPlay, compact }: { g: Guide; onPlay: (g: Guide) => void; compact?: boolean }) {
  return (
    <section className={cn("flex flex-col rounded-2xl border bg-card shadow-sm", compact ? "p-3" : "p-4")}>
      <div className="flex items-start gap-2">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", g.kind === "Guide" ? "bg-teal-500/10 text-teal-600" : "bg-violet-500/10 text-violet-600")}>
          {g.kind === "Guide" ? <FileText className="size-5" /> : <PlayCircle className="size-5" />}</span>
        <div className="min-w-0 flex-1"><div className="font-semibold">{!compact && <span className="mr-1.5 text-muted-foreground">{g.order}.</span>}{g.title}</div>
          {!compact && <p className="mt-0.5 text-sm text-muted-foreground">{g.summary}</p>}</div>
        {g.mine && <Badge tone="green">yours</Badge>}
      </div>
      <div className={cn("flex flex-wrap gap-2", compact ? "mt-2" : "mt-3")}>
        {g.pdf_url && <a href={g.pdf_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted"><FileText className="size-3.5" />Open guide (PDF)</a>}
        {g.video_url && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onPlay(g)}><PlayCircle className="size-3.5" />Watch video</Button>}
      </div>
      {!compact && <div className="mt-2 flex flex-wrap gap-1">{g.roles.filter((r) => r !== "all").map((r) => <Badge key={r}>{r}</Badge>)}</div>}
    </section>
  );
}

export function HelpPage() {
  const [params, setParams] = useSearchParams();
  const [playing, setPlaying] = useState<Guide | null>(null);
  const loc = useLocation();
  const navigate = useNavigate();
  const tab = loc.pathname.endsWith("/guides") || params.get("tab") === "guides" ? "guides" : "manuals";
  const goTab = (k: "manuals" | "guides") => navigate(k === "guides" ? "/help/guides" : "/help", { replace: true });
  const list = useQuery({ queryKey: ["help"], queryFn: () => get<Entry[]>(`${API}.manuals`) });
  const guides = useQuery({ queryKey: ["help-guides"], queryFn: () => get<Guide[]>(`${API}.guides`) });
  const first = list.data?.find((m) => m.mine && m.slug !== "getting-started")?.slug ?? list.data?.[0]?.slug;
  const slug = params.get("m") || first || "";
  const doc = useQuery({ queryKey: ["help", slug], queryFn: () => get<Manual>(`${API}.manual`, { slug }), enabled: !!slug && tab === "manuals" });
  const ordered = guides.data ?? [];  // the server lists them in the order the work flows
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-600"><BookOpen className="size-4" />Help</div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tab === "guides" ? "Guides & videos" : "User manuals"}</h1>
          <p className="text-sm text-muted-foreground">{tab === "guides" ? "Step-by-step guides with screenshots (PDF, A4) and demo videos, in the order the work flows. Yours are marked." : "What each role does in the ERP, step by step. Yours are marked."}</p>
        </div>
        <div className="ml-auto flex rounded-xl border p-1">
          {([["manuals", "User manuals"], ["guides", `Guides & videos${guides.data ? ` (${guides.data.length})` : ""}`]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => goTab(k)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", tab === k ? "bg-primary/10 text-primary" : "text-muted-foreground")}>{l}</button>))}
        </div>
      </div>

      {tab === "guides" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {!guides.data && <Skeleton className="h-40" />}
          {ordered.map((g) => <GuideCard key={g.slug} g={g} onPlay={setPlaying} />)}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <nav className="h-fit rounded-2xl border bg-card p-2 shadow-sm">
            {!list.data && <Skeleton className="h-64" />}
            {list.data?.map((m) => (
              <button key={m.slug} onClick={() => setParams({ m: m.slug }, { replace: true })}
                className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent", m.slug === slug && "bg-accent font-semibold")}>
                <span>{m.title}</span>{m.mine && <Badge tone="green">yours</Badge>}
              </button>
            ))}
            <button type="button" onClick={() => goTab("guides")}
              className="mt-1 flex w-full items-center gap-2 rounded-lg border-t px-3 py-2 text-left text-sm text-primary hover:bg-accent"><PlayCircle className="size-4" />Guides & videos</button>
          </nav>
          <article className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
            {!doc.data ? <Skeleton className="h-96" /> : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
                  {doc.data.roles.filter((r) => r !== "all").map((r) => <Badge key={r}>{r}</Badge>)}
                  <span className="flex-1" />
                  <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="size-4" />Print</Button>
                </div>
                {doc.data.guides.length > 0 && (
                  <div className="mb-5 grid gap-2 sm:grid-cols-2 print:hidden">
                    {doc.data.guides.map((g) => <GuideCard key={g.slug} g={g} onPlay={setPlaying} compact />)}
                  </div>
                )}
                <div className="manual max-w-3xl space-y-3 text-[15px] leading-7 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-teal-700 dark:[&_h2]:text-teal-400 [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ul]:list-disc [&_ul]:space-y-1 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_strong]:font-semibold [&_table]:my-3 [&_table]:w-full [&_table]:text-sm [&_td]:border-b [&_td]:px-2 [&_td]:py-1.5 [&_th]:border-b [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left"
                  dangerouslySetInnerHTML={{ __html: doc.data.html }} />
              </>
            )}
          </article>
        </div>
      )}
      {playing && <VideoModal g={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
