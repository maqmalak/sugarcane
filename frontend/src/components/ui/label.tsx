import * as React from "react";
import { cn } from "@/utils/cn";

export function Label({
  className,
  children,
  htmlFor,
  required,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("mb-1.5 block text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300", className)}
      {...props}
    >
      {children}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </label>
  );
}