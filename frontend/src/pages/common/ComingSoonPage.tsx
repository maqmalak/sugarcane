import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Logo } from "@/components/common/logo";

/**
 * Full-screen centered loader — shown while the session is being resolved
 * (RequireAuth / RequireRole) and as the Suspense fallback for lazy routes.
 * `relative` so it can host absolutely-positioned decoration later without a
 * markup change; the ambient dark-mode glow already painted on `body` shows
 * straight through via `dark:bg-transparent`, same as AppShell/LoginPage.
 */
export function FullPageLoader() {
  return (
    <div className="relative flex h-screen flex-col items-center justify-center gap-4 overflow-hidden bg-background dark:bg-transparent">
      <Logo variant="mark" className="h-11 w-auto dark:drop-shadow-[0_10px_35px_hsl(var(--primary)/0.32)]" />
      <svg className="h-6 w-6 animate-spin text-primary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <p className="text-sm font-medium text-muted-foreground">Preparing your workspace…</p>
    </div>
  );
}


/** Placeholder module for pages that will be built out next. */
export function ComingSoonPage({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} subtitle={description} />
      <EmptyState
        title="Under construction"
        description="This module is being built on top of the ERPNext API. Data flows through the standard Frappe REST endpoints and will appear here."
      />
    </div>
  );
}
