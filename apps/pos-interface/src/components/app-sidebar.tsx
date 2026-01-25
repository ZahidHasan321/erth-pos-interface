import { Link, useMatchRoute, useParams } from "@tanstack/react-router";
import * as React from "react";
import {
  ChevronDown,
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  Store,
  Settings,
  Truck,
  PackageOpen,
  Send,
  Link2,
  Unlink,
  PackageCheck,
  Wrench,
  MessageSquare,
  Edit,
  XCircle,
  BarChart,
  PackagePlus,
  FileText,
  Menu,
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
} from "@/components/ui/sidebar";
import { BRAND_NAMES } from "@/lib/constants";
import { LogOut, Home } from "lucide-react";

// This is sample data.
const data = {
  versions: ["1.0.1", "1.1.0-alpha", "2.0.0-beta1"],
  navTop: [
    {
      title: "Dashboard",
      url: "/",
      icon: LayoutDashboard,
    },
  ],
  navMain: [
    {
      title: "Order & Customers",
      url: "",
      icon: ShoppingBag,
      items: [
        {
          title: "New Work Order",
          url: "orders/new-work-order",
          icon: PackagePlus,
        },
        {
          title: "New Sales Order",
          url: "orders/new-sales-order",
          icon: ShoppingBag,
        },
        {
          title: "New Alternation Order",
          url: "orders/new-alteration-order",
          icon: Edit,
        },
        {
          title: "Customer Profiles & Orders",
          url: "orders/customer-profiles-orders",
          icon: Users,
        },
        {
          title: "Orders at Showroom",
          url: "orders/orders-at-showroom",
          icon: Store,
        },
        {
          title: "Order Management",
          isCollapsible: true,
          icon: Settings,
          items: [
            {
              title: "Dispatch Orders",
              url: "orders/order-management/dispatch",
              icon: Send,
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
            {
              title: "Change Options",
              url: "orders/order-management/change-options",
              icon: Wrench,
            },
            {
              title: "Brova Feedback",
              url: "orders/order-management/brova-feedback",
              icon: MessageSquare,
            },
            {
              title: "Final Feedback",
              url: "orders/order-management/final-feedback",
              icon: MessageSquare,
            },
            {
              title: "Alterations",
              url: "orders/order-management/alterations",
              icon: Edit,
            },
            {
              title: "Cancel Order",
              url: "orders/order-management/cancel-order",
              icon: XCircle,
            },
          ],
        },
      ],
    },
    {
      title: "Store Management",
      url: "",
      icon: Package,
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
    exactMatch?: boolean; // New prop
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

    // Check if the current page is a "new-order" type page:
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
            // When on new-order page, open in a new tab:
            {...(isNewOrderPage
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {Icon && <Icon className="h-4 w-4" />}
            <span>{title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  type CollapsibleMenuItemProps = {
    title: string;
    icon?: React.ComponentType<{ className?: string }>;
    items: Array<{ title: string; url: string; icon?: React.ComponentType<{ className?: string }> }>;
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

    // Check if any sub-item is active
    const hasActiveChild = items.some((item) =>
      matchRoute({ to: `${mainSegment}/${item.url}`, fuzzy: true })
    );

    // Auto-expand if a child is active
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
            setOpen(true); // Expand sidebar when clicking collapsible item
          }}
          isActive={hasActiveChild}
          tooltip={title}
        >
          {Icon && <Icon className="h-4 w-4" />}
          <span>{title}</span>
          <ChevronDown
            className={`ml-auto h-4 w-4 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </SidebarMenuButton>
        {isOpen && (
          <SidebarMenuSub className="ml-3 mt-1 space-y-1 border-l-2 border-border/40 pl-3">
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
                      {subItem.icon && <subItem.icon className="h-4 w-4" />}
                      <span>{subItem.title}</span>
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

  const { main } = useParams({ strict: false }); // Get the dynamic 'main' parameter
  const mainSegment = main ? `/${main}` : BRAND_NAMES.showroom; // Construct the main segment

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
              <SidebarMenuButton size="lg" asChild tooltip={brandName}>
                <Link to="/$main" params={{ main: main ?? BRAND_NAMES.showroom }}>
                  <div className="flex aspect-square size-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 group-data-[collapsible=icon]:size-8">
                    <img
                      src={brandLogo}
                      alt="Logo"
                      className="size-8 object-contain group-data-[collapsible=icon]:size-6"
                    />
                  </div>
                  <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate !text-xl brand-font capitalize">
                      {brandName}
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="mt-6 flex-1 overflow-y-auto">
        {/* Top-level navigation items. */}
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

        {/* We create a SidebarGroup for each parent. */}
        {data.navMain.map((item) => (
          <SidebarGroup key={item.title}>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
              {item.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {item.items.map((subItem: any) => {
                  // Check if this is a collapsible item
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

                  // Regular menu item
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
      <SidebarFooter className="mt-auto">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Switch Brand">
              <Link to="/home">
                <Home className="h-4 w-4" />
                <span>Switch Brand</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onLogout} tooltip="Logout">
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="hidden md:block">
            <SidebarMenuButton asChild tooltip="Toggle Sidebar">
              <SidebarTrigger>
                <Menu className="h-4 w-4" />
                <span>Toggle Sidebar</span>
              </SidebarTrigger>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

