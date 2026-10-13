import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";

export interface Season {
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  govt_rate: number;
  crushing_target_maund: number;
}

export interface Boot {
  user: string | null;
  full_name?: string;
  user_image?: string | null;
  roles: string[];
  is_staff?: boolean;
  csrf_token?: string;
  company?: string;
  currency?: string;
  maund_kg?: number;
  season?: Season | null;
  language?: string;
}

interface SessionValue {
  boot: Boot | undefined;
  isLoading: boolean;
  refresh: () => Promise<unknown>;
  hasRole: (...roles: string[]) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Loads sugarcane.api.v1.app.boot once and shares it. Keeps window.csrf_token current for POSTs. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, mutate } = useFrappeGetCall<{ message: Boot }>("sugarcane.api.v1.app.boot", undefined,
    "sugar-boot", { revalidateOnFocus: false });
  const boot = data?.message;
  useEffect(() => {
    if (boot?.csrf_token) window.csrf_token = boot.csrf_token;
  }, [boot?.csrf_token]);
  const roles = new Set(boot?.roles ?? []);
  const value: SessionValue = {
    boot,
    isLoading,
    refresh: () => mutate(),
    // System Manager sees everything, like on the desk
    hasRole: (...wanted) => roles.has("System Manager") || wanted.some((r) => roles.has(r)),
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
