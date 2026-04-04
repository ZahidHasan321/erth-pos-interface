import { Outlet, Link } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@repo/ui/sidebar";
import { WorkshopSidebar } from "./WorkshopSidebar";
import { NotificationBell } from "../notification-bell";
import { useAuth } from "@/context/auth";
import { ROLE_LABELS, DEPARTMENT_LABELS } from "@/lib/rbac";
import { Avatar, AvatarFallback } from "@repo/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/dropdown-menu";
import { LogOut, User } from "lucide-react";

interface WorkshopLayoutProps {
  onLogout: () => void;
}

export function WorkshopLayout({ onLogout }: WorkshopLayoutProps) {
  const { user: authUser } = useAuth();

  return (
    <SidebarProvider defaultOpen>
      <div className="flex h-screen w-screen">
        <WorkshopSidebar />
        <SidebarInset className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center justify-between px-4 h-12 border-b bg-card shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="size-8" />
              <div className="flex items-center gap-2 xl:hidden">
                <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">
                  W
                </div>
                <span className="font-bold text-sm uppercase tracking-wider">Workshop</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors">
                    <Avatar className="h-7 w-7 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                        {authUser?.username?.slice(0, 2).toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden sm:grid text-left text-sm leading-tight">
                      <span className="truncate font-medium text-xs capitalize">
                        {authUser?.username}
                      </span>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-lg" sideOffset={4}>
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-2 py-2 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                          {authUser?.username?.slice(0, 2).toUpperCase() ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold capitalize">
                          {authUser?.username}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {authUser ? ROLE_LABELS[authUser.role] : ""}
                          {authUser?.department ? ` · ${DEPARTMENT_LABELS[authUser.department]}` : ""}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile">
                      <User className="h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onLogout}>
                    <LogOut className="h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
