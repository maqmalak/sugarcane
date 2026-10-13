/**
 * Photo gallery for surveys and growers: thumbnails with caption, time and GPS, and a full-screen viewer (← → keys,
 * Esc to close) that links each photo's coordinates to Google Maps. The panels below feed it:
 * - SurveyPhotos — a Cane Survey's grower photo + field photos (sugarcane.api.v1.survey_map.survey_detail)
 * - GrowerPhotos — a grower's profile photo + every photo from their surveys (sugarcane.api.v1.growers.photos)
 */
import { useFrappeGetCall } from "frappe-react-sdk";
import { Camera, ChevronLeft, ChevronRight, ExternalLink, ImageOff, MapPin, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/sc/lib/utils";

export interface Photo {
  url: string; caption?: string | null; kind?: "grower" | "field"; latitude?: number | null; longitude?: number | null;
  taken_at?: string | null; survey?: string | null;
}

const when = (s?: string | null) => (s ? new Date(s.replace(" ", "T")).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const gmaps = (p: Photo) => `https://www.google.com/maps?q=${p.latitude},${p.longitude}`;

export function PhotoGallery({ photos, empty = "No photos yet", showSurvey = false }: { photos: Photo[]; empty?: string; showSurvey?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (open === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, photos.length]);

  if (!photos.length) {
    return <div className="flex items-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground"><ImageOff className="size-4" />{empty}</div>;
  }
  const cur = open === null ? null : photos[open];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {photos.map((p, i) => (
          <button key={`${p.url}-${i}`} type="button" onClick={() => setOpen(i)}
            className="group relative overflow-hidden rounded-xl border bg-muted text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Thumb url={p.url} alt={p.caption ?? ""} />
            {p.kind === "grower" && (
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white"><UserRound className="size-3" />Grower</span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6 text-white">
              <span className="block truncate text-xs font-semibold">{p.caption || (p.kind === "grower" ? "Grower photo" : "Field photo")}</span>
              <span className="block truncate text-[10px] opacity-80">{when(p.taken_at)}{showSurvey && p.survey ? ` · ${p.survey}` : ""}</span>
            </span>
          </button>
        ))}
      </div>

      {cur && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <div className="flex items-center gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
            <span className="text-sm font-semibold">{cur.caption || (cur.kind === "grower" ? "Grower photo" : "Field photo")}</span>
            <span className="text-xs opacity-70">{open! + 1} / {photos.length}</span>
            <div className="ml-auto flex items-center gap-2">
              <a href={cur.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md bg-white/10 px-2.5 text-xs hover:bg-white/20"><ExternalLink className="size-3.5" />Original</a>
              <button type="button" onClick={() => setOpen(null)} className="grid size-8 place-items-center rounded-md bg-white/10 hover:bg-white/20" aria-label="Close"><X className="size-4" /></button>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-12">
            <img src={cur.url} alt={cur.caption ?? ""} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
            {photos.length > 1 && <>
              <button type="button" aria-label="Previous" onClick={(e) => { e.stopPropagation(); setOpen((open! - 1 + photos.length) % photos.length); }}
                className="absolute left-3 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/25"><ChevronLeft className="size-5" /></button>
              <button type="button" aria-label="Next" onClick={(e) => { e.stopPropagation(); setOpen((open! + 1) % photos.length); }}
                className="absolute right-3 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/25"><ChevronRight className="size-5" /></button>
            </>}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-3 text-xs text-white/80" onClick={(e) => e.stopPropagation()}>
            {cur.taken_at && <span className="inline-flex items-center gap-1"><Camera className="size-3.5" />{when(cur.taken_at)}</span>}
            {cur.latitude && cur.longitude ? (
              <a href={gmaps(cur)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                <MapPin className="size-3.5" />{Number(cur.latitude).toFixed(6)}, {Number(cur.longitude).toFixed(6)}</a>
            ) : <span className="opacity-60">no GPS on this photo</span>}
            {cur.survey && <Link to={`/survey/d/cane-survey/${encodeURIComponent(cur.survey)}`} className="hover:underline" onClick={() => setOpen(null)}>{cur.survey}</Link>}
          </div>
        </div>
      )}
    </>
  );
}

/** A thumbnail that says so when the file is missing on the server instead of showing a broken image. */
function Thumb({ url, alt }: { url: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  return broken
    ? <span className="grid aspect-[4/3] w-full place-items-center text-xs text-muted-foreground"><span className="flex flex-col items-center gap-1"><ImageOff className="size-5" />photo file missing</span></span>
    : <img src={url} alt={alt} loading="lazy" onError={() => setBroken(true)} className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.03]" />;
}

function Panel({ title, sub, children, aside }: { title: string; sub?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Camera className="size-5 text-primary" />
        <h3 className="text-base font-semibold">{title}</h3>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

interface SurveyDetail { grower_photo?: string | null; survey: Record<string, unknown>; photos: Photo[] }

/** Cane Survey form: the grower photo and the field photos, each with GPS and time. */
export function SurveyPhotos({ name }: { name: string }) {
  const { data, isLoading } = useFrappeGetCall<{ message: SurveyDetail }>("sugarcane.api.v1.survey_map.survey_detail", { name }, `sc-survey-photos-${name}`);
  const d = data?.message;
  const s = (d?.survey ?? {}) as Record<string, string | number | null>;
  const photos: Photo[] = [
    ...(s.grower_photo ? [{ url: String(s.grower_photo), kind: "grower" as const, caption: "Grower photo", latitude: Number(s.grower_photo_latitude) || null,
      longitude: Number(s.grower_photo_longitude) || null, taken_at: (s.grower_photo_taken_at as string) ?? null }] : []),
    ...(d?.photos ?? []).map((p) => ({ ...p, kind: "field" as const })),
  ];
  return (
    <Panel title="Photos" sub={isLoading ? "loading…" : `${photos.length} photo${photos.length === 1 ? "" : "s"} · tap one to enlarge`}>
      {isLoading ? <div className="h-32 animate-pulse rounded-xl bg-muted/50" /> : <PhotoGallery photos={photos} empty="No photos were taken on this survey" />}
    </Panel>
  );
}

interface GrowerPhotosData { profile_photo?: string | null; grower_name: string; photos: Photo[]; surveys: number }

/** Grower form: the profile photo, then every photo taken on this grower's surveys. */
export function GrowerPhotos({ name }: { name: string }) {
  const { data, isLoading } = useFrappeGetCall<{ message: GrowerPhotosData }>("sugarcane.api.v1.growers.photos", { grower: name }, `sc-grower-photos-${name}`);
  const d = data?.message;
  return (
    <Panel title="Photos" sub={d ? `${d.photos.length} from ${d.surveys} survey${d.surveys === 1 ? "" : "s"}` : "loading…"}
      aside={d?.profile_photo ? (
        <a href={d.profile_photo} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-3 text-xs hover:bg-accent">
          <img src={d.profile_photo} alt="" className="size-8 rounded-full object-cover" />Profile photo
        </a>
      ) : null}>
      {isLoading ? <div className="h-32 animate-pulse rounded-xl bg-muted/50" /> : <PhotoGallery photos={d?.photos ?? []} showSurvey empty="No photos from this grower's surveys yet" />}
    </Panel>
  );
}

/** Round grower avatar: the photo, or initials on a colour. */
export function GrowerAvatar({ name, photo, className }: { name?: string | null; photo?: string | null; className?: string }) {
  const initials = (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const [broken, setBroken] = useState(false);
  return photo && !broken
    ? <img src={photo} alt="" loading="lazy" onError={() => setBroken(true)} className={cn("rounded-full border object-cover", className)} />
    : <span className={cn("grid place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-[11px] font-bold text-white", className)}>{initials}</span>;
}
