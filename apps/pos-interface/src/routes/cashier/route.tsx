import { useState, useEffect } from "react";
import {
    createFileRoute,
    redirect,
    useNavigate,
    useRouterState,
    Link,
    Outlet,
} from "@tanstack/react-router";
import { Banknote, History, FileText, LogOut } from "lucide-react";
import { Button } from "@repo/ui/button";
import { useAuth } from "@/context/auth";
import { getBrand, setCurrentBrand } from "@/api/orders";
import { BRAND_NAMES, brandUsesCashier } from "@/lib/constants";
import { router } from "@/router";
import { ConfirmationDialog } from "@repo/ui/confirmation-dialog";
import ErthLogo from "@/assets/erth-light.svg";
import SakhtbaLogo from "@/assets/Sakkba.png";
import { cn } from "@/lib/utils";

// Cashier shell is intentionally distinct from the brand-prefixed /$main shell.
// It hosts the only three pages a `cashier:shop` user is allowed to use, so
// they never see brand selection, sidebars, or any of the office-wide
// navigation. Other roles (admin / manager / staff) can still reach the same
// routes by url if they want a focused payment workflow.
export const Route = createFileRoute("/cashier")({
    component: CashierLayout,
    beforeLoad: ({ context, location }) => {
        if (!context.auth.isAuthenticated) {
            throw redirect({
                to: "/login",
                search: { redirect: location.href },
            });
        }
        const user = (context.auth as { user?: { role?: string; job_functions?: string[]; brands?: string[] } }).user;
        // Terminal workshop staff have no place in POS at all.
        if (user && user.role === "staff" && Array.isArray(user.job_functions) && user.job_functions.length > 0) {
            throw redirect({
                to: "/login",
                search: { redirect: undefined },
            });
        }
        // Brand gate: the cashier shell only exists for brands on the
        // deferred-payment model (BRANDS_WITH_CASHIER). Deny direct-URL
        // access for any other brand, regardless of role.
        const userBrand = Array.isArray(user?.brands) ? user.brands[0] : null;
        if (!brandUsesCashier(userBrand)) {
            throw redirect({ to: "/" });
        }
        // Cashier role is bound to a single brand stamped on their user row.
        // Without setting it here their API calls would fall back to the
        // module-level default ("ERTH") and silently leak across brands.
        if (user?.role === "cashier" && userBrand) {
            setCurrentBrand(userBrand);
        }
    },
    head: () => ({
        meta: [{ title: "Cashier Terminal" }],
    }),
});

const TABS = [
    { to: "/cashier", label: "Cashier", icon: Banknote, exact: false, matchPrefix: "/cashier" },
    { to: "/cashier/history", label: "Order History", icon: History, exact: false, matchPrefix: "/cashier/history" },
    { to: "/cashier/eod", label: "End of Day", icon: FileText, exact: false, matchPrefix: "/cashier/eod" },
] as const;

function CashierLayout() {
    const [showLogoutDialog, setShowLogoutDialog] = useState(false);
    const auth = useAuth();
    const navigate = useNavigate();
    const pathname = useRouterState({ select: (s) => s.location.pathname });

    const brandKey = getBrand().toLowerCase();
    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove("erth", "sakkba");
        root.classList.add(brandKey);
        return () => { root.classList.remove(brandKey); };
    }, [brandKey]);

    const brandLogo = brandKey === BRAND_NAMES.fromHome ? SakhtbaLogo : ErthLogo;

    const handleLogout = () => {
        auth.logout().then(() => {
            router.invalidate().finally(() => {
                navigate({ to: "/" });
            });
        });
        setShowLogoutDialog(false);
    };

    // Active tab = longest matching prefix. /cashier/history matches before
    // /cashier so the order-history tab wins on its own pages.
    const activeTab =
        [...TABS]
            .sort((a, b) => b.matchPrefix.length - a.matchPrefix.length)
            .find((t) => pathname === t.matchPrefix || pathname.startsWith(t.matchPrefix + "/"))
            ?.to ?? "/cashier";

    return (
        <div className="h-screen flex flex-col bg-background">
            <header className="flex items-center gap-3 px-4 py-2 border-b bg-card shrink-0">
                <div className="flex items-center gap-2 shrink-0">
                    <img src={brandLogo} alt="Logo" className="h-7 w-7 object-contain" />
                    <span className="text-sm font-bold hidden sm:block">Cashier</span>
                </div>
                <nav className="flex items-center gap-1 ml-2">
                    {TABS.map((t) => {
                        const Icon = t.icon;
                        const isActive = activeTab === t.to;
                        return (
                            <Link
                                key={t.to}
                                to={t.to}
                                className={cn(
                                    "inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-semibold transition-colors",
                                    isActive
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t.label}</span>
                            </Link>
                        );
                    })}
                </nav>
                <div className="ml-auto flex items-center gap-2">
                    {auth.user && (
                        <span className="text-xs text-muted-foreground hidden md:block">
                            {auth.user.name}
                        </span>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setShowLogoutDialog(true)}>
                        <LogOut className="h-4 w-4 mr-1" />
                        <span className="hidden sm:inline">Logout</span>
                    </Button>
                </div>
            </header>

            <div className="flex-1 min-h-0 overflow-auto">
                <Outlet />
            </div>

            <ConfirmationDialog
                isOpen={showLogoutDialog}
                onClose={() => setShowLogoutDialog(false)}
                onConfirm={handleLogout}
                title="Confirm Logout"
                description="Are you sure you want to logout?"
                confirmText="Logout"
                cancelText="Cancel"
            />
        </div>
    );
}
