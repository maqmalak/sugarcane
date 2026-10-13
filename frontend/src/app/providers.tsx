import type { ReactNode } from "react";
import { useEffect } from "react";
import { FrappeProvider } from "frappe-react-sdk";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompanyContext";
import { refreshCSRFToken } from "@/services/frappe";

/**
 * Application providers.
 *
 * - `FrappeProvider` configures the REST/RPC transport and the Socket.IO
 *   realtime connection. When the SPA is served from the Frappe site itself,
 *   `VITE_FRAPPE_URL` is left empty and same-origin cookies are used.
 * - SWR is configured for resilient behaviour on slow networks: dedupe bursts,
 *   revalidate on focus/reconnect, and retry failed requests with backoff.
 *
 * In dev the SPA is served by Vite, NOT by Frappe, so `window.csrf_token` is
 * never injected into the page. Without it frappe-react-sdk omits the
 * `X-Frappe-CSRF-Token` header on POSTs and Frappe rejects every write with
 * `CSRFTokenError`. `refreshCSRFToken()` (see services/frappe.ts) fetches it
 * on mount below, after login/logout (useAuth), and auto-retries any request
 * that fails with a stale token (e.g. after a backend restart).
 */

const frappeUrl = import.meta.env.VITE_FRAPPE_URL || undefined;
const socketEnabled = import.meta.env.VITE_ENABLE_SOCKET !== "false";

/**
 * Route Socket.IO through the Vite dev proxy (same-origin) instead of the
 * SDK default of hitting the websocket container's port 9000 directly,
 * which the browser blocks as cross-origin.
 */
const socketPort = typeof window !== "undefined" && window.location.port
  ? window.location.port
  : undefined;


/**
 * SWR config MUST be a stable reference — an inline object would create a new
 * identity on every render and trigger an infinite re-render loop.
 */
const SWR_CONFIG = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  shouldRetryOnError: true,
  errorRetryCount: 3,
  errorRetryInterval: 3000,
  // Avoid duplicate requests for the same key within 5s.
  dedupingInterval: 5000,
  keepPreviousData: true,
} as const;

export function AppProviders({ children }: { children: ReactNode }) {
  // Fetch the CSRF token once on mount (dev-server mode).
  useEffect(() => {
    void refreshCSRFToken();
  }, []);

  return (
    <FrappeProvider
      url={frappeUrl}
      enableSocket={socketEnabled}
      socketPort={socketPort}
      swrConfig={SWR_CONFIG}
    >
      <AuthProvider>
        <CompanyProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 4000,
              className:
                "!rounded-md !border !border-border !bg-card !text-card-foreground !text-sm !shadow-lg",
            }}
          />
        </CompanyProvider>
      </AuthProvider>
    </FrappeProvider>
  );
}