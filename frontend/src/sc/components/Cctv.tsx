/**
 * CCTV on the gate and weighbridge screens (server: sugarcane.api.v1.cctv).
 * - CameraWall: live tiles for the cameras at a place; each tile reloads the camera's picture every ~1.5 s through the server,
 *   so LAN cameras never need to be reachable from the browser.
 * - GrossVsTare: at tare, each photo saved at gross beside the same camera view live now, and the "Same vehicle" tick.
 * - SnapshotStrip: the photos saved for a token at the gate, gross and tare (token page).
 */
import { useQuery } from "@tanstack/react-query";
import { Camera, CameraOff, CheckCircle2, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { get } from "@/sc/lib/api";
import { cn } from "@/sc/lib/utils";

const API = "sugarcane.api.v1.cctv";
export interface Cam { name: string; camera_name: string; view: string; demo?: boolean }
export interface Snap { name: string; stage: string; view: string; photo?: string; taken_at?: string; camera?: string; error?: string }
type Snaps = Record<string, Record<string, Snap>>;

const liveUrl = (camera: string, state: string, t: number) =>
  `/api/method/${API}.live?camera=${encodeURIComponent(camera)}&state=${state}&t=${t}`;

/** One camera, refreshed in place: the next frame is loaded off-screen and swapped in, so the tile never flickers. */
export function LiveCam({ cam, state = "loaded", every = 1500, className }: { cam: Cam; state?: "loaded" | "empty"; every?: number; className?: string }) {
  const [src, setSrc] = useState(() => liveUrl(cam.name, state, Date.now()));
  const [down, setDown] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      const url = liveUrl(cam.name, state, Date.now());
      const img = new Image();
      img.onload = () => { if (alive.current) { setSrc(url); setDown(false); timer = setTimeout(next, every); } };
      img.onerror = () => { if (alive.current) { setDown(true); timer = setTimeout(next, every * 3); } };
      img.src = url;
    };
    timer = setTimeout(next, every);
    return () => { alive.current = false; clearTimeout(timer); };
  }, [cam.name, state, every]);
  return (
    <figure className={cn("relative overflow-hidden rounded-xl border border-zinc-800 bg-black", className)}>
      {down
        ? <div className="flex aspect-video flex-col items-center justify-center gap-1 text-xs text-zinc-400"><CameraOff className="size-6" />{cam.camera_name}<span>no signal</span></div>
        : <img src={src} alt={cam.camera_name} className="aspect-video w-full object-cover" draggable={false} />}
      <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
        <span className={cn("size-2 rounded-full", down ? "bg-zinc-500" : "animate-pulse bg-red-500")} />{down ? "offline" : "live"} · {cam.view}</span>
    </figure>
  );
}

export function useCameras(place: string, terminal?: string | null, depot?: string | null) {
  return useQuery({
    queryKey: ["sc-cctv", place, terminal, depot], staleTime: 60_000,
    enabled: place !== "Weighbridge" || !!terminal,
    queryFn: () => get<Cam[]>(`${API}.cameras`, { place, ...(terminal ? { terminal } : {}), ...(depot ? { depot } : {}) }),
  });
}

/** Live tiles for every camera at the gate / a weighbridge terminal. */
export function CameraWall({ place, terminal, depot, state = "loaded", title, cols = 4 }: {
  place: "Mill Gate" | "Weighbridge" | "Depot Gate"; terminal?: string | null; depot?: string | null; state?: "loaded" | "empty"; title?: string; cols?: 2 | 3 | 4 | 5;
}) {
  const { data: cams } = useCameras(place, terminal, depot);
  if (!cams?.length) return null;
  return (
    <section className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Video className="size-4 text-red-500" />{title ?? `${place} cameras`}
        <span className="ml-auto text-xs font-normal text-muted-foreground">{cams.length} live · a photo of each view is saved with the record{cams.some((c) => c.demo) ? " · demo feed" : ""}</span></div>
      <div className={cn("grid grid-cols-2 gap-2", { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 2: "" }[cols])}>
        {cams.map((c) => <LiveCam key={c.name} cam={c} state={state} />)}
      </div>
    </section>
  );
}

