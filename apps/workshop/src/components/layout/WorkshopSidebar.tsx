import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  CirclePause,
  CalendarClock,
  Activity,
  Droplets,
  Scissors,
  Layers,
  Shirt,
  Sparkles,
  Flame,
  ShieldCheck,
  Truck,
  CircleCheckBig,
  Users,
  LogOut,
  LayoutDashboard,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WorkshopSidebarProps {
  onLogout: () => void;
}

export function WorkshopSidebar({ onLogout }: WorkshopSidebarProps) {
  const { data: counts } = useSidebarCounts();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const routerState = useRouterState({ select: (s) => s.location.pathname });

  // Auto-close sidebar on navigation on mobile/tablet
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [routerState, isMobile, setOpenMobile]);

  // Auto-expand terminals group when on a terminal page
  const isOnTerminal = routerState.startsWith("/terminals");
  const [terminalsOpen, setTerminalsOpen] = useState(isOnTerminal);
  useEffect(() => {
    if (isOnTerminal) setTerminalsOpen(true);
  }, [isOnTerminal]);

  const operationItems = [
    { label: "Receiving",          icon: ArrowDownToLine, href: "/receiving",  count: counts?.receiving,  badgeColor: "bg-blue-100 text-blue-700" },
    { label: "Parking",            icon: CirclePause,     href: "/parking",    count: counts?.parking,    badgeColor: "bg-amber-100 text-amber-700" },
    { label: "Scheduler",          icon: CalendarClock,   href: "/scheduler",  count: counts?.scheduler,  badgeColor: "bg-purple-100 text-purple-700" },
    { label: "Production Tracker", icon: Activity,        href: "/assigned" },
  ];

  const postProductionItems = [
    { label: "Dispatch",        icon: Truck,            href: "/dispatch",   count: counts?.dispatch,   badgeColor: "bg-green-100 text-green-700" },
    { label: "Completed",       icon: CircleCheckBig,   href: "/completed" },
    { label: "Resources",       icon: Users,            href: "/resources" },
  ];

  const terminalItems = [
    { label: "Soaking",       icon: Droplets,     href: "/terminals/soaking",       count: counts?.soaking,       color: "text-sky-500" },
    { label: "Cutting",       icon: Scissors,     href: "/terminals/cutting",       count: counts?.cutting,       color: "text-amber-500" },
    { label: "Post-Cutting",  icon: Layers,       href: "/terminals/post-cutting",  count: counts?.post_cutting,  color: "text-orange-500" },
    { label: "Sewing",        icon: Shirt,        href: "/terminals/sewing",        count: counts?.sewing,        color: "text-purple-500" },
    { label: "Finishing",     icon: Sparkles,     href: "/terminals/finishing",     count: counts?.finishing,     color: "text-emerald-500" },
    { label: "Ironing",       icon: Flame,        href: "/terminals/ironing",       count: counts?.ironing,       color: "text-rose-500" },
    { label: "Quality Check", icon: ShieldCheck,  href: "/terminals/quality-check", count: counts?.quality_check, color: "text-indigo-500" },
  ];

  const totalTerminalCount = terminalItems.reduce((s, t) => s + (t.count ?? 0), 0);
  const isCollapsedDesktop = state === "collapsed" && !isMobile;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4 border-b group-data-[collapsible=icon]:px-1.5">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/90 to-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 shadow-md">
            W
          </div>
          <span className="font-bold text-sm uppercase tracking-wider group-data-[collapsible=icon]:hidden">
            Workshop
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Dashboard */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/dashboard">
                    <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operationItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild>
                    <Link to={item.href}>
                      <item.icon className="w-4 h-4" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {!!item.count && (
                    <SidebarMenuBadge className={cn("font-bold", item.badgeColor)}>
                      {item.count}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Terminals — collapsible to reduce clutter */}
        <SidebarGroup>
          <SidebarGroupLabel
            asChild
            className="cursor-pointer hover:bg-sidebar-accent/50 transition-colors rounded-md"
          >
            <button onClick={() => setTerminalsOpen(!terminalsOpen)} className="w-full">
              <span className="flex-1 text-left">Terminals</span>
              {!isCollapsedDesktop && (
                <>
                  {!terminalsOpen && totalTerminalCount > 0 && (
                    <span className="text-[10px] font-bold tabular-nums text-muted-foreground mr-1">
                      {totalTerminalCount}
                    </span>
                  )}
                  <ChevronDown className={cn(
                    "w-3 h-3 text-muted-foreground/50 transition-transform",
                    terminalsOpen && "rotate-180",
                  )} />
                </>
              )}
            </button>
          </SidebarGroupLabel>
          {terminalsOpen && (
            <SidebarGroupContent>
              <SidebarMenu>
                {terminalItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild>
                      <Link to={item.href}>
                        <item.icon className={cn("w-4 h-4", item.color)} aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {!!item.count && (
                      <SidebarMenuBadge className="font-bold">
                        {item.count}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {postProductionItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild>
                    <Link to={item.href}>
                      <item.icon className="w-4 h-4" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {!!item.count && (
                    <SidebarMenuBadge className={cn("font-bold", item.badgeColor)}>
                      {item.count}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 border-t">
        <Button variant="ghost" size="sm" onClick={onLogout} className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground">
          <LogOut className="w-4 h-4" aria-hidden="true" />
          <span className="group-data-[collapsible=icon]:hidden">Logout</span>
        </Button>
        {/* Only show collapse trigger on desktop sidebar, not in sheet mode */}
        {!isMobile && <SidebarTrigger className="w-full" />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
