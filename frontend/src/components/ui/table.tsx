import { type ComponentProps } from "react";
import { cn } from "@/utils/cn";

/**
 * Minimal, dependency-free table primitives — the codebase only ships a few
 * of these (no `ui/table.tsx` existed), so master pages and reports get a
 * typed set that matches the styling of Card / Badge / Button.
 *
 * `Table` forwards extra div props (className, onClick, ...) onto the
 * outer scrollable wrapper so callers can size and style it directly.
 */
function Table({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("w-full overflow-x-auto", className)}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={cn("bg-muted/40", className)}
      {...props}
    />
  );
}

function TableBody({ className, children, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody
      className={cn("divide-y divide-border/50", className)}
      {...props}
    >
      {children}
    </tbody>
  );
}

function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "transition-colors hover:bg-muted/30",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      className={cn("px-3 py-2 align-top text-sm", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
};
