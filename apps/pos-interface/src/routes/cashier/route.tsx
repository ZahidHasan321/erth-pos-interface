import { useState, useEffect } from "react";
import { createFileRoute, redirect, useNavigate, Outlet } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { Button } from "@repo/ui/button";
import { useAuth } from "@/context/auth";
import { getBrand } from "@/api/orders";
import { router } from "@/router";
import { ConfirmationDialog } from "@repo/ui/confirmation-dialog";
import ErthLogo from "@/assets/erth-light.svg";
import SakhtbaLogo from "@/assets/Sakkba.png";

export const Route = createFileRoute("/cashier")({
    component: CashierLayout,
    beforeLoad: ({ context, location }) => {
        if (!context.auth.isAuthenticated) {
            throw redirect({
                to: "/login",
                search: { redirect: location.href },
            });
        }
        const user = (context.auth as any).user;
        if (user && user.role === "staff" && user.job_function) {
            throw redirect({
                to: "/login",
                search: { redirect: undefined, error: "terminal_user_on_pos" } as any,
            });
        }
    },
    head: () => ({
        meta: [{ title: "Cashier Terminal" }],
    }),
});

function CashierLayout() {
    const [showLogoutDialog, setShowLogoutDialog] = useState(false);
    const auth = useAuth();
    const navigate = useNavigate();

    const brandKey = getBrand().toLowerCase();
    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove("erth", "sakkba");
        root.classList.add(brandKey);
        return () => { root.classList.remove(brandKey); };
    }, [brandKey]);

    const brandLogo = brandKey === "erth" ? ErthLogo : SakhtbaLogo;

    const handleLogout = () => {
        auth.logout().then(() => {
            router.invalidate().finally(() => {
                navigate({ to: "/" });
            });
        });
        setShowLogoutDialog(false);
    };

    return (
        <div className="h-screen flex flex-col bg-background">
            <header className="flex items-center gap-3 px-4 py-2 border-b bg-card shrink-0">
                <div className="flex items-center gap-2">
                    <img src={brandLogo} alt="Logo" className="h-7 w-7 object-contain" />
                    <span className="text-sm font-bold hidden sm:block">Cashier</span>
                </div>
                <div className="ml-auto">
                    <Button variant="ghost" size="sm" onClick={() => setShowLogoutDialog(true)}>
                        <LogOut className="h-4 w-4 mr-1" />
                        <span className="hidden sm:inline">Logout</span>
                    </Button>
                </div>
            </header>

            <div className="flex-1 min-h-0">
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
