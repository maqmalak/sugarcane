import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useFrappeAuth } from "frappe-react-sdk";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function LoginPage() {
  const { login } = useFrappeAuth();
  const { boot, refresh } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  if (boot?.user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login({ username, password });
      await refresh();
      navigate(from, { replace: true });
    } catch (err) {
      const msg = (err as { message?: string })?.message;
      setError(msg && msg !== "Invalid login credentials" ? msg : "Wrong email or password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-emerald-900 via-emerald-800 to-lime-700 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-card p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <img src="/assets/sugarcane/images/sugarcane.svg" alt="" className="h-11 w-11" />
          <div>
            <h1 className="text-lg font-semibold">MicroMax Sugar Mills</h1>
            <p className="text-sm text-muted-foreground">Sign in to the cane ERP</p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Email or username</Label>
            <Input id="username" autoComplete="username" autoFocus value={username}
              onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        </div>
      </form>
    </div>
  );
}
