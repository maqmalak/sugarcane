import { useState, type FormEvent, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AlertCircle, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-provider";
import { Logo } from "@/components/common/logo";
import { useAuth } from "@/hooks/useAuth";
import { humanizeError } from "@/services/frappe";
import { APPS } from "@/app/apps";

const loginApps = APPS.filter((app) => !app.hideOnLogin);

// Honeycomb layout: chunk into rows of 6 so odd rows can be offset half a
// tile-width right, staggering the grid the way Hero.dc.html's mockup does.
// A "logo" tile is spliced into the dead-center slot (row 1, col 2) so the
// brand mark sits in the middle of the honeycomb instead of an app icon.
const HEX_ROW_SIZE = 6;
const LOGO_TILE_INDEX = HEX_ROW_SIZE + 2;
type LoginTile = (typeof loginApps)[number] | "logo";
const loginTiles: LoginTile[] = [
  ...loginApps.slice(0, LOGO_TILE_INDEX),
  "logo",
  ...loginApps.slice(LOGO_TILE_INDEX),
];
const HEX_ROWS = Array.from({ length: Math.ceil(loginTiles.length / HEX_ROW_SIZE) }, (_, i) =>
  loginTiles.slice(i * HEX_ROW_SIZE, i * HEX_ROW_SIZE + HEX_ROW_SIZE),
);

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Your data, your ERPNext",
    description: "Nothing leaves your Frappe backend. Permissions are enforced server-side, always.",
  },
  {
    icon: RefreshCw,
    title: "Live, not cached",
    description: "Every screen reads and writes straight through to your ERPNext instance in real time.",
  },
];

/**
 * Login screen. Uses Frappe session cookies via form-encoded /api/method/login
 * (proxied by Vite to ERPNext). No API keys live in the browser.
 */
export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from || "/";

  // Already signed in (or just finished login) — leave the login screen.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, from]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      // Navigation is handled by the effect above once isAuthenticated flips.
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative grid min-h-screen grid-cols-1 overflow-hidden bg-background dark:bg-transparent lg:grid-cols-5">
      {/* Scoped glass card + drifting-orb treatment for this page only. */}
      <style>{`
        .login-glass {
          background: linear-gradient(135deg, hsl(var(--card) / 0.92), hsl(var(--card) / 0.78));
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          box-shadow: 0 30px 80px -28px hsl(var(--primary) / 0.28), 0 14px 36px -14px rgb(2 6 23 / 0.15);
        }
        .dark .login-glass {
          background: linear-gradient(135deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.03));
          box-shadow: 0 30px 80px -24px hsl(var(--primary) / 0.30), 0 14px 40px -14px rgb(2 6 23 / 0.55);
        }
        @keyframes login-orb-a { 0%, 100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(28px,-20px,0) scale(1.08); } }
        @keyframes login-orb-b { 0%, 100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(-24px,26px,0) scale(0.94); } }
        .login-orb-a { animation: login-orb-a 12s ease-in-out infinite; }
        .login-orb-b { animation: login-orb-b 14s ease-in-out infinite; }
        .hex-tile { clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%); }
      `}</style>

      {/* Ambient glow — same teal/indigo/amber palette used app-wide in dark mode. */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="login-orb-a absolute -top-24 -left-16 h-[420px] w-[420px] rounded-full bg-primary/10 blur-[110px] dark:bg-primary/25" />
        <div className="login-orb-b absolute -bottom-28 right-[8%] h-[380px] w-[380px] rounded-full bg-indigo-400/10 blur-[110px] dark:bg-indigo-500/25" />
        <div className="absolute top-[38%] right-[28%] h-[260px] w-[260px] rounded-full bg-amber-400/5 blur-[100px] dark:bg-amber-400/10" />
      </div>

      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      {/* LEFT — sign-in form */}
      <div className="relative z-10 flex flex-col justify-center px-6 py-12 sm:px-10 lg:col-span-2 lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
            <Logo className="h-15 w-auto" />
            <p className="text-sm text-muted-foreground">
              Sign in with your ERPNext account to continue.
            </p>
          </div>

          <Card className="login-glass border-0">
            <CardContent className="pt-5">
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="username" required>
                    Email / Username
                  </Label>
                  <Input
                    id="username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Administrator"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <Label htmlFor="password" required>
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button type="submit" variant="primary" className="w-full" loading={submitting}>
                  Sign in
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="mt-4 text-center text-xs text-muted-foreground lg:text-left">
            Authentication, permissions and data are managed by ERPNext.
          </p>
        </div>
      </div>

      {/* RIGHT — module showcase (hidden below lg, matches the Desktop app grid) */}
      <div className="relative z-10 hidden overflow-hidden px-12 py-10 lg:col-span-3 lg:flex lg:flex-col lg:justify-center xl:px-16">
        <div className="mb-5 animate-fade-in">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3.5 py-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[11px] font-medium tracking-wide text-emerald-600 dark:text-emerald-400">
              ERPNext-Native
            </span>
          </span>
        </div>

        <h2 className="animate-fade-in text-[32px] font-semibold leading-[1.1] tracking-tight xl:text-[36px]">
          The all-in-one workspace for{" "}
          <span className="bg-gradient-to-r from-primary to-sky-500 bg-clip-text text-transparent">
            apparel import &amp; export
          </span>
        </h2>
        <p className="mt-5 max-w-[440px] animate-fade-in text-[17px] leading-relaxed text-muted-foreground">
          Purchase orders, import shipments, landed costs, LC Proforma, export shipments and
          production — every step synced live against your ERPNext backend.
        </p>

        <div className="mt-6 flex animate-fade-in items-center gap-6">
          {[
            { value: String(loginApps.length), label: "modules" },
            { value: "ERPNext", label: "backend" },
            { value: "Live", label: "real-time sync" },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-[22px] font-semibold tracking-tight">{s.value}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 h-px bg-gradient-to-r from-border via-border to-transparent" />

        {/* Module grid — honeycomb of hexagonal tiles, one per APPS entry
            shown on the post-login Desktop page (minus anything that only
            makes sense once signed in, e.g. Account). */}
        <div className="mt-8 animate-fade-in">
          {HEX_ROWS.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="flex gap-1"
              style={{ marginTop: rowIndex === 0 ? 0 : -19, marginLeft: rowIndex % 2 === 1 ? 44 : 0 }}
            >
              {row.map((tile) => {
                if (tile === "logo") {
                  return (
                    <div
                      key="brand"
                      title="MicroMax Solution"
                      className="hex-tile flex h-24 w-[84px] shrink-0 flex-col items-center justify-center bg-white shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]"
                    >
                      <Logo variant="mark" className="h-10 w-auto" />
                    </div>
                  );
                }
                const app = tile;
                const Icon = app.icon;
                return (
                  <div
                    key={app.id}
                    title={app.label}
                    className="hex-tile flex h-24 w-[84px] shrink-0 flex-col items-center justify-center gap-1.5 border border-border bg-card transition-transform duration-200 hover:-translate-y-1 dark:border-white/10 dark:bg-white/5"
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${app.colorClass}`}>
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span
                      className={`block w-full max-w-[100px] whitespace-normal break-words px-0.5 text-center font-medium leading-[1.15] text-foreground ${
                        app.label.length > 9 ? "text-[9px]" : "text-[10px]"
                      }`}
                    >
                      {app.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-8 grid animate-fade-in grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-2.5">
              <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">{f.title}</p>
                <p className="text-xs text-muted-foreground">{f.description}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs text-muted-foreground">Powered by ERPNext / Frappe</p>
      </div>
    </div>
  );
}