export function useSnapshots(token?: string | null) {
  return useQuery({ queryKey: ["sc-cctv-snaps", token], enabled: !!token, queryFn: () => get<Snaps>(`${API}.snapshots`, { token }) });
}

const at = (s?: string) => (s ? s.slice(11, 19) : "");

/** Tare: the photo saved at gross beside the live camera of the same view, so the weighman sees it is the same vehicle body. */
export function GrossVsTare({ token, terminal, checked, onCheck }: { token: string; terminal?: string | null; checked: boolean; onCheck: (v: boolean) => void }) {
  const { data: snaps } = useSnapshots(token);
  const { data: cams } = useCameras("Weighbridge", terminal);
  const gross = Object.values(snaps?.Gross ?? {}).filter((s) => s.photo);
  if (!gross.length) return null;
  const pairs = gross.map((g) => ({ g, cam: cams?.find((c) => c.view === g.view) })).filter((p) => ["Left", "Right", "Front", "Rear"].includes(p.g.view) || p.cam);
  return (
    <section className={cn("rounded-2xl border-2 bg-card p-3 shadow-sm", checked ? "border-emerald-500" : "border-amber-500")}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold"><Camera className="size-4" />Same vehicle? Gross photos vs live tare cameras
        <span className="text-xs font-normal text-muted-foreground">Check the body, trolley, wheels and number plate side by side — only the load should be gone.</span></div>
      <div className="grid gap-3 lg:grid-cols-2">
        {pairs.map(({ g, cam }) => (
          <div key={g.view} className="rounded-xl border bg-muted/30 p-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.view}</p>
            <div className="grid grid-cols-2 gap-2">
              <figure className="relative overflow-hidden rounded-lg border border-zinc-800 bg-black">
                <img src={g.photo} alt={`gross ${g.view}`} className="aspect-video w-full object-cover" />
                <span className="absolute right-1.5 bottom-1.5 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-bold uppercase text-black">gross · {at(g.taken_at)}</span>
              </figure>
              {cam ? <LiveCam cam={cam} state="empty" className="rounded-lg" />
                : <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">no {g.view.toLowerCase()} camera on this bridge</div>}
            </div>
          </div>
        ))}
      </div>
      <label className={cn("mt-3 flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-semibold", checked ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/50 bg-amber-500/5")}>
        <input type="checkbox" className="size-5 accent-emerald-600" checked={checked} onChange={(e) => onCheck(e.target.checked)} />
        {checked ? <><CheckCircle2 className="size-4" />Same vehicle — body matches the gross photos</> : "Tick when the live cameras show the same vehicle as the gross photos (needed for the tare)"}
      </label>
    </section>
  );
}

const STAGES = ["Gate", "Gross", "Tare"] as const;

/** Every photo saved for a token: gate, gross and tare rows. */
export function SnapshotStrip({ token }: { token: string }) {
  const { data: snaps } = useSnapshots(token);
  const any = STAGES.some((s) => Object.keys(snaps?.[s] ?? {}).length);
  if (!any) return null;
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><Camera className="size-4" />Camera photos</h3>
      <div className="space-y-3">
        {STAGES.filter((s) => Object.keys(snaps?.[s] ?? {}).length).map((s) => (
          <div key={s}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s === "Gate" ? "At the gate (token)" : `${s} weighbridge`}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {Object.values(snaps![s]).map((p) => (
                <a key={p.name} href={p.photo} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-lg border bg-black">
                  {p.photo ? <img src={p.photo} alt={`${s} ${p.view}`} className="aspect-video w-full object-cover transition group-hover:opacity-90" />
                    : <div className="flex aspect-video items-center justify-center p-2 text-center text-[11px] text-zinc-400"><CameraOff className="mr-1 size-4" />{p.error ?? "no photo"}</div>}
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">{p.view} · {at(p.taken_at)}</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
