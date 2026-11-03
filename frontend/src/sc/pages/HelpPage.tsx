/**
 * Help centre (/help?m=<manual> | /help/guides): the user manuals for the signed-in person's roles (sugarcane/manuals/*.md,
 * rendered on the server), and the guides (A4 PDFs with screenshots) and demo videos, grouped by the stage of the work.
 * Each manual shows its own guide and video at the top. Managers see everything. Data: sugarcane.api.v1.help.
 */
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight, Banknote, BookOpen, Calculator, ClipboardList, Coins, Crown, DoorOpen, Factory, FileText, Filter, FlaskConical, HandCoins,
  Landmark, LifeBuoy, Link2, ListTree, type LucideIcon, Map as MapIcon, Network, Package, PieChart, PlayCircle, Printer, Rocket, Scale, Search,
  Settings2, ShoppingCart, Sparkles, Truck, UserCog, Users, Video, Warehouse, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Skeleton } from "@/sc/components/ui/skeleton";
import { get } from "@/sc/lib/api";
import { cn } from "@/sc/lib/utils";

const API = "sugarcane.api.v1.help";
interface Entry { slug: string; title: string; roles: string[]; mine: boolean }
interface Guide { slug: string; order: number; stage: string; title: string; kind: "Guide" | "Video"; summary: string; roles: string[]; pdf_url: string | null; video_url: string | null; mine: boolean }
interface Manual { slug: string; title: string; roles: string[]; html: string; guides: Guide[] }

/** Colour tokens: a soft gradient cover, a solid icon tile, and the text colour, per hue. */
const HUE = {
  sky: { cover: "from-sky-500/25 via-sky-500/10 to-transparent", tile: "bg-gradient-to-br from-sky-400 to-sky-600", text: "text-sky-600 dark:text-sky-400" },
  emerald: { cover: "from-emerald-500/25 via-emerald-500/10 to-transparent", tile: "bg-gradient-to-br from-emerald-400 to-emerald-600", text: "text-emerald-600 dark:text-emerald-400" },
  teal: { cover: "from-teal-500/25 via-teal-500/10 to-transparent", tile: "bg-gradient-to-br from-teal-400 to-teal-600", text: "text-teal-600 dark:text-teal-400" },
  amber: { cover: "from-amber-500/25 via-amber-500/10 to-transparent", tile: "bg-gradient-to-br from-amber-400 to-orange-500", text: "text-amber-600 dark:text-amber-400" },
  orange: { cover: "from-orange-500/25 via-orange-500/10 to-transparent", tile: "bg-gradient-to-br from-orange-400 to-red-500", text: "text-orange-600 dark:text-orange-400" },
  violet: { cover: "from-violet-500/25 via-violet-500/10 to-transparent", tile: "bg-gradient-to-br from-violet-400 to-purple-600", text: "text-violet-600 dark:text-violet-400" },
  fuchsia: { cover: "from-fuchsia-500/25 via-fuchsia-500/10 to-transparent", tile: "bg-gradient-to-br from-fuchsia-400 to-pink-600", text: "text-fuchsia-600 dark:text-fuchsia-400" },
  rose: { cover: "from-rose-500/25 via-rose-500/10 to-transparent", tile: "bg-gradient-to-br from-rose-400 to-rose-600", text: "text-rose-600 dark:text-rose-400" },
  indigo: { cover: "from-indigo-500/25 via-indigo-500/10 to-transparent", tile: "bg-gradient-to-br from-indigo-400 to-indigo-600", text: "text-indigo-600 dark:text-indigo-400" },
  blue: { cover: "from-blue-500/25 via-blue-500/10 to-transparent", tile: "bg-gradient-to-br from-blue-400 to-blue-600", text: "text-blue-600 dark:text-blue-400" },
  lime: { cover: "from-lime-500/25 via-lime-500/10 to-transparent", tile: "bg-gradient-to-br from-lime-400 to-green-600", text: "text-lime-700 dark:text-lime-400" },
  slate: { cover: "from-slate-500/25 via-slate-500/10 to-transparent", tile: "bg-gradient-to-br from-slate-400 to-slate-600", text: "text-slate-600 dark:text-slate-300" },
} as const;
type Hue = keyof typeof HUE;

