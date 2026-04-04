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
} from "@repo/ui/sidebar";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { useTransferRequests } from "@/hooks/useTransfers";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  CirclePause,
  CalendarClock,
  Activity,
  Droplets,
  Scissors,
  Truck,
  ClipboardCheck,
  BarChart3,
  CircleCheckBig,
  Users,
  DollarSign,
  LogOut,
  LayoutDashboard,
  ChevronDown,
  ChevronsUpDown,
  TrendingUp,
  User,
  UserCog,
  Package,
  Send,
} from "lucide-react";
import { IconNeedle, IconIroning1, IconRosette, IconStack2, IconSparkles } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import { NotificationBell } from "../notification-bell";
import { isAdmin, ROLE_LABELS, DEPARTMENT_LABELS } from "@/lib/rbac";
import { Avatar, AvatarFallback } from "@repo/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/dropdown-menu";

interface WorkshopSidebarProps {
  onLogout: () => void;
}

export function WorkshopSidebar({ onLogout }: WorkshopSidebarProps) {
  const { data: counts } = useSidebarCounts();
  const { data: receivingDeliveries = [] } = useTransferRequests({ status: "dispatched", direction: "shop_to_workshop" });
  const { data: approveRequests = [] } = useTransferRequests({ status: ["requested"], direction: "workshop_to_shop" });
  const { isMobile, setOpenMobile, state } = useSidebar();
  const routerState = useRouterState({ select: (s) => s.location.pathname });
  const { user: authUser } = useAuth();

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

  const peopleItems = [
    { label: "Team",        icon: Users,       href: "/team" },
    { label: "Performance", icon: TrendingUp,  href: "/performance" },
    ...(isAdmin(authUser) ? [{ label: "Users", icon: UserCog, href: "/users" }] : []),
  ];

  const postProductionItems = [
    { label: "Dispatch",        icon: Truck,            href: "/dispatch",   count: counts?.dispatch,   badgeColor: "bg-green-100 text-green-700" },
    { label: "Completed",       icon: CircleCheckBig,   href: "/completed" },
    { label: "Pricing",         icon: DollarSign,       href: "/pricing" },
  ];

  const storeItems = [
    { label: "Inventory",            icon: Package,          href: "/store/inventory" },
    { label: "Send to Shop",         icon: Send,             href: "/store/send-to-shop" },
    { label: "Request Delivery",     icon: Truck,            href: "/store/request-delivery" },
    { label: "Receiving Deliveries", icon: ArrowDownToLine,  href: "/store/receiving-deliveries", count: receivingDeliveries.length, badgeColor: "bg-blue-100 text-blue-700" },
    { label: "Approve Requests",     icon: ClipboardCheck,   href: "/store/approve-requests",     count: approveRequests.length,     badgeColor: "bg-amber-100 text-amber-700" },
    { label: "Stock Report",         icon: BarChart3,        href: "/store/stock-report" },
  ];

  const terminalItems = [
    { label: "Soaking",       icon: Droplets,     href: "/terminals/soaking",       count: counts?.soaking,       color: "text-sky-500" },
    { label: "Cutting",       icon: Scissors,     href: "/terminals/cutting",       count: counts?.cutting,       color: "text-amber-500" },
    { label: "Post-Cutting",  icon: IconStack2,    href: "/terminals/post-cutting",  count: counts?.post_cutting,  color: "text-orange-500" },
    { label: "Sewing",        icon: IconNeedle,   href: "/terminals/sewing",        count: counts?.sewing,        color: "text-purple-500" },
    { label: "Finishing",     icon: IconSparkles, href: "/terminals/finishing",     count: counts?.finishing,     color: "text-emerald-500" },
    { label: "Ironing",       icon: IconIroning1, href: "/terminals/ironing",       count: counts?.ironing,       color: "text-rose-500" },
    { label: "Quality Check", icon: IconRosette,  href: "/terminals/quality-check", count: counts?.quality_check, color: "text-indigo-500" },
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
          <span className="font-bold text-sm uppercase tracking-wider group-data-[collapsible=icon]:hidden flex-1">
            Workshop
          </span>
          <div className="group-data-[collapsible=icon]:hidden">
            <NotificationBell />
          </div>
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
          <SidebarGroupLabel>People</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {peopleItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild>
                    <Link to={item.href}>
                      <item.icon className="w-4 h-4" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
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

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Store Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {storeItems.map((item) => (
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

      <SidebarFooter className="mt-auto border-t pt-2 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={authUser?.username ?? "Profile"}
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                      {authUser?.username?.slice(0, 2).toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold capitalize">
                      {authUser?.username}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {authUser ? ROLE_LABELS[authUser.role] : ""}
                      {authUser?.department ? ` · ${DEPARTMENT_LABELS[authUser.department]}` : ""}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="top"
                align="start"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
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
          </SidebarMenuItem>
          {!isMobile && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Toggle Sidebar">
                <SidebarTrigger>
                  <ChevronDown className="h-4 w-4 -rotate-90" aria-hidden="true" />
                  <span>Toggle Sidebar</span>
                </SidebarTrigger>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
