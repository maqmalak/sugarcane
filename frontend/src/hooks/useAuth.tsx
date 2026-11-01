import * as React from "react";
import { useFrappeAuth, useFrappeGetCall, useFrappeGetDoc } from "frappe-react-sdk";
import { refreshCSRFToken } from "@/services/frappe";
import type { FrappeUser } from "@/types/frappe";

/**
 * Authentication + session context.
 *
 * Wraps the SDK's `useFrappeAuth` (cookie/session auth) and enriches it with
 * the ERPNext User document (full name, email, language, time zone) and the
 * user's roles / default company. Permissions themselves are always enforced
 * by Frappe on the server — roles here only drive UI affordances.
 */

export interface AuthState {
  /** Login id (email) of the current user, or null when logged out. */
  currentUser: string | null | undefined;
  user?: FrappeUser;
  roles: string[];
  defaultCompany?: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  error?: unknown;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => void;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = React.createContext<AuthState | null>(null);

const GUEST = "Guest";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    currentUser,
    isLoading: authLoading,
    error,
    updateCurrentUser,
    getUserCookie,
  } = useFrappeAuth();

  const isAuthenticated = Boolean(currentUser && currentUser !== GUEST);

  // Full User document — only fetched when authenticated.
  const { data: userDoc, isLoading: userLoading } = useFrappeGetDoc<FrappeUser>(
    "User",
    isAuthenticated ? (currentUser as string) : undefined,
    isAuthenticated ? `micromax.user.${currentUser}` : null,
  );

  // Roles of the logged-in user (server-evaluated). sugarcane.api.v1.spa.boot returns them for any signed-in user — a
  // "Has Role" list query needs read access to User, which agents and other non-admin roles don't have.
  const { data: bootData } = useFrappeGetCall<{ message: { roles?: string[]; company?: string } }>(
    "sugarcane.api.v1.spa.boot",
    undefined,
    isAuthenticated ? `realestate.roles.${currentUser}` : null,
  );

  const roles = React.useMemo(() => bootData?.message?.roles ?? [], [bootData]);

  // Default company: the mill's (Sugar Settings → company) from the boot — Global Defaults is readable by System Managers only.

  /**
   * Frappe's `/api/method/login` only accepts **form-encoded** `usr`/`pwd`.
   * The SDK's `loginWithUsernamePassword` sends JSON `{username, password}`,
   * which Frappe rejects with "Incomplete login details". We call the endpoint
   * directly with the correct encoding, then refresh the SDK session state.
   */
  const login = React.useCallback(
    async (username: string, password: string) => {
      const body = new URLSearchParams({ usr: username, pwd: password });
      const res = await fetch("/api/method/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        credentials: "include",
        body,
      });
      if (!res.ok) {
        let message = `Login failed (HTTP ${res.status})`;
        try {
          const data = await res.json();
          const serverMsg = (data as any)?._server_messages;
          if (serverMsg) {
            const parsed = JSON.parse(serverMsg);
            message = parsed.map((m: any) => m.message).join(" ");
          } else {
            message = (data as any)?.message ?? message;
          }
        } catch {
          /* keep default message */
        }
        throw new Error(message);
      }
      // Cookie is now set — refresh cookie-derived user_id AND revalidate the
      // get_logged_user SWR cache so isAuthenticated flips to true.
      getUserCookie();
      await updateCurrentUser();
      // New session => new CSRF token; refresh it before any write requests.
      await refreshCSRFToken();
    },
    [updateCurrentUser, getUserCookie],
  );

  const logout = React.useCallback(async () => {
    // Unlike login (a guest-context request Frappe never CSRF-checks), logout
    // mutates an authenticated session, so it needs the same
    // `X-Frappe-CSRF-Token` header the axios `http` instance attaches
    // automatically (see services/frappe.ts) — this raw fetch bypasses that
    // interceptor, so without it the server rejects the POST with
    // CSRFTokenError and the session is silently never destroyed.
    const csrfToken = (window as unknown as { csrf_token?: string }).csrf_token;
    await fetch("/api/method/logout", {
      method: "POST",
      credentials: "include",
      headers: csrfToken ? { "X-Frappe-CSRF-Token": csrfToken } : undefined,
    }).catch(() => undefined);
    getUserCookie();
    await updateCurrentUser();
    // Session destroyed — grab a fresh (guest) CSRF token.
    await refreshCSRFToken();
    // A real browser navigation rather than react-router's `useNavigate()`:
    // called from this deep in AuthProvider's async flow, `navigate()` hit
    // react-router's internal `activeRef` guard (traced — it ran with no
    // error but silently never touched history, even deferred a tick).
    // `location.assign` sidesteps that entirely and, as a bonus, hard-resets
    // every in-memory cache (SWR, component state) rather than leaving stale
    // authenticated data sitting behind the login screen.
    window.location.assign("/login");
  }, [updateCurrentUser, getUserCookie]);

  const hasRole = React.useCallback(
    (...wanted: string[]) =>
      wanted.length === 0 ||
      roles.includes("Administrator") ||
      roles.includes("System Manager") ||
      wanted.some((r) => roles.includes(r)),
    [roles],
  );

  const value: AuthState = {
    currentUser,
    user: userDoc as FrappeUser | undefined,
    roles,
    defaultCompany: bootData?.message?.company,
    isLoading: authLoading || (isAuthenticated && userLoading),
    isAuthenticated,
    error,
    login,
    logout,
    refresh: updateCurrentUser,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}