const STAGE_HUE: Record<string, Hue> = {
  "Start here": "sky", "Survey & cane intake": "emerald", "Payments & loans": "amber", "Mill: lab, production & costing": "violet", "Printed documents": "slate",
};
const GUIDE_ICON: Record<string, [LucideIcon, Hue]> = {
  "process-flow-dfd": [Network, "sky"], setup: [Settings2, "blue"], "e-survey": [MapIcon, "emerald"], indenting: [ClipboardList, "teal"], elp: [Truck, "orange"],
  "gate-gross-tare": [Scale, "indigo"], "video-one-indent": [DoorOpen, "teal"], "video-gate-circles": [Users, "teal"], "video-depot": [Warehouse, "lime"],
  "cash-counter": [Banknote, "amber"], "grower-payments": [Landmark, "amber"], "video-bank": [Coins, "orange"], "grower-loans": [HandCoins, "rose"],
  laboratory: [FlaskConical, "violet"], costing: [PieChart, "fuchsia"], "video-production": [Factory, "violet"], "print-documents": [Printer, "slate"],
};
const MANUAL_ICON: Record<string, [LucideIcon, Hue]> = {
  "getting-started": [Rocket, "sky"], setup: [Settings2, "blue"], surveyor: [MapIcon, "emerald"], "circle-officer": [Users, "teal"],
  indenting: [ClipboardList, "teal"], elp: [Truck, "orange"], gate: [DoorOpen, "indigo"], weighbridge: [Scale, "indigo"], cashier: [Banknote, "amber"],
  depot: [Warehouse, "lime"], laboratory: [FlaskConical, "violet"], "cane-accountant": [Calculator, "rose"], "cost-accountant": [PieChart, "fuchsia"],
  stores: [Package, "amber"], sales: [ShoppingCart, "fuchsia"], finance: [Landmark, "emerald"], hr: [UserCog, "rose"], management: [Crown, "amber"],
};
const guideLook = (g: Guide): [LucideIcon, Hue] => GUIDE_ICON[g.slug] ?? [g.kind === "Video" ? PlayCircle : FileText, STAGE_HUE[g.stage] ?? "slate"];
const manualLook = (slug: string): [LucideIcon, Hue] => MANUAL_ICON[slug] ?? [BookOpen, "slate"];
/** Shareable addresses: the help pages live under /sugar (the router basename). */
const BASE = `${window.location.origin}/sugar`;
const guideLink = (slug: string) => `${BASE}/help/guides?g=${slug}`;
const videoLink = (slug: string) => `${BASE}/help/guides?g=${slug}&play=1`;
const manualLink = (slug: string) => `${BASE}/help?m=${slug}`;
const absolute = (u: string) => (u.startsWith("http") ? u : `${window.location.origin}${u}`);

/** Copy a link; falls back to a hidden text box where the clipboard API is blocked (plain http). */
function copy(text: string) {
  const done = () => toast.success("Link copied");
  if (navigator.clipboard && window.isSecureContext) { void navigator.clipboard.writeText(text).then(done); return; }
  const t = document.createElement("textarea");
  t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
  document.body.appendChild(t); t.select();
  try { document.execCommand("copy"); done(); } finally { t.remove(); }
}

function CopyBtn({ url, label, className }: { url: string; label?: string; className?: string }) {
  return (
    <button type="button" onClick={() => copy(url)} title={`Copy link: ${url}`}
      className={cn("inline-flex items-center justify-center gap-1.5 rounded-lg border bg-background/85 px-2 py-1.5 text-xs font-semibold hover:bg-accent", className)}>
      <Link2 className="size-3.5" />{label}</button>
  );
}

const match = (q: string, ...text: (string | undefined)[]) => !q || text.some((t) => (t ?? "").toLowerCase().includes(q));

function Tile({ icon: I, hue, size = "md" }: { icon: LucideIcon; hue: Hue; size?: "sm" | "md" | "lg" }) {
  const s = { sm: "size-7 rounded-lg [&_svg]:size-3.5", md: "size-10 rounded-xl [&_svg]:size-5", lg: "size-12 rounded-2xl [&_svg]:size-6" }[size];
  return <span className={cn("grid shrink-0 place-items-center text-white shadow-md ring-1 ring-white/20", HUE[hue].tile, s)}><I strokeWidth={2.2} /></span>;
}

