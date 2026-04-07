import { AppSidebar } from "@/components/app-sidebar";
import { NotFoundPage } from "@/components/not-found-page";
import { Button } from "@repo/ui/button";
import { LogOut, ShieldAlert, User, Home } from "lucide-react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@repo/ui/sidebar";
import { useAuth } from "@/context/auth";
import { BRAND_NAMES } from "@/lib/constants";
import { setCurrentBrand } from "@/api/orders";
import { router } from "@/router";
import {
  createFileRoute,
  notFound,
  Outlet,
  redirect,
  rootRouteId,
  Link,
} from "@tanstack/react-router";
import ErthLogo from "../../assets/erth-light.svg";
import SakhtbaLogo from "../../assets/Sakkba.png";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { ConfirmationDialog } from "@repo/ui/confirmation-dialog";
import { NotificationBell } from "@/components/notification-bell";
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

type MainParam = (typeof BRAND_NAMES)[keyof typeof BRAND_NAMES];

export const Route = createFileRoute("/$main")<{
  params: { main: MainParam };
}>({
  component: RouteComponent,
  loader: async ({ params, context, cause }) => {
    const { auth } = context;

    if (
      params.main !== BRAND_NAMES.showroom &&
      params.main !== BRAND_NAMES.fromHome
    ) {
      throw notFound({ routeId: rootRouteId });
    }

    // Set module-level brand so all API calls use the correct brand
    // without needing localStorage. Must happen before any queries fire.
    // Skip during preloads: `defaultPreload: 'intent'` runs this loader on
    // link hover, which would corrupt _currentBrand for the wrong brand
    // if the user ends up navigating elsewhere.
    if (cause !== 'preload') {
      setCurrentBrand(params.main);
    }

    const brands = auth?.user?.brands ?? [];
    const hasBrandMismatch =
      brands.length > 0 && !brands.includes(params.main);

    return {
      hasBrandMismatch,
      attemptedBrand: params.main,
    };
  },
  beforeLoad: ({ context, location, params }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: `/${params.main}/login` as any,
        search: { redirect: location.href } as any,
      });
    }
  },
  notFoundComponent: NotFoundPage,
  head: ({ params }) => ({
    meta: [
      {
        title: params.main,
      },
    ],
    links: [
      {
        rel: "icon",
        type: "image/svg+xml",
        href: params.main === "erth" ? "/erth.svg" : "/Sakkba.png",
      },
    ],
  }),
});

function RouteComponent() {
  const { main } = Route.useParams();
  const loaderData = Route.useLoaderData();

  const auth = useAuth();
  const navigate = Route.useNavigate();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  useRealtimeInvalidation();

  // Apply brand-specific theme
  useEffect(() => {
    const root = document.documentElement;
    // Remove both theme classes first
    root.classList.remove("erth", "sakkba");
    // Add the current brand theme
    root.classList.add(main);

    return () => {
      // Cleanup: remove theme class when unmounting
      root.classList.remove(main);
    };
  }, [main]);

  const handleLogout = useCallback(() => {
    setShowLogoutDialog(true);
  }, []);

  const confirmLogout = useCallback(() => {
    auth.logout().then(() => {
      router.invalidate().finally(() => {
        navigate({ to: `/${main}/login` as any });
      });
    });
    setShowLogoutDialog(false);
  }, [auth, navigate, main]);

  const brandLogo = main === BRAND_NAMES.showroom ? ErthLogo : SakhtbaLogo;
  const brandName = main === BRAND_NAMES.showroom ? BRAND_NAMES.showroom : BRAND_NAMES.fromHome;
  const mainSegment = `/${main}`;

  const initials = auth.user?.name
    ? auth.user.name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const roleLabel = auth.user?.role
    ? auth.user.role.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
    : null;

  const attemptedBrandName =
    loaderData.attemptedBrand === BRAND_NAMES.showroom ? "Erth" : "Sakkba";

  // Show error page if user tried to access a brand they don't have access to
  const errorPage = (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-destructive/5 to-background p-4">
      <div className="max-w-2xl w-full bg-card border-2 border-destructive/20 rounded-2xl shadow-2xl p-6 text-center space-y-3">
        <div className="flex justify-center mb-3">
          <div className="bg-destructive/10 p-3 rounded-full">
            <ShieldAlert className="w-14 h-14 text-destructive" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>

        <p className="text-lg text-muted-foreground">
          You don't have permission to access{" "}
          <span className="font-semibold text-foreground">
            {attemptedBrandName}
          </span>
          .
        </p>

        <div className="pt-3 flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/home">
            <Button size="lg" className="w-full sm:w-auto">
              <Home className="w-4 h-4 mr-2" />
              Go to Home
            </Button>
          </Link>
          <Button
            size="lg"
            variant="outline"
            onClick={handleLogout}
            className="w-full sm:w-auto"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  );

  const sidebar = useMemo(() => (
    <AppSidebar
      collapsible="icon"
      brandLogo={brandLogo}
      brandName={brandName}
    />
  ), [brandLogo, brandName]);

  const mainLayout = (
    <SidebarProvider defaultOpen>
      <div className="flex h-screen w-screen">
        {sidebar}
        <SidebarInset className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center justify-between px-4 h-12 border-b bg-card shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="size-8" />
              <div className="flex items-center gap-2 xl:hidden">
                <img
                  src={brandLogo}
                  alt="Logo"
                  className={main === BRAND_NAMES.showroom ? "h-6 w-6 object-contain" : ""}
                  style={main !== BRAND_NAMES.showroom ? { height: 10, width: "auto", maxWidth: 24 } : undefined}
                />
                <span className="text-base brand-font capitalize tracking-wide">
                  {brandName}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors">
                    <Avatar className="h-7 w-7 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden sm:grid text-left text-sm leading-tight">
                      <span className="truncate font-medium text-xs">
                        {auth.user?.name}
                      </span>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-lg" sideOffset={4}>
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-2 py-2 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">
                          {auth.user?.name}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {roleLabel}
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
                  <DropdownMenuItem onClick={handleLogout}>
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

  return (
    <>
      {loaderData.hasBrandMismatch ? errorPage : mainLayout}
      <ConfirmationDialog
        isOpen={showLogoutDialog}
        onClose={() => setShowLogoutDialog(false)}
        onConfirm={confirmLogout}
        title="Confirm Logout"
        description="Are you sure you want to logout?"
        confirmText="Logout"
        cancelText="Cancel"
      />
    </>
  );
}
