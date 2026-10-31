import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { Camera, Check, Download, Eye, ImageUp, Loader2, RefreshCw, SwitchCamera, Trash2, Upload, X } from "lucide-react";
import { avatarTone } from "@/components/common/avatar-tone";
import { fileURL, humanizeError, uploadFile } from "@/services/frappe";
import { cn, initial } from "@/utils/cn";

const MAX_BYTES = 5 * 1024 * 1024;

/** Validates and uploads one picked image; returns its `/files/...` URL. Attached to the employee when `docname` is given. */
async function uploadPhoto(file: File, docname?: string): Promise<string | undefined> {
  if (!file.type.startsWith("image/")) {
    toast.error("Please choose an image file (JPG, PNG, WebP).");
    return undefined;
  }
  if (file.size > MAX_BYTES) {
    toast.error("Photo must be smaller than 5 MB.");
    return undefined;
  }
  const res = await uploadFile(file, { doctype: "Employee", docname, fieldname: "image", isPrivate: false });
  return res.file_url;
}

/**
 * Take a photo with the device camera (webcam or phone): live preview with a passport-shaped guide, capture, retake,
 * then the frame is cropped to 35 × 45 (portrait) and handed back as a JPEG file. Needs a secure page (https or
 * localhost / *.localhost) and the browser's camera permission.
 */
