import { cn } from "@/utils/cn";
import logoMarkUrl from "./logo-mark.png";
import logoFullLightUrl from "./logo-full-light.png";
import logoFullDarkUrl from "./logo-full-dark.png";

export function Logo({
  variant = "full",
  onDark = false,
  className,
}: {
  /** "mark" is just the icon glyph; "full" adds the MicroMax wordmark. */
  variant?: "full" | "mark";
  /** Force the light-on-dark lockup, for use on permanently dark surfaces (e.g. the sidebar) rather than following the app's light/dark theme toggle. */
  onDark?: boolean;
  className?: string;
}) {
  if (variant === "mark") {
    return <img src={logoMarkUrl} alt="MicroMax" className={cn("inline-block object-contain", className)} />;
  }

  // Full lockup extracted from the brand artwork (logo-erp.png). Two colorways
  // ship side by side — dark-navy text for light surfaces, white text for dark
  // ones — and the theme toggle picks between them via the `dark:` variants.
  if (onDark) {
    return (
      <img
        src={logoFullDarkUrl}
        alt="MicroMax ERP Pvt. Ltd."
        className={cn("inline-block object-contain", className)}
      />
    );
  }

  return (
    <span className={cn("inline-flex", className)}>
      <img
        src={logoFullLightUrl}
        alt="MicroMax ERP Pvt. Ltd."
        className="h-full w-auto object-contain dark:hidden"
      />
      <img
        src={logoFullDarkUrl}
        alt=""
        aria-hidden
        className="hidden h-full w-auto object-contain dark:block"
      />
    </span>
  );
}
