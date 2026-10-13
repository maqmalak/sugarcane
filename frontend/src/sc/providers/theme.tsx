import { useEffect, useState } from "react";

/** Follows the host app's theme (the `dark` class on <html>), so the real-estate pages match the rest of the UI. */
export function useTheme(): { dark: boolean } {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return { dark };
}
