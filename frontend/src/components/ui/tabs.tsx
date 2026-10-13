import { createContext, useContext, useMemo, type ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * Minimal, dependency-free tabset — the codebase had no `ui/tabs.tsx` and the
 * master-data pages need Frappe-style tabs (Details / Connections / Ledger).
 * Deliberately controlled-only: pages keep the active tab in state or in the
 * URL, which is what makes deep links like `/masters/items?tab=ledger` work.
 */

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error(`<${component}> must be rendered inside <Tabs>.`);
  return ctx;
}

export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useMemo<TabsContextValue>(() => ({ value, onValueChange }), [value, onValueChange]);
  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn("space-y-4", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex w-full flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/40 p-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  disabled,
  className,
}: {
  value: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const { value: active, onValueChange } = useTabsContext("TabsTrigger");
  const isActive = active === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => onValueChange(value)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { value: active } = useTabsContext("TabsContent");
  if (active !== value) return null;
  return (
    <div role="tabpanel" className={cn("animate-fade-in", className)}>
      {children}
    </div>
  );
}