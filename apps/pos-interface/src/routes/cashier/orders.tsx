import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CashierListBody } from "@/components/cashier/cashier-terminal";

// §3 "All Orders" tab — the full filtered order list (all types) for follow-up
// payment, handover, and refund. The initial-processing Pending queue is the
// main /cashier page.
export const Route = createFileRoute("/cashier/orders")({
    component: CashierAllOrdersPage,
});

function CashierAllOrdersPage() {
    const navigate = useNavigate();
    return (
        <CashierListBody
            onSelectOrder={(id) => navigate({ to: "/cashier/$orderId", params: { orderId: id } })}
        />
    );
}
