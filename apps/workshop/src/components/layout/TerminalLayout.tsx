import { Outlet } from "@tanstack/react-router";
import { useAuth } from "@/context/auth";
import { JOB_FUNCTION_LABELS } from "@/lib/rbac";
import { Button } from "@repo/ui/button";
import { LogOut } from "lucide-react";

// Bare-bones fullscreen layout for terminal-only users.
// No sidebar. Minimal header = brand mark + user + logout.
interface TerminalLayoutProps {
  onLogout: () => void;
}

export function TerminalLayout({ onLogout }: TerminalLayoutProps) {
  const { user } = useAuth();
  const jobLabel = user?.job_function ? JOB_FUNCTION_LABELS[user.job_function] : null;

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      <header className="flex items-center justify-between px-4 h-12 border-b bg-card shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0">
            W
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-sm uppercase tracking-wider">
              {jobLabel ?? "Terminal"}
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
      <main
        data-scroll-restoration-id="terminal-main-scroll"
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        <Outlet />
      </main>
    </div>
  );
}
