import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CashierListBody } from "@/components/cashier/cashier-terminal";

// §3 "All Orders" — the full filtered order list (all types) for follow-up
// payment, handover, and refund. The initial-processing Pending queue is the
// main cashier page. Brand gating lives on the parent layout route (route.tsx).
export const Route = createFileRoute("/$main/cashier/orders")({
    component: CashierAllOrdersPage,
    head: () => ({
        meta: [{ title: "Cashier: All Orders" }],
    }),
});

function CashierAllOrdersPage() {
    const navigate = useNavigate();
    const { main } = Route.useParams();
    return (
        <CashierListBody
            onSelectOrder={(id) =>
                navigate({ to: "/$main/cashier/$orderId", params: { main, orderId: id } })
            }
        />
    );
}
