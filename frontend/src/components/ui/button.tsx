import * as React from "react";
import { cn } from "@/utils/cn";

type Variant = "default" | "primary" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "save" | "submit" | "workflow" | "danger" | "neutral" | "menu";
type Size = "xs" | "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  default: "bg-foreground text-background hover:opacity-90",
  primary:
    "bg-primary text-primary-foreground hover:brightness-110 active:brightness-95 dark:shadow-[0_10px_35px_rgb(20_184_166_/_0.32)]",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  link: "text-primary underline-offset-4 hover:underline",
  // form actions — glossy gradients with a coloured glow; lift on hover
  save:
    "rounded-lg bg-gradient-to-b from-primary to-[hsl(var(--primary)/0.82)] text-primary-foreground shadow-md shadow-primary/30 ring-1 ring-inset ring-white/15 hover:-translate-y-px hover:shadow-lg hover:shadow-primary/40 active:translate-y-0 transition-all",
  submit:
    "rounded-lg bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-inset ring-white/15 hover:-translate-y-px hover:from-emerald-500 hover:to-emerald-500 hover:shadow-lg hover:shadow-emerald-600/40 active:translate-y-0 transition-all",
  workflow:
    "rounded-lg bg-gradient-to-b from-violet-500 to-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-inset ring-white/15 hover:-translate-y-px hover:shadow-lg hover:shadow-indigo-600/40 active:translate-y-0 transition-all",
  neutral:
    "rounded-lg border border-border bg-gradient-to-b from-card to-muted/50 text-foreground/85 shadow-sm hover:border-foreground/30 hover:to-muted hover:text-foreground dark:border-white/15 dark:from-white/[0.07] dark:to-white/[0.03] dark:hover:from-white/[0.12] transition-all",
  menu:
    "rounded-lg border border-primary/30 bg-primary/[0.08] text-primary shadow-sm hover:border-primary/50 hover:bg-primary/[0.14] dark:border-primary/40 dark:bg-primary/15 transition-all",
  danger:
    "rounded-lg border border-rose-400 bg-rose-100 font-semibold text-rose-700 shadow-sm shadow-rose-500/20 hover:border-rose-500 hover:bg-rose-200 hover:text-rose-800 dark:border-rose-400/60 dark:bg-rose-500/25 dark:text-rose-200 dark:hover:bg-rose-500/35 transition-all",
};

const sizeClasses: Record<Size, string> = {
  xs: "h-7 px-2 text-xs",
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-6 text-base",
  icon: "h-9 w-9",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading && (
            <svg aria-hidden="true" className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { variantClasses as buttonVariants };