import { Link, useParams, useRouterState } from "@tanstack/react-router";
import * as React from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Store,
  ClipboardList,
  Truck,
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
  SidebarRail,
} from "@repo/ui/sidebar";
import { BRAND_NAMES, brandUsesCashier, isHomeBasedBrand } from "@/lib/constants";
import { useTransferBadgeCounts } from "@/hooks/useTransfers";
import { useAuth } from "@/context/auth";

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
          title: "Appointments",
          url: "appointments-list",
          icon: CalendarDays,
          allowedBrands: ["erth"] as const,
        },
        {
          title: "Delivery",
          url: "delivery",
          icon: PackageCheck,
          homeBrandOnly: true,
        },
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
    {
      title: "Cashier",
      url: "",
      items: [
        {
          title: "Cashier",
          url: "cashier",
          icon: Banknote,
          cashierBrandOnly: true,
        },
      ],
    },
    {
      title: "Store Management",
      url: "",
      items: [
        {
          title: "Inventory",
          url: "store/inventory",
          icon: Package,
        },
        {
          title: "Transfers",
          url: "store/transfers",
          icon: Truck,
        },
        {
          title: "Stocktake",
          url: "store/stocktake",
          icon: ClipboardList,
        },
        {
          title: "Suppliers",
          url: "store/suppliers",
          icon: Users,
        },
        {
          title: "Reports",
          url: "store/reports",
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

type NavSubItem = {
  title: string;
  url: string;
  icon?: React.ComponentType<{ className?: string }>;
  cashierBrandOnly?: boolean;
  homeBrandOnly?: boolean;
  allowedBrands?: readonly string[];
  count?: number;
};

type IsPathActive = (to: string, exact?: boolean) => boolean;

type SidebarLinkProps = {
  to: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  exactMatch?: boolean;
  count?: number;
  badgeColor?: string;
  isPathActive: IsPathActive;
};

const SidebarLink: React.FC<SidebarLinkProps> = ({
  to,
  title,
  icon: Icon,
  disabled = false,
  exactMatch = false,
  count,
  badgeColor = "bg-blue-100 text-blue-700",
  isPathActive,
}) => {
  const active = isPathActive(to, exactMatch);

  const isNewOrderPage =
    typeof window !== "undefined" &&
    /^\/orders\/new-/.test(window.location.pathname);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
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

export function AppSidebar({
  brandLogo,
  brandName,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  brandName: string;
  brandLogo: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPathActive: IsPathActive = (to, exact = false) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  const { user } = useAuth();
  // Measurement takers (§5) are restricted to order-taking: no Store Management
  // (stock/transfers/stocktake/suppliers/reports/EOD) and no Cashier surface.
  const isMeasurementTaker = user?.role === "measurement_taker";

  const { main } = useParams({ strict: false });
  const mainSegment = main ? `/${main}` : BRAND_NAMES.showroom;
  const isErth = main === BRAND_NAMES.showroom;
  const { data: badgeCounts } = useTransferBadgeCounts(isErth);

  // Sum of states that need user action — surfaced on Transfers as a single badge
  const transfersBadgeCount = (badgeCounts?.activeRequests ?? 0) + (badgeCounts?.receivingDeliveries ?? 0) + (badgeCounts?.sendRequests ?? 0);
  const storeCounts: Record<string, { count: number; badgeColor: string }> = {
    "store/transfers": { count: transfersBadgeCount, badgeColor: "bg-amber-100 text-amber-700" },
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
                  isPathActive={isPathActive}
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
                  isPathActive={isPathActive}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Nav groups */}
        {data.navMain
          .filter((item) => isErth || item.title !== "Store Management")
          // Measurement takers see neither Store Management nor Cashier.
          .filter((item) => !isMeasurementTaker || (item.title !== "Store Management" && item.title !== "Cashier"))
          .map((item) => {
            const visibleItems = (item.items as NavSubItem[]).filter((subItem) => {
              if (subItem.cashierBrandOnly && !brandUsesCashier(main)) return false;
              if (subItem.homeBrandOnly && !isHomeBasedBrand(main)) return false;
              if (subItem.allowedBrands && !subItem.allowedBrands.includes(main)) return false;
              return true;
            });

            if (visibleItems.length === 0) return null;

            return (
              <SidebarGroup key={item.title}>
                <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">
                  {item.title}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {visibleItems.map((subItem) => {
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
                          isPathActive={isPathActive}
                        />
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
      </SidebarContent>

      <SidebarFooter className="border-t px-3 py-2 group-data-[collapsible=icon]:hidden">
        <p className="text-[10px] text-muted-foreground text-center">
          &copy; {new Date().getFullYear()} Alpaca. All rights reserved.
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
