import { createFileRoute } from "@tanstack/react-router";
import { StockPurchasesBody } from "@/components/cashier/stock-purchases";

// §3 cashier: settle stock-purchase payables (costed fabric/shelf restocks).
// Same component the standalone terminal would use; only the shop-shell chrome
// differs.
function CashierPurchasesPage() {
    return <StockPurchasesBody />;
}

export const Route = createFileRoute("/$main/cashier/purchases")({
    component: CashierPurchasesPage,
});
