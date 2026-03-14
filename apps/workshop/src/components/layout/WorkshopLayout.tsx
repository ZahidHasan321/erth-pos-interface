import { Outlet } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WorkshopSidebar } from "./WorkshopSidebar";

interface WorkshopLayoutProps {
  onLogout: () => void;
}

export function WorkshopLayout({ onLogout }: WorkshopLayoutProps) {
  return (
    <SidebarProvider defaultOpen>
      <div className="flex h-screen w-screen">
        <WorkshopSidebar onLogout={onLogout} />
        <SidebarInset className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-3 border-b bg-background px-4">
            <SidebarTrigger />
            <span className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Workshop</span>
          </header>
          <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
