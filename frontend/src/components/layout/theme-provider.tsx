import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Theme = "light" | "dark";
export type ThemeMode = Theme | "system";

/** Theme for a visitor who hasn't chosen one (no saved choice): dark, whatever the OS setting. */
export const DEFAULT_THEME: Theme = "dark";

/** Colour presets: HSL for light mode and a slightly brighter one for dark mode. */
export const PRESETS: Record<string, { label: string; light: string; dark: string; swatch: string }> = {
  teal: { label: "Teal", light: "173 80% 36%", dark: "173 80% 40%", swatch: "#0d9488" },
  blue: { label: "Blue", light: "221 83% 53%", dark: "217 91% 60%", swatch: "#3b82f6" },
  indigo: { label: "Indigo", light: "239 84% 60%", dark: "234 89% 70%", swatch: "#6366f1" },
  violet: { label: "Violet", light: "262 83% 58%", dark: "258 90% 70%", swatch: "#8b5cf6" },
  rose: { label: "Rose", light: "347 77% 50%", dark: "350 89% 62%", swatch: "#e11d48" },
  amber: { label: "Amber", light: "32 95% 44%", dark: "38 92% 52%", swatch: "#d97706" },
  emerald: { label: "Emerald", light: "160 84% 32%", dark: "158 64% 46%", swatch: "#059669" },
};
const RADII = [0, 0.25, 0.5, 0.75, 1];
const SCALES = [90, 100, 105, 110, 115];

interface Custom { preset: string | null; radius: number | null; scale: number }
const MODE_KEY = "micromax-theme";
const CUSTOM_KEY = "re-theme-custom";

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (key === MODE_KEY ? (v as unknown as T) : (JSON.parse(v) as T));
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    /* storage blocked — the choice just isn't remembered */
  }
}

const systemDark = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
const resolveDark = (mode: ThemeMode) => (mode === "system" ? systemDark() : mode === "dark");

/** Apply mode + customisations to <html>: dark class, colour scheme, --primary/--ring, --radius and root font size. */
export function applyTheme(mode: ThemeMode, custom: Custom) {
  const root = document.documentElement;
  const dark = resolveDark(mode);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  const preset = custom.preset ? PRESETS[custom.preset] : null;
  for (const v of ["--primary", "--ring"]) {
    if (preset) root.style.setProperty(v, dark ? preset.dark : preset.light);
    else root.style.removeProperty(v);
  }
  if (custom.radius !== null) root.style.setProperty("--radius", `${custom.radius}rem`);
  else root.style.removeProperty("--radius");
  root.style.fontSize = custom.scale && custom.scale !== 100 ? `${custom.scale}%` : "";
}

function storedMode(): ThemeMode {
  const v = read<string | null>(MODE_KEY, null);
  return v === "light" || v === "dark" || v === "system" ? v : DEFAULT_THEME;
}
const storedCustom = (): Custom => ({ preset: null, radius: null, scale: 100, ...read<Partial<Custom>>(CUSTOM_KEY, {}) });

/** Keeps "System" in step with the OS setting while the page is open. */
function useSystemListener(mode: ThemeMode, custom: Custom) {
  useEffect(() => {
    if (mode !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system", custom);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [mode, custom]);
}

/** Persist and toggle the app theme (Tailwind "dark" class) — compact button for login / website pages. */
export function ThemeToggle({ initial }: { initial?: Theme }) {
  const [mode, setMode] = useState<ThemeMode>(() => initial ?? storedMode());
  const dark = resolveDark(mode);
  useEffect(() => {
    applyTheme(mode, storedCustom());
    write(MODE_KEY, mode);
  }, [mode]);
  return (
    <Button variant="ghost" size="icon" onClick={() => setMode(dark ? "light" : "dark")} aria-label="Toggle theme" title="Toggle theme">
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}

/** Header theme menu: Light / Dark / System, colour preset, corner radius and text scale — applied live, remembered per browser. */
export function ThemeCustomizer() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ThemeMode>(storedMode);
  const [custom, setCustom] = useState<Custom>(storedCustom);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    applyTheme(mode, custom);
    write(MODE_KEY, mode);
    write(CUSTOM_KEY, custom);
  }, [mode, custom]);
  useSystemListener(mode, custom);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const dark = resolveDark(mode);
  const pill = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${active ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`;

  return (
    <div className="relative" ref={box}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label="Theme and appearance" title="Theme and appearance" aria-expanded={open}>
        {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>
      {open && (
        <div role="dialog" aria-label="Appearance" className="absolute right-0 top-11 z-50 w-72 space-y-4 rounded-xl border bg-popover p-4 text-popover-foreground shadow-2xl">
          <div className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4 text-primary" /> Appearance</div>
          <section className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Theme</p>
            <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
              {([["light", Sun, "Light"], ["dark", Moon, "Dark"], ["system", Monitor, "System"]] as const).map(([m, Icon, label]) => (
                <button key={m} type="button" className={pill(mode === m)} onClick={() => setMode(m)}><Icon className="h-3.5 w-3.5" />{label}</button>
              ))}
            </div>
          </section>
          <section className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Colour</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" title="Default" onClick={() => setCustom((c) => ({ ...c, preset: null }))}
                className="grid h-7 w-7 place-items-center rounded-full border-2 bg-gradient-to-br from-blue-500 to-teal-500 text-white">
                {custom.preset === null && <Check className="h-3.5 w-3.5" />}
              </button>
              {Object.entries(PRESETS).map(([key, p]) => (
                <button key={key} type="button" title={p.label} onClick={() => setCustom((c) => ({ ...c, preset: key }))}
                  className="grid h-7 w-7 place-items-center rounded-full border-2 border-background text-white shadow ring-1 ring-border" style={{ background: p.swatch }}>
                  {custom.preset === key && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Corner radius</p>
            <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
              {RADII.map((r) => (
                <button key={r} type="button" className={pill((custom.radius ?? 0.5) === r)} onClick={() => setCustom((c) => ({ ...c, radius: r }))}>
                  <span className="h-3.5 w-3.5 border-2 border-current" style={{ borderRadius: `${r * 8}px` }} />
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Text scale</p>
            <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
              {SCALES.map((s) => <button key={s} type="button" className={pill(custom.scale === s)} onClick={() => setCustom((c) => ({ ...c, scale: s }))}>{s}%</button>)}
            </div>
          </section>
          <button type="button" className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setMode(DEFAULT_THEME); setCustom({ preset: null, radius: null, scale: 100 }); }}>Reset to defaults</button>
        </div>
      )}
    </div>
  );
}

/** Initializer that reads the persisted theme before first paint (index.html already sets it inline). */
export function applyInitialTheme() {
  applyTheme(storedMode(), storedCustom());
}
