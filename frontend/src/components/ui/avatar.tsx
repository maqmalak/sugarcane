import { useState } from "react";
import { cn } from "@/utils/cn";
import { initial } from "@/utils/cn";

export function Avatar({ name, src, size = "md", className }: {
  name?: string;
  src?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = { sm: "h-7 w-7 text-xs", md: "h-9 w-9 text-sm", lg: "h-11 w-11 text-base" };
  // A record can point at a file that no longer exists — show initials instead of a broken image.
  const [failed, setFailed] = useState<string | undefined>();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary uppercase",
        sizes[size],
        className,
      )}
      title={name}
    >
      {src && failed !== src ? (
        <img src={src} alt={name ?? "avatar"} onError={() => setFailed(src)} className="h-full w-full rounded-full object-cover" />
      ) : (
        initial(name)
      )}
    </span>
  );
}