function VideoModal({ g, onClose }: { g: Guide; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  const [I, hue] = guideLook(g);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-6xl overflow-hidden rounded-3xl bg-zinc-950 shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3 text-white">
          <Tile icon={I} hue={hue} size="sm" />
          <div className="min-w-0"><div className="truncate font-semibold">{g.title}</div><div className="truncate text-xs text-white/50">{g.stage}</div></div>
          {g.pdf_url && <a href={g.pdf_url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"><FileText className="size-3.5" />Guide (PDF)</a>}
          <button type="button" onClick={onClose} className={cn("rounded-lg p-1.5 hover:bg-white/10", !g.pdf_url && "ml-auto")} title="Close (Esc)"><X className="size-5" /></button>
        </div>
        <video src={g.video_url!} controls autoPlay className="aspect-video w-full bg-black" />
      </div>
    </div>
  );
}

function GuideCard({ g, onPlay, active }: { g: Guide; onPlay: (g: Guide) => void; active?: boolean }) {
  const [I, hue] = guideLook(g);
  return (
    <article id={`g-${g.slug}`} className={cn("group flex scroll-mt-24 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl", active && "ring-4 ring-primary/50")}>
      <div className={cn("relative flex h-28 items-end gap-3 bg-gradient-to-br p-4", HUE[hue].cover)}>
        <span className={cn("absolute right-4 top-2 text-6xl font-black tabular-nums opacity-[0.12]", HUE[hue].text)}>{String(g.order).padStart(2, "0")}</span>
        <div className="transition-transform duration-200 group-hover:scale-110"><Tile icon={I} hue={hue} size="lg" /></div>
        <div className="flex flex-wrap gap-1 pb-0.5">
          {g.pdf_url && <span className="inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm"><FileText className="size-3" />Guide</span>}
          {g.video_url && <span className="inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm"><Video className="size-3" />Video</span>}
        </div>
        {g.mine && <span className="absolute left-4 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white shadow"><Sparkles className="size-3" />For you</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold leading-snug">{g.title}</h3>
        <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{g.summary}</p>
        <div className="mt-auto pt-4">
          <div className="flex gap-2">
            {g.video_url && <button type="button" onClick={() => onPlay(g)}
              className={cn("inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90", HUE[hue].tile)}><PlayCircle className="size-4" />Watch</button>}
            {g.pdf_url && <a href={g.pdf_url} target="_blank" rel="noreferrer"
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold hover:bg-accent"><FileText className="size-4" />Read<ArrowUpRight className="size-3.5 opacity-60" /></a>}
            <CopyBtn url={guideLink(g.slug)} className="h-9 rounded-xl px-2.5" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {g.roles.filter((r) => r !== "all").slice(0, 4).map((r) => <span key={r} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{r}</span>)}
            {g.roles.includes("all") && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Everyone</span>}
          </div>
        </div>
      </div>
    </article>
  );
}

function MiniGuide({ g, onPlay }: { g: Guide; onPlay: (g: Guide) => void }) {
  const [I, hue] = guideLook(g);
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border bg-gradient-to-br p-3", HUE[hue].cover)}>
      <Tile icon={I} hue={hue} />
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{g.title}</div><div className="truncate text-xs text-muted-foreground">{g.stage}</div></div>
      {g.video_url && <button type="button" onClick={() => onPlay(g)} className="rounded-lg bg-background/85 p-2 shadow-sm hover:bg-background" title="Watch the video"><PlayCircle className="size-4" /></button>}
      {g.pdf_url && <a href={g.pdf_url} target="_blank" rel="noreferrer" className="rounded-lg bg-background/85 p-2 shadow-sm hover:bg-background" title="Open the guide (PDF)"><FileText className="size-4" /></a>}
    </div>
  );
}

/** Every help address in one place, to paste into WhatsApp, email or training notes. */
function LinksTable({ guides, manuals, query }: { guides: Guide[]; manuals: Entry[]; query: string }) {
  const gs = guides.filter((g) => match(query, g.title, g.stage));
  const ms = manuals.filter((m) => match(query, m.title));
  const cell = "px-3 py-2 align-top";
  const Url = ({ url, open }: { url: string; open?: boolean }) => (
    <div className="flex items-center gap-1.5">
      <a href={url} target={open ? "_blank" : undefined} rel="noreferrer" className="min-w-0 truncate font-mono text-xs text-primary hover:underline">{url.replace(/^https?:\/\//, "")}</a>
      <CopyBtn url={url} className="shrink-0 px-1.5 py-1" />
    </div>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <Link2 className="size-5 text-primary" />
        <div className="min-w-0 flex-1 text-sm"><div className="font-semibold">Help centre</div><div className="text-muted-foreground">Share these links. People sign in first, then land on the page.</div></div>
        <Url url={`${BASE}/help`} /><Url url={`${BASE}/help/guides`} />
      </div>
      <section className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3 font-semibold">Guides &amp; videos · {gs.length}</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs"><tr><th className={cell}>#</th><th className={cell}>Title</th><th className={cell}>Page</th><th className={cell}>Guide (PDF)</th><th className={cell}>Video</th></tr></thead>
          <tbody>{gs.map((g) => (
            <tr key={g.slug} className="border-t">
              <td className={cn(cell, "tabular-nums text-muted-foreground")}>{String(g.order).padStart(2, "0")}</td>
              <td className={cn(cell, "min-w-48")}><div className="font-medium">{g.title}</div><div className="text-xs text-muted-foreground">{g.stage}</div></td>
              <td className={cn(cell, "max-w-72")}><Url url={guideLink(g.slug)} /></td>
              <td className={cn(cell, "max-w-72")}>{g.pdf_url ? <Url url={absolute(g.pdf_url)} open /> : <span className="text-muted-foreground">—</span>}</td>
              <td className={cn(cell, "max-w-72")}>{g.video_url ? <Url url={videoLink(g.slug)} /> : <span className="text-muted-foreground">—</span>}</td>
            </tr>))}</tbody>
        </table>
      </section>
      <section className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3 font-semibold">User manuals · {ms.length}</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs"><tr><th className={cell}>Manual</th><th className={cell}>For</th><th className={cell}>Page</th></tr></thead>
          <tbody>{ms.map((m) => (
            <tr key={m.slug} className="border-t">
              <td className={cn(cell, "font-medium")}>{m.title}</td>
              <td className={cn(cell, "text-xs text-muted-foreground")}>{m.roles.includes("all") ? "Everyone" : m.roles.join(", ")}</td>
              <td className={cn(cell, "max-w-80")}><Url url={manualLink(m.slug)} /></td>
            </tr>))}</tbody>
        </table>
      </section>
    </div>
  );
}

/** Give each h2 of the manual an id, and list them for the "On this page" outline. */
function withOutline(html: string) {
  const toc: { id: string; text: string }[] = [];
  const out = html.replace(/<h2([^>]*)>(.*?)<\/h2>/g, (_m, attrs: string, inner: string) => {
    const id = `sec-${toc.length + 1}`;
    toc.push({ id, text: inner.replace(/<[^>]+>/g, "") });
    return `<h2${attrs} id="${id}">${inner}</h2>`;
  });
  return { html: out, toc };
}

export function HelpPage() {
  const [params, setParams] = useSearchParams();
  const [playing, setPlaying] = useState<Guide | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "Guide" | "Video" | "mine" | "links">(params.get("view") === "links" ? "links" : "all");
  const focus = params.get("g");
  const loc = useLocation();
  const navigate = useNavigate();
  const tab = loc.pathname.endsWith("/guides") || params.get("tab") === "guides" ? "guides" : "manuals";
  const goTab = (k: "manuals" | "guides") => navigate(k === "guides" ? "/help/guides" : "/help", { replace: true });
  const list = useQuery({ queryKey: ["help"], queryFn: () => get<Entry[]>(`${API}.manuals`) });
  const guides = useQuery({ queryKey: ["help-guides"], queryFn: () => get<Guide[]>(`${API}.guides`) });
  const first = list.data?.find((m) => m.mine && m.slug !== "getting-started")?.slug ?? list.data?.[0]?.slug;
  const slug = params.get("m") || first || "";
  const doc = useQuery({ queryKey: ["help", slug], queryFn: () => get<Manual>(`${API}.manual`, { slug }), enabled: !!slug && tab === "manuals" });
  const query = q.trim().toLowerCase();

  const all = useMemo(() => guides.data ?? [], [guides.data]);
  const shownGuides = all.filter((g) => match(query, g.title, g.summary, g.stage, g.roles.join(" "))
    && (kind === "all" || (kind === "mine" ? g.mine : kind === "Video" ? !!g.video_url : !!g.pdf_url)));
  const stages = [...shownGuides.reduce((m, g) => m.set(g.stage, [...(m.get(g.stage) ?? []), g]), new Map<string, Guide[]>()).entries()];
  const manuals = (list.data ?? []).filter((m) => match(query, m.title, m.roles.join(" ")));
  const outline = useMemo(() => withOutline(doc.data?.html ?? ""), [doc.data?.html]);
  const counts = { guides: all.filter((g) => g.pdf_url).length, videos: all.filter((g) => g.video_url).length, manuals: list.data?.length ?? 0 };
  const [MI, mhue] = manualLook(slug);

  // ?g=<slug> scrolls to that guide's card; &play=1 also opens its video.
  useEffect(() => {
    if (!focus || !guides.data || tab !== "guides") return;
    const g = guides.data.find((x) => x.slug === focus);
    if (!g) return;
    if (params.get("play") === "1" && g.video_url) setPlaying(g);
    requestAnimationFrame(() => document.getElementById(`g-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [focus, guides.data, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* hero */}
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-gradient-to-br from-violet-500/20 to-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 size-60 rounded-full bg-gradient-to-br from-emerald-500/15 to-amber-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-teal-400 via-emerald-500 to-sky-600 text-white shadow-lg ring-1 ring-white/20"><LifeBuoy className="size-6" strokeWidth={2.2} /></span>
              <div className="text-xs font-semibold uppercase tracking-widest text-primary">Help centre</div>
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">How can we help?</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Manuals for your role, step-by-step guides with screenshots, and demo videos, in the order the work flows.</p>
            <div className="relative mt-4 max-w-xl">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search manuals, guides and videos — e.g. weighbridge, loan, IBAN"
                className="h-11 w-full rounded-xl border bg-background/90 pl-10 pr-10 text-sm shadow-sm outline-none ring-primary/30 backdrop-blur focus:ring-4" />
              {q && <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>}
            </div>
          </div>
          <div className="flex gap-2">
            {([["Manuals", counts.manuals, BookOpen, "sky"], ["Guides", counts.guides, FileText, "emerald"], ["Videos", counts.videos, PlayCircle, "violet"]] as const).map(([l, n, I, h]) => (
              <div key={l} className="min-w-24 rounded-2xl border bg-background/70 px-4 py-3 backdrop-blur">
                <Tile icon={I} hue={h} size="sm" /><div className="mt-2 text-2xl font-bold tabular-nums">{n}</div><div className="text-[11px] text-muted-foreground">{l}</div></div>
            ))}
          </div>
        </div>
        <div className="relative mt-6 inline-flex rounded-xl border bg-background/70 p-1 backdrop-blur">
          {([["manuals", "User manuals", BookOpen], ["guides", "Guides & videos", PlayCircle]] as const).map(([k, l, I]) => (
            <button key={k} type="button" onClick={() => goTab(k)}
              className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors", tab === k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}>
              <I className="size-4" />{l}</button>))}
        </div>
      </section>

      {tab === "guides" ? (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            {([["all", `All · ${all.length}`], ["Guide", `PDF guides · ${counts.guides}`], ["Video", `Videos · ${counts.videos}`], ["mine", `For my roles · ${all.filter((g) => g.mine).length}`], ["links", "Page links"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors", kind === k ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>{l}</button>))}
          </div>
          {!guides.data && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>}
          {guides.data && !shownGuides.length && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nothing matches “{q}”.</div>}
          {kind === "links" ? <LinksTable guides={all} manuals={list.data ?? []} query={query} /> : stages.map(([stage, items], si) => {
            const h = STAGE_HUE[stage] ?? "slate";
            return (
              <section key={stage}>
                <div className="mb-3 flex items-center gap-3">
                  <span className={cn("grid size-8 place-items-center rounded-full text-sm font-bold text-white shadow-md", HUE[h].tile)}>{si + 1}</span>
                  <h2 className="text-lg font-semibold">{stage}</h2>
                  <span className="text-xs text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {items.map((g) => <GuideCard key={g.slug} g={g} onPlay={setPlaying} active={g.slug === focus} />)}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_220px]">
          <nav className="h-fit rounded-2xl border bg-card p-2 shadow-sm lg:sticky lg:top-20">
            <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Manuals · {manuals.length}</div>
            {!list.data && <Skeleton className="h-64" />}
            {manuals.map((m) => {
              const active = m.slug === slug;
              const [I, h] = manualLook(m.slug);
              return (
                <button key={m.slug} type="button" onClick={() => setParams({ m: m.slug }, { replace: true })}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors", active ? "bg-primary/10 font-semibold" : "hover:bg-accent")}>
                  <Tile icon={I} hue={h} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  {m.mine && <span className="size-2 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" title="For your role" />}
                </button>
              );
            })}
            {list.data && !manuals.length && <div className="px-3 py-4 text-xs text-muted-foreground">No manual matches “{q}”.</div>}
            <button type="button" onClick={() => goTab("guides")}
              className="mt-2 flex w-full items-center gap-3 rounded-xl border-t px-2.5 py-2.5 text-left text-sm font-semibold hover:bg-accent">
              <Tile icon={PlayCircle} hue="violet" size="sm" />Guides & videos<ArrowUpRight className="ml-auto size-3.5 text-muted-foreground" /></button>
          </nav>

          <article className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
            {!doc.data ? <div className="p-8"><Skeleton className="h-96" /></div> : (
              <>
                <header className={cn("border-b bg-gradient-to-br px-6 py-5 sm:px-8", HUE[mhue].cover)}>
                  <div className="flex flex-wrap items-start gap-4">
                    <Tile icon={MI} hue={mhue} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-[11px] font-semibold uppercase tracking-wider", HUE[mhue].text)}>User manual</div>
                      <h2 className="mt-0.5 text-2xl font-bold tracking-tight">{doc.data.title}</h2>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {doc.data.roles.filter((r) => r !== "all").map((r) => <span key={r} className="rounded-md border bg-background/70 px-2 py-0.5 text-[11px] font-medium">{r}</span>)}
                        {doc.data.roles.includes("all") && <span className="rounded-md border bg-background/70 px-2 py-0.5 text-[11px] font-medium">Everyone</span>}
                      </div>
                    </div>
                    <CopyBtn url={manualLink(doc.data.slug)} label="Copy link" className="h-9 rounded-xl px-3 text-sm print:hidden" />
                    <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border bg-background px-3 text-sm font-semibold hover:bg-accent print:hidden"><Printer className="size-4" />Print</button>
                  </div>
                  {doc.data.guides.length > 0 && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 print:hidden">
                      {doc.data.guides.map((g) => <MiniGuide key={g.slug} g={g} onPlay={setPlaying} />)}
                    </div>
                  )}
                </header>
                <div className="manual max-w-3xl space-y-3 px-6 py-6 text-[15px] leading-7 sm:px-8 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_h1]:hidden [&_h2]:mt-8 [&_h2]:scroll-mt-24 [&_h2]:border-b [&_h2]:pb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:pl-1 [&_li::marker]:text-primary [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_strong]:font-semibold [&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_td]:border-t [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1.5"
                  dangerouslySetInnerHTML={{ __html: outline.html }} />
              </>
            )}
          </article>

          <aside className="hidden h-fit xl:sticky xl:top-20 xl:block">
            {outline.toc.length > 0 && (
              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><ListTree className="size-3.5" />On this page</div>
                <ol className="space-y-1 border-l pl-3 text-sm">
                  {outline.toc.map((t) => <li key={t.id}><a href={`#${t.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: "smooth" }); }}
                    className="block truncate py-0.5 text-muted-foreground hover:text-primary">{t.text}</a></li>)}
                </ol>
              </div>
            )}
          </aside>
        </div>
      )}
      {playing && <VideoModal g={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
