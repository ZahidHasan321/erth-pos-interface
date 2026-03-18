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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WorkshopSidebarProps {
  onLogout: () => void;
}

export function WorkshopSidebar({ onLogout }: WorkshopSidebarProps) {
  const { data: counts } = useSidebarCounts();
  const { isMobile, setOpenMobile } = useSidebar();
  const routerState = useRouterState({ select: (s) => s.location.pathname });

  // Auto-close sidebar on navigation on mobile
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [routerState, isMobile, setOpenMobile]);

  const operationItems = [
    { label: "Receiving",          icon: ArrowDownToLine, href: "/receiving",  count: counts?.receiving,  badgeColor: "bg-blue-100 text-blue-700" },
    { label: "Parking",            icon: CirclePause,     href: "/parking",    count: counts?.parking,    badgeColor: "bg-amber-100 text-amber-700" },
    { label: "Scheduler",          icon: CalendarClock,   href: "/scheduler",  count: counts?.scheduler,  badgeColor: "bg-purple-100 text-purple-700" },
    { label: "Production Tracker", icon: Activity,        href: "/assigned" },
  ];

  const postProductionItems = [
    { label: "Dispatch",        icon: Truck,            href: "/dispatch",   count: counts?.dispatch,   badgeColor: "bg-green-100 text-green-700" },
    { label: "Completed",       icon: CircleCheckBig,   href: "/completed" },
  ];

  const terminalItems = [
    { label: "Soaking",       icon: Droplets,     href: "/terminals/soaking",       count: counts?.soaking,       color: "text-blue-500" },
    { label: "Cutting",       icon: Scissors,     href: "/terminals/cutting",       count: counts?.cutting,       color: "text-amber-500" },
    { label: "Post-Cutting",  icon: Layers,       href: "/terminals/post-cutting",  count: counts?.post_cutting,  color: "text-orange-500" },
    { label: "Sewing",        icon: Shirt,        href: "/terminals/sewing",        count: counts?.sewing,        color: "text-purple-500" },
    { label: "Finishing",     icon: Sparkles,     href: "/terminals/finishing",     count: counts?.finishing,     color: "text-emerald-500" },
    { label: "Ironing",       icon: Flame,        href: "/terminals/ironing",       count: counts?.ironing,       color: "text-red-500" },
    { label: "Quality Check", icon: ShieldCheck,  href: "/terminals/quality-check", count: counts?.quality_check, color: "text-indigo-500" },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4 border-b group-data-[collapsible=icon]:px-1.5">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 shadow-sm">
            W
          </div>
          <span className="font-bold text-sm uppercase tracking-wider group-data-[collapsible=icon]:hidden">
            Workshop
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Dashboard — standalone at top */}
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

        <SidebarGroup>
          <SidebarGroupLabel>Terminals</SidebarGroupLabel>
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
        </SidebarGroup>

        {/* Dispatch + Resources after terminals */}
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
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/resources">
                    <Users className="w-4 h-4" aria-hidden="true" />
                    <span>Resources</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 border-t flex flex-col gap-1">
        <Button variant="ghost" size="sm" onClick={onLogout} className="w-full justify-start gap-2">
          <LogOut className="w-4 h-4" aria-hidden="true" />
          <span className="group-data-[collapsible=icon]:hidden">Logout</span>
        </Button>
        <SidebarTrigger className="w-full" />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
