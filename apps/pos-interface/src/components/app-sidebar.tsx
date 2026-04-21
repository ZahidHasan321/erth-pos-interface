import { Link, useMatchRoute, useParams } from "@tanstack/react-router";
import * as React from "react";
import {
  ChevronDown,
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
  Scissors,
  FileText,
  History,
  Banknote,
  CalendarDays,
  ListChecks,
  Package,
} from "lucide-react";

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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@repo/ui/sidebar";
import { BRAND_NAMES } from "@/lib/constants";
import { IconRulerMeasure } from "@tabler/icons-react";
import { useTransferBadgeCounts } from "@/hooks/useTransfers";

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
          title: "New Alteration Order",
          url: "orders/new-alteration-order",
          icon: Scissors,
          allowedBrands: ["erth", "qass"] as const,
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
          erthOnly: true,
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
          title: "Request Delivery",
          url: "store/request-delivery",
          icon: Truck,
        },
        {
          title: "Active Requests",
          url: "store/active-requests",
          icon: ListChecks,
        },
        {
          title: "Approve Requests",
          url: "store/approve-requests",
          icon: ClipboardCheck,
        },
        {
          title: "Receiving Deliveries",
          url: "store/receiving-deliveries",
          icon: PackageOpen,
        },
        {
          title: "Transfer History",
          url: "store/transfer-history",
          icon: History,
        },
        {
          title: "Inventory",
          url: "store/inventory",
          icon: Package,
        },
        {
          title: "Stock Report",
          url: "store/stock-report",
          icon: BarChart,
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
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  brandName: string;
  brandLogo: string;
}) {
  type SidebarLinkProps = {
    to: string;
    title: string;
    icon?: React.ComponentType<{ className?: string }>;
    disabled?: boolean;
    exactMatch?: boolean;
    count?: number;
    badgeColor?: string;
  };

  const SidebarLink: React.FC<SidebarLinkProps> = ({
    to,
    title,
    icon: Icon,
    disabled = false,
    exactMatch = false,
    count,
    badgeColor = "bg-blue-100 text-blue-700",
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
        {!!count && (
          <SidebarMenuBadge className={`font-bold ${badgeColor}`}>
            {count}
          </SidebarMenuBadge>
        )}
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
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-in-out"
          style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
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
          </div>
        </div>
      </SidebarMenuItem>
    );
  };

  const { main } = useParams({ strict: false });
  const mainSegment = main ? `/${main}` : BRAND_NAMES.showroom;
  const isErth = main === BRAND_NAMES.showroom;
  const { data: badgeCounts } = useTransferBadgeCounts(isErth);

  const storeCounts: Record<string, { count: number; badgeColor: string }> = {
    "store/active-requests": { count: badgeCounts?.activeRequests ?? 0, badgeColor: "bg-blue-100 text-blue-700" },
    "store/receiving-deliveries": { count: badgeCounts?.receivingDeliveries ?? 0, badgeColor: "bg-blue-100 text-blue-700" },
    "store/approve-requests": { count: badgeCounts?.approveRequests ?? 0, badgeColor: "bg-amber-100 text-amber-700" },
  };

  return (
    <Sidebar {...props}>
      <SidebarHeader className="border-b border-sidebar-border pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={brandName}>
              <Link to="/$main" params={{ main: main ?? BRAND_NAMES.showroom }}>
                <div className="flex aspect-square size-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/10 group-data-[collapsible=icon]:size-8">
                  <img
                    src={brandLogo}
                    alt="Logo"
                    className={isErth ? "size-7 object-contain group-data-[collapsible=icon]:size-5" : ""}
                    style={!isErth ? { height: 12, width: "auto", maxWidth: 28 } : undefined}
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
        {data.navMain.filter(item => isErth || item.title !== "Store Management").map((item) => (
          <SidebarGroup key={item.title}>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
              {item.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {item.items.filter((subItem: any) => {
                  if (subItem.erthOnly && !isErth) return false;
                  if (subItem.allowedBrands && !subItem.allowedBrands.includes(main)) return false;
                  return true;
                }).map((subItem: any) => {
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

                  const countInfo = subItem.url ? storeCounts[subItem.url] : undefined;
                  return (
                    <SidebarLink
                      key={subItem.title}
                      to={`${mainSegment}/${item.url ? `${item.url}/` : ""}${subItem.url}`}
                      title={subItem.title}
                      icon={subItem.icon}
                      disabled={false}
                      count={countInfo?.count}
                      badgeColor={countInfo?.badgeColor}
                    />
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t px-3 py-2 group-data-[collapsible=icon]:hidden">
        <p className="text-[10px] text-muted-foreground/50 text-center">
          &copy; {new Date().getFullYear()} Alpaca. All rights reserved.
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
