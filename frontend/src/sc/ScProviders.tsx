import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "./providers/auth";
import { useTheme } from "./providers/theme";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } });

function ThemedToaster() {
  const { dark } = useTheme();
  return <Toaster theme={dark ? "dark" : "light"} richColors closeButton position="top-right" />;
}

/** Data layer for the sugar-mill pages (session, CSRF, query cache, toasts) inside the host app. */
export function ScProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <ThemedToaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
