import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";
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
 * Round employee photo with a camera overlay: click to pick a new image, which is uploaded and handed to
 * `onChange` as its file URL (the caller saves it to `Employee.image`). Falls back to coloured initials.
 */
export function EmployeePhoto({
  name,
  src,
  docname,
  onChange,
  size = "lg",
  editable = true,
  className,
}: {
  name: string;
  src?: string;
  /** Saved employee to attach the file to; omit while creating. */
  docname?: string;
  onChange?: (url: string) => void | Promise<void>;
  size?: "sm" | "md" | "lg" | "xl";
  editable?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // A record can point at a file that no longer exists — show initials instead of a broken image.
  const [failed, setFailed] = useState<string | undefined>();
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-12 w-12 text-base", lg: "h-20 w-20 text-2xl", xl: "h-28 w-28 text-4xl" };

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
    <div className={cn("group relative shrink-0 rounded-full ring-4 ring-background", sizes[size], className)}>
      {src && failed !== src ? (
        <img src={fileURL(src)} alt={name} onError={() => setFailed(src)} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className={cn("flex h-full w-full items-center justify-center rounded-full font-semibold uppercase", avatarTone(name))}>
          {initial(name)}
        </span>
      )}
      {editable && onChange && (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            title={src ? "Change photo" : "Upload photo"}
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white transition-opacity",
              busy ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
            )}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          </button>
          <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        </>
      )}
    </div>
  );
}

/** Form field for the create/edit dialog: preview + Upload / Remove buttons, value is the image's file URL. */
export function EmployeePhotoField({ name, value, onChange, docname }: { name: string; value?: string; onChange: (url: string) => void; docname?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

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
    <div className="flex items-center gap-4 rounded-lg border border-dashed border-input p-3">
      <EmployeePhoto name={name || "?"} src={value} size="md" editable={false} className="ring-0" />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {value ? "Change photo" : "Upload photo"}
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
      </div>
      <p className="ml-auto hidden text-xs text-muted-foreground sm:block">JPG / PNG / WebP, up to 5 MB</p>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  );
}
