import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/context/auth";
import { JOB_FUNCTION_LABELS, getTerminalPaths } from "@/lib/rbac";
import { Button } from "@repo/ui/button";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

// Bare-bones fullscreen layout for terminal-only users.
// No sidebar. Header = brand mark + active job + user + logout.
// When a worker holds multiple job_functions, a tab bar lets them switch
// between their assigned terminals (e.g. Sewing ↔ Quality Check).
interface TerminalLayoutProps {
  onLogout: () => void;
}

export function TerminalLayout({ onLogout }: TerminalLayoutProps) {
  const { user } = useAuth();
  const location = useLocation();
  const tabs = getTerminalPaths(user);
  const activeTab = tabs.find((t) => location.pathname.startsWith(t.path));
  const activeJobLabel = activeTab ? JOB_FUNCTION_LABELS[activeTab.job] : null;

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      <header className="flex items-center justify-between px-4 h-12 border-b bg-card shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0">
            W
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-sm uppercase tracking-wider">
              {activeJobLabel ?? "Terminal"}
            </span>
            {user?.name && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                {user.name}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="gap-2 text-muted-foreground"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </header>
      {tabs.length > 1 && (
        <nav className="flex items-stretch border-b bg-card shrink-0 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeTab?.job === tab.job;
            return (
              <Link
                key={tab.job}
                to={tab.path}
                className={cn(
                  "px-4 h-10 flex items-center text-xs font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {JOB_FUNCTION_LABELS[tab.job]}
              </Link>
            );
          })}
        </nav>
      )}
      <main
        data-scroll-restoration-id="terminal-main-scroll"
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        <Outlet />
      </main>
    </div>
  );
}
