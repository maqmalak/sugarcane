import * as T from "@radix-ui/react-tabs";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/sc/lib/utils";

export const Tabs = T.Root;

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof T.List>) {
  return <T.List className={cn("inline-flex h-9 items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentPropsWithoutRef<typeof T.Content>) {
  return <T.Content className={cn("mt-3 focus-visible:outline-none", className)} {...props} />;
}
