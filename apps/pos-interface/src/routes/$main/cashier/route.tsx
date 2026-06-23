import { createFileRoute, redirect, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Inbox, ListOrdered, Receipt } from "lucide-react";
import { brandUsesCashier } from "@/lib/constants";
import { cn } from "@/lib/utils";

// §3 cashier surface inside the shop shell. Mirrors the standalone /cashier
// terminal (Pending queue → bulk payment, plus All Orders for follow-ups) so
// both entry points run the exact same flow and components; only the chrome
// differs (shop sidebar here, dedicated header there). Order History and
// End of Day stay shop-sidebar items, so they are not duplicated as tabs.
export const Route = createFileRoute("/$main/cashier")({
    beforeLoad: ({ params }) => {
        if (!brandUsesCashier(params.main)) {
            throw redirect({ to: "/$main", params: { main: params.main } });
        }
    },
    component: CashierShell,
});

const TABS = [
    { to: "/$main/cashier", label: "Pending", icon: Inbox, section: "pending" as const },
    { to: "/$main/cashier/orders", label: "All Orders", icon: ListOrdered, section: "orders" as const },
    { to: "/$main/cashier/purchases", label: "Purchases", icon: Receipt, section: "purchases" as const },
] as const;

function CashierShell() {
    const { main } = Route.useParams();
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    // Resolve the active section from the path. Order detail (/cashier/<id>) is
    // reached from All Orders, so it counts as the orders section; Purchases owns
    // its own path; Pending owns everything else (incl. /process).
    const activeSection: "pending" | "orders" | "purchases" =
        pathname.includes("/cashier/purchases")
            ? "purchases"
            : pathname.includes("/cashier/orders") || /\/cashier\/\d+/.test(pathname)
                ? "orders"
                : "pending";

    return (
        <div className="h-full flex flex-col">
            <nav className="flex items-center gap-1 px-4 py-2 border-b bg-card shrink-0">
                {TABS.map((t) => {
                    const Icon = t.icon;
                    const isActive = activeSection === t.section;
                    return (
                        <Link
                            key={t.to}
                            to={t.to}
                            params={{ main }}
                            className={cn(
                                "inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-semibold transition-colors",
                                isActive
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                            )}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {t.label}
                        </Link>
                    );
                })}
            </nav>
            <div className="flex-1 min-h-0 overflow-auto">
                <Outlet />
            </div>
        </div>
    );
}
