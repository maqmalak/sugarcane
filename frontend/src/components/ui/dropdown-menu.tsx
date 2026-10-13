import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";

export interface DropdownItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  separator?: boolean;
  /** A small section title (not clickable). */
  heading?: boolean;
  /** Icon tile colour (Tailwind classes, e.g. "bg-emerald-500/12 text-emerald-600"). */
  tone?: string;
}

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  width?: string;
}

/**
 * Lightweight dropdown menu. Closes on outside click and Escape.
 *
 * The open menu is portaled to <body> and positioned with fixed coordinates
 * computed from the trigger's own bounding rect, rather than sitting
 * `position: absolute` inside the trigger's own DOM subtree — a plain
 * absolute-positioned menu gets silently clipped by any scrollable ancestor
 * (e.g. a data table wide enough to need horizontal scroll, or a modal body),
 * which looks exactly like "the menu button does nothing": React state still
 * flips to open, the menu just renders somewhere invisible/behind other
 * content. Same fix already applied to FrappeLinkField's search dropdown for
 * the identical reason.
 */
export function DropdownMenu({ trigger, items, align = "end", width = "w-48" }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = React.useState<{ left?: number; right?: number; top?: number; bottom?: number } | null>(null);

  const updateMenuPos = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    // Prefer opening downward; flip above the trigger only when there's
    // meaningfully more room up there, so a menu near the bottom of the
    // viewport (e.g. the last row of a tall table) never renders off-screen.
    const vertical =
      spaceBelow >= 160 || spaceBelow >= spaceAbove
        ? { top: rect.bottom + gap }
        : { bottom: window.innerHeight - rect.top + gap };
    const horizontal = align === "end" ? { right: window.innerWidth - rect.right } : { left: rect.left };
    setMenuPos({ ...vertical, ...horizontal });
  }, [align]);

  React.useEffect(() => {
    if (!open) return;
    updateMenuPos();
    window.addEventListener("scroll", updateMenuPos, true);
    window.addEventListener("resize", updateMenuPos);
    return () => {
      window.removeEventListener("scroll", updateMenuPos, true);
      window.removeEventListener("resize", updateMenuPos);
    };
  }, [open, updateMenuPos]);

  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      // The menu is portaled out of triggerRef's own DOM subtree, so an
      // "outside click" check has to look at both refs — checking only
      // triggerRef would treat every click on a menu item as "outside" and
      // close the menu (unmounting it) before the item's own onClick can
      // fire, i.e. every action would silently no-op.
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={triggerRef}>
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>{trigger}</div>
      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className={cn(
              "fixed z-40 max-h-[70vh] animate-fade-in overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-xl scrollbar-thin",
              // Floating over arbitrary content (not sitting in normal page
              // flow like a Card), so it needs to stay legible regardless of
              // what's behind it — a near-opaque panel instead of the 5%
              // glass tint used on page cards, same border/shadow/blur accents.
              "dark:border-white/10 dark:bg-[hsl(216_67%_9%_/_0.97)] dark:shadow-[0_18px_60px_rgb(2_6_23_/_0.55)] dark:backdrop-blur-xl",
              width,
            )}
            style={menuPos}
            role="menu"
          >
            {items.map((item, i) =>
              item.separator ? (
                <div key={i} className="my-1 h-px bg-border" />
              ) : item.heading ? (
                <p key={i} className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground first:pt-1">{item.label}</p>
              ) : (
                <button
                  key={i}
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    item.onClick?.();
                    setOpen(false);
                  }}
                  className={cn(
                    "group/item flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50",
                    item.destructive && "text-destructive hover:bg-destructive/10",
                  )}
                >
                  {item.icon && (item.tone
                    ? <span className={cn("grid size-6 shrink-0 place-items-center rounded-md [&_svg]:size-3.5", item.tone)}>{item.icon}</span>
                    : item.icon)}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
