import { createFileRoute } from "@tanstack/react-router";
import { OrderHistoryView, type OrderLinkBuilder } from "@/components/order-history/order-history-view";

export const Route = createFileRoute("/cashier/history")({
    component: CashierHistoryPage,
    head: () => ({
        meta: [{ title: "Order History" }],
    }),
});

// Inside the cashier shell every row click is for *payment*. We funnel the
// click into the cashier order detail page (`/cashier/$orderId`) instead of
// the order editor — cashier-role users have no access to that anyway.
const linkBuilder: OrderLinkBuilder = (order) => ({
    to: "/cashier/$orderId",
    params: { orderId: String(order.id) },
});

function CashierHistoryPage() {
    return <OrderHistoryView linkBuilder={linkBuilder} />;
}
