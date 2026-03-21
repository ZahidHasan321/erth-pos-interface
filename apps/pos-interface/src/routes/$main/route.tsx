import { AppSidebar } from "@/components/app-sidebar";
import { NotFoundPage } from "@/components/not-found-page";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldAlert } from "lucide-react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useAuth } from "@/context/auth";
import { BRAND_NAMES } from "@/lib/constants";
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
import { useQueryClient } from "@tanstack/react-query";
import { getFabrics } from "@/api/fabrics";
import { getEmployees } from "@/api/employees";
import { getPrices } from "@/api/prices";
import { getStyles } from "@/api/styles";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

type MainParam = (typeof BRAND_NAMES)[keyof typeof BRAND_NAMES];

export const Route = createFileRoute("/$main")<{
  params: { main: MainParam };
}>({
  component: RouteComponent,
  loader: async ({ params, context }) => {
    const { auth } = context;

    if (
      params.main !== BRAND_NAMES.showroom &&
      params.main !== BRAND_NAMES.fromHome
    ) {
      throw notFound({ routeId: rootRouteId });
    }

    // Return whether there's a brand mismatch
    return {
      hasBrandMismatch: auth?.user?.userType !== params.main,
      userBrand: auth?.user?.userType,
      attemptedBrand: params.main,
    };
  },
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
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

  // Prefetch static data at layout level so it's cached before any page needs it.
  // These all use staleTime: Infinity at their call sites, so they fetch once and
  // stay in cache until explicitly invalidated (e.g. after order mutations).
  const queryClient = useQueryClient();
  useEffect(() => {
    const opts = { staleTime: Infinity, gcTime: Infinity };
    queryClient.prefetchQuery({ queryKey: ["fabrics"], queryFn: getFabrics, ...opts });
    queryClient.prefetchQuery({ queryKey: ["employees"], queryFn: getEmployees, ...opts });
    queryClient.prefetchQuery({ queryKey: ["prices"], queryFn: getPrices, ...opts });
    queryClient.prefetchQuery({ queryKey: ["styles"], queryFn: getStyles, ...opts });
  }, [queryClient]);

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
        navigate({ to: "/" });
      });
    });
    setShowLogoutDialog(false);
  }, [auth, navigate]);

  const brandLogo = main === BRAND_NAMES.showroom ? ErthLogo : SakhtbaLogo;
  const brandName = main === BRAND_NAMES.showroom ? BRAND_NAMES.showroom : BRAND_NAMES.fromHome;

  const attemptedBrandName =
    loaderData.attemptedBrand === BRAND_NAMES.showroom ? "Erth" : "Sakkba";
  const userBrandName =
    loaderData.userBrand === BRAND_NAMES.showroom ? "Erth" : "Sakkba";

  // Show error page if user tried to access wrong brand
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

        <p className="text-base text-muted-foreground">
          You are currently logged in as a{" "}
          <span className="font-semibold text-foreground">{userBrandName}</span>{" "}
          user.
        </p>

        <div className="pt-3 flex flex-col sm:flex-row gap-4 justify-center">
          <Link to={`/${loaderData.userBrand}`}>
            <Button size="lg" className="w-full sm:w-auto">
              Go to {userBrandName}
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
      onLogout={handleLogout}
    />
  ), [brandLogo, brandName, handleLogout]);

  const mobileHeader = useMemo(() => (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b bg-background/95 backdrop-blur-sm px-4 xl:hidden">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-2">
          <img
            src={brandLogo}
            alt="Logo"
            className="h-6 w-6 object-contain"
          />
          <span className="text-base brand-font capitalize tracking-wide">
            {brandName}
          </span>
        </div>
      </div>
    </header>
  ), [brandLogo, brandName]);

  const mainLayout = (
    <SidebarProvider defaultOpen>
      <div className="flex h-screen w-screen">
        {sidebar}
        <SidebarInset className="flex-1 flex flex-col min-w-0">
          {mobileHeader}
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
