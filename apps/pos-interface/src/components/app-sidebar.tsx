import { Link, useMatchRoute, useParams } from "@tanstack/react-router";
import * as React from "react";
import {
  ChevronDown,
  ChevronsUpDown,
  LayoutDashboard,
  ShoppingCart,
  Users,
  Store,
  ClipboardList,
  ClipboardCheck,
  Truck,
  PackageOpen,
  ArrowUpFromLine,
  Link2,
  Unlink,
  PackageCheck,
  BarChart,
  PackagePlus,
  FileText,
  Menu,
  History,
  Banknote,
  CalendarDays,
  User,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@repo/ui/sidebar";
import { BRAND_NAMES } from "@/lib/constants";
import { LogOut, Home } from "lucide-react";
import { IconRulerMeasure } from "@tabler/icons-react";
import { useAuth } from "@/context/auth";
import { NotificationBell } from "./notification-bell";
import { Avatar, AvatarFallback } from "@repo/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/dropdown-menu";

const data = {
  navTop: [
    {
      title: "Dashboard",
      url: "/",
      icon: LayoutDashboard,
    },
  ],
  navMain: [
    {
      title: "Orders & Customers",
      url: "",
      items: [
        {
          title: "New Work Order",
          url: "orders/new-work-order",
          icon: PackagePlus,
        },
        {
          title: "New Sales Order",
          url: "orders/new-sales-order",
          icon: ShoppingCart,
        },
        {
          title: "Orders at Showroom",
          url: "orders/orders-at-showroom",
          icon: Store,
        },
        {
          title: "Customers",
          url: "customers",
          icon: Users,
        },
        {
          title: "Order History",
          url: "orders/order-history",
          icon: History,
        },
        {
          title: "Cashier",
          url: "cashier",
          icon: Banknote,
        },
        {
          title: "Alterations",
          url: "orders/order-management/alterations",
          icon: IconRulerMeasure,
        },
        {
          title: "Order Management",
          isCollapsible: true,
          icon: ClipboardList,
          items: [
            {
              title: "Dispatch Orders",
              url: "orders/order-management/dispatch",
              icon: ArrowUpFromLine,
            },
            {
              title: "Link Orders",
              url: "orders/order-management/link",
              icon: Link2,
            },
            {
              title: "Unlink Orders",
              url: "orders/order-management/unlink",
              icon: Unlink,
            },
            {
              title: "Receiving Brova / Final",
              url: "orders/order-management/receiving-brova-final",
              icon: PackageCheck,
            },
          ],
        },
      ],
    },
    {
      title: "Store Management",
      url: "",
      items: [
        {
          title: "Stock Report",
          url: "store/stock-report",
          icon: BarChart,
        },
        {
          title: "Receiving Deliveries",
          url: "store/receiving-deliveries",
          icon: PackageOpen,
        },
        {
          title: "Request Delivery",
          url: "store/request-delivery",
          icon: Truck,
        },
        {
          title: "Approve Requests",
          url: "store/approve-requests",
          icon: ClipboardCheck,
        },
        {
          title: "End of Day Report",
          url: "store/end-of-day-report",
          icon: FileText,
        },
      ],
    },
  ],
};

export function AppSidebar({
  brandLogo,
  brandName,
  onLogout,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  brandName: string;
  brandLogo: string;
  onLogout: () => void;
}) {
  type SidebarLinkProps = {
    to: string;
    title: string;
    icon?: React.ComponentType<{ className?: string }>;
    disabled?: boolean;
    exactMatch?: boolean;
  };

  const SidebarLink: React.FC<SidebarLinkProps> = ({
    to,
    title,
    icon: Icon,
    disabled = false,
    exactMatch = false,
  }) => {
    const matchRoute = useMatchRoute();
    const match = exactMatch
      ? matchRoute({ to })
      : matchRoute({ to, fuzzy: true });

    const isNewOrderPage =
      typeof window !== "undefined" &&
      /^\/orders\/new-/.test(window.location.pathname);

    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={!!match}
          disabled={disabled}
          tooltip={title}
        >
          <Link
            to={to}
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            style={disabled ? { pointerEvents: "none", opacity: 0.5 } : {}}
            {...(isNewOrderPage
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
            <span>{title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  type CollapsibleMenuItemProps = {
    title: string;
    icon?: React.ComponentType<{ className?: string }>;
    items: Array<{ title: string; url: string; icon?: React.ComponentType<{ className?: string }>; count?: number }>;
    mainSegment: string;
  };

  const CollapsibleMenuItem: React.FC<CollapsibleMenuItemProps> = ({
    title,
    icon: Icon,
    items,
    mainSegment,
  }) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const matchRoute = useMatchRoute();
    const { setOpen } = useSidebar();
    const totalCount = items.reduce((sum, item) => sum + (item.count ?? 0), 0);

    const hasActiveChild = items.some((item) =>
      matchRoute({ to: `${mainSegment}/${item.url}`, fuzzy: true })
    );

    React.useEffect(() => {
      if (hasActiveChild) {
        setIsOpen(true);
      }
    }, [hasActiveChild]);

    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => {
            setIsOpen(!isOpen);
            setOpen(true);
          }}
          isActive={hasActiveChild}
          tooltip={title}
        >
          {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
          <span>{title}</span>
          {!isOpen && totalCount > 0 && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-md bg-blue-100 px-1 text-[10px] font-bold tabular-nums text-blue-700">
              {totalCount}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
              !isOpen && !totalCount ? "ml-auto" : ""
            } ${isOpen ? "rotate-180" : ""}`}
          />
        </SidebarMenuButton>
        {isOpen && (
          <SidebarMenuSub className="mt-1 space-y-0.5 border-l-2 border-primary/15">
            {items.map((subItem) => {
              const match = matchRoute({
                to: `${mainSegment}/${subItem.url}`,
                fuzzy: true,
              });
              const isNewOrderPage =
                typeof window !== "undefined" &&
                /^\/orders\/new-/.test(window.location.pathname);

              return (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuSubButton asChild isActive={!!match}>
                    <Link
                      to={`${mainSegment}/${subItem.url}`}
                      {...(isNewOrderPage
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                    >
                      {subItem.icon && <subItem.icon className="h-3.5 w-3.5" aria-hidden="true" />}
                      <span className="flex-1">{subItem.title}</span>
                      {!!subItem.count && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-md bg-blue-100 px-1 text-[10px] font-bold tabular-nums text-blue-700">
                          {subItem.count}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>
    );
  };

  const { main } = useParams({ strict: false });
  const mainSegment = main ? `/${main}` : BRAND_NAMES.showroom;
  const { isMobile } = useSidebar();
  const { user } = useAuth();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const roleLabel = user?.role
    ? user.role.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return (
    <Sidebar {...props}>
      <SidebarHeader className="border-b border-sidebar-border pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center">
              <SidebarMenuButton size="lg" asChild tooltip={brandName} className="flex-1">
                <Link to="/$main" params={{ main: main ?? BRAND_NAMES.showroom }}>
                  <div className="flex aspect-square size-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/10 group-data-[collapsible=icon]:size-8">
                    <img
                      src={brandLogo}
                      alt="Logo"
                      className="size-7 object-contain group-data-[collapsible=icon]:size-5"
                    />
                  </div>
                  <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-xl brand-font capitalize tracking-wide">
                      {brandName}
                    </span>
                    <span className="truncate text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                      Tailoring System
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
              <div className="group-data-[collapsible=icon]:hidden">
                <NotificationBell />
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="mt-2 flex-1 overflow-y-auto pb-4">
        {/* Dashboard */}
        <SidebarGroup key="top">
          <SidebarGroupContent>
            <SidebarMenu>
              {data.navTop.map((item) => (
                <SidebarLink
                  key={item.title}
                  to={item.url === "/" ? mainSegment || "/" : item.url}
                  title={item.title}
                  icon={item.icon}
                  exactMatch={true}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Home Visits — SAKKBA only */}
        {main === BRAND_NAMES.fromHome && (
          <SidebarGroup key="home-visits">
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
              Home Visits
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarLink
                  to={`${mainSegment}/appointments`}
                  title="Appointments"
                  icon={CalendarDays}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Nav groups */}
        {data.navMain.map((item) => (
          <SidebarGroup key={item.title}>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
              {item.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {item.items.map((subItem: any) => {
                  if (subItem.isCollapsible && subItem.items) {
                    return (
                      <CollapsibleMenuItem
                        key={subItem.title}
                        title={subItem.title}
                        icon={subItem.icon}
                        items={subItem.items}
                        mainSegment={mainSegment}
                      />
                    );
                  }

                  return (
                    <SidebarLink
                      key={subItem.title}
                      to={`${mainSegment}/${item.url ? `${item.url}/` : ""}${subItem.url}`}
                      title={subItem.title}
                      icon={subItem.icon}
                      disabled={false}
                    />
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="mt-auto border-t border-sidebar-border pt-2 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={user?.name ?? "Profile"}
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold">
                      {user?.name}
                    </span>
                    {roleLabel && (
                      <span className="truncate text-xs text-muted-foreground">
                        {roleLabel}
                      </span>
                    )}
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
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {user?.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user?.username}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link to={`${mainSegment}/profile`}>
                      <User className="h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/home">
                      <Home className="h-4 w-4" />
                      Switch Brand
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
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
                  <Menu className="h-4 w-4" aria-hidden="true" />
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
