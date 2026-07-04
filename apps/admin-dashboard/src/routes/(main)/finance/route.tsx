import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/PageShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/(main)/finance")({
  component: FinanceLayout,
});

const TABS = [
  { to: "/finance", label: "Overview", exact: true },
  { to: "/finance/transactions", label: "Transactions", exact: false },
  { to: "/finance/registers", label: "Registers (EOD)", exact: false },
  { to: "/finance/purchases", label: "Purchases", exact: false },
] as const;

function FinanceLayout() {
  const { pathname } = useLocation();

  const isActive = (to: string, exact: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  return (
    <div>
      <PageHeader icon={Wallet} title="Finance" subtitle="Every payment, drawer, and payable across all brands" />

      <div className="border-b border-border mb-5">
        <nav className="flex gap-1 -mb-px">
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "px-3.5 py-2 text-sm font-medium border-b-2 transition-colors",
                isActive(t.to, t.exact)
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      <Outlet />
    </div>
  );
}
