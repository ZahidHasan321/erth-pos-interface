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
  useSidebar,
} from "@repo/ui/sidebar";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { useTransferRequests } from "@/hooks/useTransfers";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  BarChart,
  CirclePause,
  CalendarClock,
  Columns3,
  Activity,
  Droplets,
  Scissors,
  Truck,
  CircleCheckBig,
  Users,
  DollarSign,
  LayoutDashboard,
  ChevronDown,
  TrendingUp,
  ShieldCheck,
  UserCog,
  Package,
  Building2,
  ClipboardCheck,
} from "lucide-react";
import { IconNeedle, IconIroning1, IconRosette, IconSparkles /*, IconStack2 */ } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import { isAdmin, isManager } from "@/lib/rbac";

export function WorkshopSidebar() {
  const { data: counts } = useSidebarCounts();
  const { data: receivingDeliveries = [] } = useTransferRequests({ status: "dispatched", direction: "shop_to_workshop" });
  // Requests the shop made that the workshop must send (no approve step — §4).
  const { data: sendRequests = [] } = useTransferRequests({ status: ["requested"], direction: "workshop_to_shop" });
  const { isMobile, setOpenMobile, state } = useSidebar();
  const routerState = useRouterState({ select: (s) => s.location.pathname });
  const { user: authUser } = useAuth();

  const isActive = (href: string) =>
    routerState === href || routerState.startsWith(href + "/");

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
    { label: "Receiving",          icon: ArrowDownToLine, href: "/receiving",  count: counts?.receiving },
    { label: "Parking",            icon: CirclePause,     href: "/parking",    count: counts?.parking },
    { label: "Scheduler",          icon: CalendarClock,   href: "/scheduler",  count: counts?.scheduler },
    { label: "Production Board",   icon: Columns3,        href: "/board" },
    { label: "Production Tracker", icon: Activity,        href: "/assigned" },
  ];

  const peopleItems = [
    { label: "Team", icon: Users, href: "/team" },
    ...((isAdmin(authUser) || isManager(authUser)) ? [{ label: "Users", icon: UserCog, href: "/users" }] : []),
  ];

  // Insights — analytics surfaces, separated from People (team management).
  // QC Analytics + Performance moved out of People (CLAUDE.md §6).
  const insightsItems = [
    { label: "Performance",  icon: TrendingUp,  href: "/performance" },
    { label: "QC Analytics", icon: ShieldCheck, href: "/qc-analytics" },
  ];

  const fulfillmentItems = [
    { label: "Dispatch",        icon: Truck,            href: "/dispatch",   count: counts?.dispatch },
    { label: "Completed",       icon: CircleCheckBig,   href: "/completed" },
    { label: "Pricing",         icon: DollarSign,       href: "/pricing" },
  ];

  // Combined "needs my action" count for the Transfers tab — warrants warn tone
  const transfersBadge = receivingDeliveries.length + sendRequests.length;

  const storeItems = [
    { label: "Inventory", icon: Package,        href: "/store/inventory" },
    { label: "Transfers", icon: ArrowRightLeft, href: "/store/transfers", count: transfersBadge, badgeTone: "warn" as const },
    { label: "Stocktake", icon: ClipboardCheck, href: "/store/stocktake" },
    { label: "Suppliers", icon: Building2,      href: "/store/suppliers" },
    { label: "Reports",   icon: BarChart,       href: "/store/reports" },
  ];

  const terminalItems = [
    { label: "Soaking",       icon: Droplets,     href: "/terminals/soaking",       count: counts?.soaking,       color: "text-sky-700" },
    { label: "Cutting",       icon: Scissors,     href: "/terminals/cutting",       count: counts?.cutting,       color: "text-amber-700" },
    // TEMP DISABLED: post_cutting terminal hidden
    // { label: "Post-Cutting",  icon: IconStack2,    href: "/terminals/post-cutting",  count: counts?.post_cutting,  color: "text-orange-700" },
    { label: "Sewing",        icon: IconNeedle,   href: "/terminals/sewing",        count: counts?.sewing,        color: "text-purple-700" },
    { label: "Finishing",     icon: IconSparkles, href: "/terminals/finishing",     count: counts?.finishing,     color: "text-emerald-700" },
    { label: "Ironing",       icon: IconIroning1, href: "/terminals/ironing",       count: counts?.ironing,       color: "text-rose-700" },
    { label: "Quality Check", icon: IconRosette,  href: "/terminals/quality-check", count: counts?.quality_check, color: "text-indigo-700" },
  ];

  const totalTerminalCount = terminalItems.reduce((s, t) => s + (t.count ?? 0), 0);
  const isCollapsedDesktop = state === "collapsed" && !isMobile;
  const canSeeTerminals = isAdmin(authUser) || isManager(authUser);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4 border-b group-data-[collapsible=icon]:px-1.5">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-semibold text-sm shrink-0">
            W
          </div>
          <span className="font-semibold text-sm group-data-[collapsible=icon]:hidden">
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
                <SidebarMenuButton asChild isActive={isActive("/dashboard")}>
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
                  <SidebarMenuButton asChild isActive={isActive(item.href)}>
                    <Link to={item.href}>
                      <item.icon className="w-4 h-4" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {!!item.count && (
                    <SidebarMenuBadge className="bg-muted text-foreground">
                      {item.count}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Terminals — collapsible to reduce clutter. Hidden from staff;
            only admin/superadmin and workshop managers can open terminals
            here. Terminal-role users have their own dedicated layout. */}
        {canSeeTerminals && (
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
                    <span className="text-xs font-medium tabular-nums text-muted-foreground mr-1">
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
          <div
            className="grid transition-[grid-template-rows] duration-200 ease-in-out"
            style={{ gridTemplateRows: terminalsOpen ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <SidebarGroupContent>
                <SidebarMenu>
                  {terminalItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item.href)}>
                        <Link to={item.href}>
                          <item.icon className={cn("w-4 h-4", item.color)} aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {!!item.count && (
                        <SidebarMenuBadge className="bg-muted text-foreground">
                          {item.count}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </div>
          </div>
        </SidebarGroup>
        )}

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>People</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {peopleItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)}>
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
          <SidebarGroupLabel>Insights</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {insightsItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)}>
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
          <SidebarGroupLabel>Fulfillment</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {fulfillmentItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)}>
                    <Link to={item.href}>
                      <item.icon className="w-4 h-4" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {!!item.count && (
                    <SidebarMenuBadge className="bg-muted text-foreground">
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
          <SidebarGroupLabel>Store</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {storeItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)}>
                    <Link to={item.href}>
                      <item.icon className="w-4 h-4" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {!!item.count && (
                    <SidebarMenuBadge
                      className={cn(
                        item.badgeTone === "warn"
                          ? "bg-[var(--status-warn-bg)] text-[var(--status-warn)]"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {item.count}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t px-3 py-2 group-data-[collapsible=icon]:hidden">
        <p className="text-[11px] text-muted-foreground/50 text-center">
          &copy; {new Date().getFullYear()} Alpaca. All rights reserved.
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
