import { Outlet } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@repo/ui/sidebar";
import { WorkshopSidebar } from "./WorkshopSidebar";
import { NotificationBell } from "../notification-bell";

interface WorkshopLayoutProps {
  onLogout: () => void;
}

export function WorkshopLayout({ onLogout }: WorkshopLayoutProps) {
  return (
    <SidebarProvider defaultOpen>
      <div className="flex h-screen w-screen">
        <WorkshopSidebar onLogout={onLogout} />
        <SidebarInset className="flex-1 flex flex-col min-w-0">
          {/* Header with sidebar trigger — visible below xl (sheet sidebar on tablets/small laptops) */}
          <header className="flex xl:hidden items-center justify-between px-4 py-3 border-b bg-card shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="size-8" />
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">
                  W
                </div>
                <span className="font-bold text-sm uppercase tracking-wider">Workshop</span>
              </div>
            </div>
            <NotificationBell />
          </header>
          <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
