import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/utils/cn";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, onChange, checked, ...props }, ref) => {
    return (
      <label className={cn("flex cursor-pointer items-center gap-2", className)}>
        <span className="relative inline-flex h-4 w-4 shrink-0">
          <input
            ref={ref}
            type="checkbox"
            checked={checked}
            onChange={onChange}
            className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-input bg-transparent transition-colors checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
            {...props}
          />
          <Check className="pointer-events-none absolute left-[1px] top-[1px] h-3.5 w-3.5 scale-0 text-primary-foreground transition-transform peer-checked:scale-100" />
        </span>
        {label && <span className="text-sm">{label}</span>}
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";