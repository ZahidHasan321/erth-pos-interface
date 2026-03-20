import { createFileRoute } from "@tanstack/react-router";
import { CashierBody } from "@/components/cashier/cashier-terminal";

export const Route = createFileRoute("/$main/cashier")({
    component: CashierPage,
    head: () => ({
        meta: [{ title: "Cashier" }],
    }),
});

function CashierPage() {
    return <CashierBody />;
}
