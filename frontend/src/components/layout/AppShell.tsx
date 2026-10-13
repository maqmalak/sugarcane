import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useFrappeAuth } from "frappe-react-sdk";
import { ExternalLink, LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { visibleNavigation } from "@/app/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/cn";

export function AppShell({ children }: { children: ReactNode }) {
  const { boot, hasRole, refresh } = useSession();
  const { logout } = useFrappeAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const groups = visibleNavigation(hasRole);

  const signOut = async () => {
    await logout();
    await refresh();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-full">
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center gap-2 px-4">
          <img src="/assets/sugarcane/images/sugarcane.svg" alt="" className="h-8 w-8" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">MicroMax Sugar</div>
            <div className="text-[11px] opacity-70">{boot?.company ?? "Sugar Mills ERP"}</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin]">
          {groups.map((group) => (
            <div key={group.label} className="mt-4">
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider opacity-55">{group.label}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                      isActive ? "bg-white/12 font-medium text-white" : "opacity-85 hover:bg-white/8 hover:opacity-100",
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.phase > 0 && <span className="text-[10px] opacity-50">P{item.phase}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <a
          href="/app/sugarcane"
          className="mx-2 mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm opacity-80 hover:bg-white/8 hover:opacity-100"
        >
          <ExternalLink className="h-4 w-4" /> Open Desk (masters & setup)
        </a>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-card px-4">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          {boot?.season ? (
            <Badge variant={boot.season.status === "Open" ? "success" : "secondary"} dot>
              Season {boot.season.name} · {boot.season.status}
            </Badge>
          ) : (
            <Badge variant="warning">No active season</Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggle}
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <DropdownMenu
              trigger={
                <button className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent">
                  <Avatar name={boot?.full_name ?? boot?.user ?? "?"} src={boot?.user_image ?? undefined} size="sm" />
                  <span className="hidden text-sm sm:inline">{boot?.full_name}</span>
                </button>
              }
              items={[
                { label: boot?.user ?? "", heading: true },
                ...(boot?.roles ?? [])
                  .filter((r) => !["All", "Guest", "Desk User"].includes(r))
                  .slice(0, 6)
                  .map((r) => ({ label: r, disabled: true })),
                { label: "", separator: true },
                { label: "Sign out", icon: <LogOut className="h-4 w-4" />, onClick: signOut, destructive: true },
              ]}
              width="w-60"
            />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
