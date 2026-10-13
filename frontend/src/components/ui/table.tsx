import { type ComponentProps } from "react";
import { cn } from "@/utils/cn";

/** Table primitives styled like Card / Badge / Button. `Table` is a horizontally scrollable wrapper around a real
 * <table>; extra props go to the <table>. */
function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
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
