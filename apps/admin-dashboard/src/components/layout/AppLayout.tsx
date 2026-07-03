import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Table2, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/orders", label: "Explorer", icon: Table2 },
] as const;

export function AppLayout({ children, onLogout }: { children: React.ReactNode; onLogout: () => void }) {
  const auth = useAuth();
  const location = useLocation();
  const path = location.pathname;

  const isActive = (to: string) =>
    to === "/" ? path === "/" : path === to || path.startsWith(to + "/");

  return (
    <div className="min-h-dvh flex bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        <div className="h-14 flex items-center gap-2 px-4 border-b border-sidebar-border">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium">Admin Dashboard</span>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive(to)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="px-2 pb-2">
            <p className="text-sm font-medium truncate">{auth.user?.name ?? "—"}</p>
            <p className="text-xs text-muted-foreground truncate">
              {auth.user ? ROLE_LABELS[auth.user.role] : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <div className="max-w-[1400px] mx-auto p-6">{children}</div>
      </main>
    </div>
  );
}