export function CameraCapture({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const start = async () => {
      setError(null);
      stream.current?.getTracks().forEach((t) => t.stop());
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't open the camera here (it needs https or localhost). Use “From device” instead.");
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (!live) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => undefined); }
      } catch (e) {
        const n = (e as DOMException)?.name;
        setError(n === "NotAllowedError" ? "Camera permission was refused — allow it in the browser's address bar, or use “From device”."
          : n === "NotFoundError" ? "No camera found on this device. Use “From device”." : "Could not start the camera.");
      }
    };
    if (!shot) void start();
    return () => { live = false; };
  }, [facing, shot]);

  useEffect(() => () => { stream.current?.getTracks().forEach((t) => t.stop()); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    // centre crop to passport proportions (35:45 portrait)
    const ratio = 35 / 45;
    let w = v.videoWidth, h = v.videoHeight;
    if (w / h > ratio) w = Math.round(h * ratio); else h = Math.round(w / ratio);
    const sx = (v.videoWidth - w) / 2, sy = (v.videoHeight - h) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = 700; canvas.height = 900;
    const ctx = canvas.getContext("2d")!;
    if (facing === "user") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); } // un-mirror the selfie preview
    ctx.drawImage(v, sx, sy, w, h, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stream.current?.getTracks().forEach((t) => t.stop());
      setShot({ url: URL.createObjectURL(blob), blob });
    }, "image/jpeg", 0.9);
  };

  const use = () => {
    if (!shot) return;
    onCapture(new File([shot.blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-label="Take photo">
      <div className="surface w-full max-w-md overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 dark:border-white/10">
          <p className="flex items-center gap-2 text-sm font-semibold"><Camera className="h-4 w-4 text-primary" /> Take photo</p>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="relative mx-auto my-4 aspect-[35/45] w-64 overflow-hidden rounded-xl bg-black">
          {error ? (
            <p className="flex h-full items-center justify-center p-4 text-center text-xs text-white/80">{error}</p>
          ) : shot ? (
            <img src={shot.url} alt="Captured" className="h-full w-full object-cover" />
          ) : (
            <>
              <video ref={video} playsInline muted className={cn("h-full w-full object-cover", facing === "user" && "-scale-x-100")} />
              {/* face guide */}
              <div aria-hidden className="pointer-events-none absolute inset-x-10 top-8 bottom-16 rounded-[50%] border-2 border-dashed border-white/60" />
              <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] text-white/80">Face in the oval · plain background</p>
            </>
          )}
        </div>
        <div className="flex items-center justify-center gap-2 border-t border-border px-4 py-3 dark:border-white/10">
          {shot ? (
            <>
              <button type="button" onClick={() => setShot(null)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium hover:bg-accent">
                <RefreshCw className="h-4 w-4" /> Retake
              </button>
              <button type="button" onClick={use} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30">
                <Check className="h-4 w-4" /> Use photo
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} disabled={!!error}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium hover:bg-accent disabled:opacity-50" title="Front / back camera">
                <SwitchCamera className="h-4 w-4" /> Switch
              </button>
              <button type="button" onClick={capture} disabled={!!error}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 disabled:opacity-50">
                <Camera className="h-4 w-4" /> Capture
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Full-size photo viewer (passport frame, name, download); Esc or a click outside closes it. */
export function PhotoViewer({ src, name, caption, onClose }: { src: string; name: string; caption?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm" onClick={onClose} role="dialog" aria-label={`Photo of ${name}`}>
      <figure className="relative flex max-h-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-xl bg-white p-2.5 shadow-2xl">
          <img src={fileURL(src)} alt={name} className="aspect-[35/45] max-h-[75vh] w-auto rounded-md object-cover" />
        </div>
        <figcaption className="text-center text-white">
          <p className="text-base font-semibold">{name}</p>
          {caption && <p className="text-xs text-white/70">{caption}</p>}
        </figcaption>
        <div className="flex gap-2">
          <a href={fileURL(src)} download className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white/15 px-3 text-xs font-medium text-white hover:bg-white/25">
            <Download className="h-3.5 w-3.5" /> Download
          </a>
          <button type="button" onClick={onClose} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white/15 px-3 text-xs font-medium text-white hover:bg-white/25">
            <X className="h-3.5 w-3.5" /> Close
          </button>
        </div>
      </figure>
    </div>,
    document.body,
  );
}

/**
 * Employee photo — round, or passport-size (35 × 45 mm proportions) — with a hover overlay to View it full size and to
 * Change it: click to pick a new image, which is uploaded and handed to
 * `onChange` as its file URL (the caller saves it to `Employee.image`). Falls back to coloured initials.
 */
export function EmployeePhoto({
  name,
  src,
  docname,
  onChange,
  size = "lg",
  editable = true,
  passport = false,
  caption,
  className,
}: {
  name: string;
  src?: string;
  /** Saved employee to attach the file to; omit while creating. */
  docname?: string;
  onChange?: (url: string) => void | Promise<void>;
  size?: "sm" | "md" | "lg" | "xl";
  editable?: boolean;
  /** Passport-size frame (portrait 35:45, white mount) instead of a circle. */
  passport?: boolean;
  /** Shown under the photo in the viewer (designation, code …). */
  caption?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // A record can point at a file that no longer exists — show initials instead of a broken image.
  const [failed, setFailed] = useState<string | undefined>();
  const [viewing, setViewing] = useState(false);
  const [shooting, setShooting] = useState(false);
  const sizes = passport
    ? { sm: "h-10 w-8 text-xs", md: "h-[72px] w-14 text-lg", lg: "h-28 w-[88px] text-2xl", xl: "h-40 w-[124px] text-4xl" }
    : { sm: "h-8 w-8 text-xs", md: "h-12 w-12 text-base", lg: "h-20 w-20 text-2xl", xl: "h-28 w-28 text-4xl" };
  const round = passport ? "rounded-md" : "rounded-full";
  const hasPhoto = Boolean(src && failed !== src);

  const pick = async (file?: File) => {
    if (!file || !onChange) return;
    setBusy(true);
    try {
      const url = await uploadPhoto(file, docname);
      if (url) await onChange(url);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className={cn("group relative shrink-0", passport ? "rounded-lg bg-white p-1 shadow-lg ring-1 ring-black/10 dark:ring-white/20" : "rounded-full ring-4 ring-background", className)}>
      <div className={cn("relative overflow-hidden", round, sizes[size])}>
        {hasPhoto ? (
          <img src={fileURL(src!)} alt={name} onError={() => setFailed(src)} className={cn("h-full w-full object-cover", round)} />
        ) : (
          <span className={cn("flex h-full w-full items-center justify-center font-semibold uppercase", round, avatarTone(name))}>
            {initial(name)}
          </span>
        )}
        {(hasPhoto || (editable && onChange)) && (
          <div className={cn("absolute inset-0 flex items-center justify-center gap-1.5 bg-black/55 text-white transition-opacity", round,
            busy ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100", passport ? "flex-col" : "")}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <>
                {hasPhoto && (
                  <button type="button" onClick={() => setViewing(true)} title="View photo" aria-label="View photo"
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium hover:bg-white/20">
                    <Eye className="h-4 w-4" />{passport && size !== "sm" && " View"}
                  </button>
                )}
                {editable && onChange && (
                  <>
                    <button type="button" onClick={() => input.current?.click()} disabled={busy} title="Upload from device" aria-label="Upload from device"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium hover:bg-white/20">
                      <ImageUp className="h-4 w-4" />{passport && size !== "sm" && " Device"}
                    </button>
                    <button type="button" onClick={() => setShooting(true)} disabled={busy} title="Take photo with camera" aria-label="Take photo with camera"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium hover:bg-white/20">
                      <Camera className="h-4 w-4" />{passport && size !== "sm" && " Camera"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {editable && onChange && <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />}
      {viewing && hasPhoto && <PhotoViewer src={src!} name={name} caption={caption} onClose={() => setViewing(false)} />}
      {shooting && <CameraCapture onCapture={(f) => void pick(f)} onClose={() => setShooting(false)} />}
    </div>
  );
}

/** Form field for the create/edit dialog: preview + Upload / Remove buttons, value is the image's file URL. */
export function EmployeePhotoField({ name, value, onChange, docname, passport = false }: { name: string; value?: string; onChange: (url: string) => void; docname?: string;
  /** Large passport-size preview above the buttons (full-page forms). */ passport?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [shooting, setShooting] = useState(false);

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadPhoto(file, docname);
      if (url) onChange(url);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className={cn("flex items-center gap-4 rounded-lg border border-dashed border-input p-3", passport && "w-full justify-center gap-5")}>
      <EmployeePhoto name={name || "?"} src={value} size={passport ? "lg" : "md"} editable={false} passport={passport} className={passport ? "" : "ring-0"} />
      <div className={cn("flex gap-2", passport ? "flex-col items-start" : "flex-wrap")}>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          From device
        </button>
        <button
          type="button"
          onClick={() => setShooting(true)}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          <Camera className="h-3.5 w-3.5" /> Take photo
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
        {passport && <p className="text-[11px] text-muted-foreground">JPG / PNG / WebP<br />up to 5 MB</p>}
      </div>
      {!passport && <p className="ml-auto hidden text-xs text-muted-foreground sm:block">JPG / PNG / WebP, up to 5 MB</p>}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      {shooting && <CameraCapture onCapture={(f) => void pick(f)} onClose={() => setShooting(false)} />}
    </div>
  );
}
