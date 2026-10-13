import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import { get, login as apiLogin, logout as apiLogout, setCsrfToken } from "@/sc/lib/api";
import type { Boot } from "@/sc/lib/types";

interface AuthCtx {
  boot: Boot | undefined;
  loading: boolean;
  login: (usr: string, pwd: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["boot"],
    queryFn: async () => {
      const b = await get<Boot>("sugarcane.api.v1.spa.boot");
      setCsrfToken(b.csrf_token);
      return b;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const value: AuthCtx = {
    boot: data,
    loading: isLoading,
    login: async (usr, pwd) => {
      await apiLogin(usr, pwd);
      await qc.invalidateQueries({ queryKey: ["boot"] });
    },
    logout: async () => {
      await apiLogout();
      qc.clear();
      await qc.invalidateQueries({ queryKey: ["boot"] });
    },
    hasRole: (...roles) => roles.some((r) => data?.roles?.includes(r)) || Boolean(data?.roles?.includes("System Manager")),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
