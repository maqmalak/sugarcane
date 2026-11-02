import { useState, type FormEvent, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, RefreshCw, ShieldCheck, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-provider";
import { Logo } from "@/components/common/logo";
import { ICON_GRADIENT, hueOf } from "@/components/ui/app-icon";
import { useAuth } from "@/hooks/useAuth";
import { humanizeError } from "@/services/frappe";
import { APPS } from "@/app/apps";
import { cn } from "@/utils/cn";

const loginApps = APPS.filter((app) => !app.hideOnLogin);

const FEATURES = [
  { icon: ShieldCheck, title: "Your data, your ERPNext", description: "Nothing leaves your Frappe backend; permissions are enforced on the server." },
  { icon: RefreshCw, title: "Live, not cached", description: "Every screen reads and writes straight through to ERPNext in real time." },
];

/**
 * Login screen. Uses Frappe session cookies via form-encoded /api/method/login
 * (proxied by Vite to ERPNext). No API keys live in the browser.
 * Left: the sign-in card. Right: the mill's modules as glossy app-icon boxes (the same icons as the Desktop).
 */
export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from || "/home";
  // Frappe sends unauthenticated desk / roster requests here as /login?redirect-to=/desk/... — after login go back
  // there with a full page load (they're Frappe pages, not React routes).
  const redirectTo = new URLSearchParams(location.search).get("redirect-to") ?? "";
  const toFrappe = /^\/(desk|app|hr\/roster|printview)(\/|$|\?)/.test(redirectTo) ? redirectTo : "";

  // Already signed in (or just finished login) — leave the login screen.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (toFrappe) {
        window.location.replace(toFrappe);
        return;
      }
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, from, toFrappe]);

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

  const field = "h-12 w-full rounded-xl border border-input bg-background/80 pl-11 pr-11 text-sm shadow-sm outline-none transition focus:border-primary focus:bg-background focus:ring-4 focus:ring-primary/15";

  return (
    <div className="relative grid min-h-screen grid-cols-1 overflow-hidden bg-background lg:grid-cols-[minmax(420px,5fr)_7fr]">
      <style>{`
        @keyframes login-orb-a { 0%, 100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(30px,-22px,0) scale(1.08); } }
        @keyframes login-orb-b { 0%, 100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(-26px,24px,0) scale(0.94); } }
        @keyframes login-rise { from { opacity: 0; transform: translateY(14px) scale(.96); } to { opacity: 1; transform: none; } }
        @keyframes login-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .login-orb-a { animation: login-orb-a 12s ease-in-out infinite; }
        .login-orb-b { animation: login-orb-b 14s ease-in-out infinite; }
        .login-rise { animation: login-rise .55s cubic-bezier(.2,.8,.2,1) both; }
        .login-float { animation: login-float 5s ease-in-out infinite; }
        .login-card { background: linear-gradient(160deg, hsl(var(--card) / .96), hsl(var(--card) / .86)); backdrop-filter: blur(22px) saturate(160%);
          box-shadow: 0 40px 90px -36px hsl(var(--primary) / .45), 0 18px 40px -20px rgb(2 6 23 / .22), inset 0 1px 0 rgb(255 255 255 / .6); }
        .dark .login-card { background: linear-gradient(160deg, rgb(255 255 255 / .07), rgb(255 255 255 / .03)); box-shadow: 0 40px 90px -30px hsl(var(--primary) / .35), 0 18px 40px -16px rgb(2 6 23 / .6), inset 0 1px 0 rgb(255 255 255 / .08); }
        .login-panel { background: linear-gradient(160deg, rgb(255 255 255 / .75), rgb(255 255 255 / .45)); backdrop-filter: blur(18px); }
        .dark .login-panel { background: linear-gradient(160deg, rgb(255 255 255 / .05), rgb(255 255 255 / .02)); }
      `}</style>

      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="login-orb-a absolute -left-24 -top-32 h-[520px] w-[520px] rounded-full bg-teal-400/25 blur-[120px] dark:bg-teal-500/25" />
        <div className="login-orb-b absolute -bottom-40 right-[6%] h-[480px] w-[480px] rounded-full bg-indigo-400/20 blur-[120px] dark:bg-indigo-500/25" />
        <div className="absolute right-[30%] top-[30%] h-[300px] w-[300px] rounded-full bg-amber-300/20 blur-[110px] dark:bg-amber-400/10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,hsl(var(--foreground)/0.06)_1px,transparent_0)] [background-size:22px_22px]" />
      </div>

      <div className="absolute right-4 top-4 z-20"><ThemeToggle /></div>

      {/* LEFT — sign-in */}
      <div className="relative z-10 flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-14 xl:px-20">
        <div className="login-rise mx-auto w-full max-w-[400px]">
          <div className="mb-7 flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
            <Logo className="h-13 w-auto" />
          </div>

          <div className="login-card relative overflow-hidden rounded-[28px] border border-white/60 p-7 dark:border-white/10 sm:p-8">
            <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-400 via-sky-500 to-indigo-500" />
            <div className="mb-6 flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-lg shadow-teal-500/30 ring-1 ring-white/30">
                <Lock className="size-5" strokeWidth={2.2} />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Welcome back</h1>
                <p className="text-sm text-muted-foreground">Sign in with your ERPNext account</p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email / Username</span>
                <span className="relative block">
                  <User className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)}
                    placeholder="you@mill.com" required autoFocus className={field} />
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</span>
                <span className="relative block">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className={field} />
                  <button type="button" onClick={() => setShow((s) => !s)} title={show ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </span>
              </label>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{error}</span>
                </div>
              )}

              <Button type="submit" variant="primary" loading={submitting}
                className="group h-12 w-full rounded-xl border-0 bg-gradient-to-r from-teal-500 via-teal-600 to-sky-600 text-[15px] font-semibold text-white shadow-lg shadow-teal-600/30 transition hover:shadow-xl hover:shadow-teal-600/40">
                Sign in <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </form>

            <div className="mt-6 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 text-emerald-500" />
              Authentication, permissions and data are managed by ERPNext.
            </div>
          </div>
          <p className="mt-5 text-center text-xs text-muted-foreground lg:text-left">MicroMax Sugar Mills Ltd. · Bhalwal–Sargodha Road, Sargodha</p>
        </div>
      </div>

      {/* RIGHT — the mill's modules as glossy icon boxes */}
      <div className="relative z-10 hidden flex-col justify-center px-10 py-10 lg:flex xl:px-16">
        <span className="login-rise inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1.5">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[11px] font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">ERPNext-native · live</span>
        </span>
        <h2 className="login-rise mt-5 text-[32px] font-bold leading-[1.1] tracking-tight xl:text-[36px]" style={{ animationDelay: "60ms" }}>
          The all-in-one workspace for{" "}
          <span className="bg-gradient-to-r from-teal-500 via-sky-500 to-indigo-500 bg-clip-text text-transparent">Sugar Mills</span>
        </h2>
        <p className="login-rise mt-4 max-w-[560px] text-[16px] leading-relaxed text-muted-foreground" style={{ animationDelay: "120ms" }}>
          Crop survey on satellite maps, field force with GPS attendance, indenting, weighbridge, CPR & bilty, laboratory, costing and
          cane accounts — every step posted live to your ERPNext backend.
        </p>

        <div className="login-rise mt-6 flex flex-wrap gap-2.5" style={{ animationDelay: "160ms" }}>
          {[{ v: String(loginApps.length), l: "modules" }, { v: "React", l: "frontend" }, { v: "ERPNext", l: "backend" }, { v: "Live", l: "real-time" }].map((s) => (
            <div key={s.l} className="rounded-2xl border bg-card/70 px-4 py-2 backdrop-blur">
              <span className="text-lg font-bold tracking-tight">{s.v}</span> <span className="text-xs text-muted-foreground">{s.l}</span>
            </div>
          ))}
        </div>

        {/* icon boxes */}
        <div className="login-panel login-rise mt-6 rounded-[28px] border border-white/60 p-5 shadow-[0_30px_80px_-40px_rgb(15_23_42/0.35)] dark:border-white/10" style={{ animationDelay: "200ms" }}>
          <div className="grid grid-cols-4 gap-x-2 gap-y-4 xl:grid-cols-6 2xl:grid-cols-8">
            {loginApps.map((app, i) => {
              const Icon = app.icon;
              return (
                <div key={app.id} title={app.description ?? app.label} className="login-rise group flex flex-col items-center gap-2 text-center"
                  style={{ animationDelay: `${260 + i * 35}ms` }}>
                  <span className="login-float relative inline-flex" style={{ animationDelay: `${(i % 6) * 0.35}s` }}>
                    <span className={cn("relative grid size-[52px] place-items-center overflow-hidden rounded-[17px] bg-gradient-to-b text-white shadow-lg ring-1 ring-inset ring-white/25 transition duration-200 group-hover:-translate-y-1 group-hover:scale-105 group-hover:shadow-xl",
                      ICON_GRADIENT[hueOf(app.colorClass)] ?? ICON_GRADIENT.slate)}>
                      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/40 to-white/0" />
                      <Icon className="relative size-6 drop-shadow-sm" strokeWidth={2.1} />
                    </span>
                  </span>
                  <span className="line-clamp-2 min-h-[2.5em] w-full px-0.5 text-[11px] font-semibold leading-tight text-foreground/85">{app.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="login-rise mt-5 grid grid-cols-2 gap-4" style={{ animationDelay: "500ms" }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-3 rounded-2xl border bg-card/60 p-3.5 backdrop-blur">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-sky-600 text-white shadow-md"><f.icon className="size-4" /></span>
              <div>
                <p className="text-sm font-semibold">{f.title}</p>
                <p className="text-xs text-muted-foreground">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="size-3.5 text-amber-500" />MicroMax ERP · ERPNext 16</p>
      </div>
    </div>
  );
}
