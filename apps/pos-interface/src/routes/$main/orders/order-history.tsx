import { createFileRoute } from "@tanstack/react-router";
import { OrderHistoryView, type OrderLinkBuilder } from "@/components/order-history/order-history-view";

export const Route = createFileRoute("/$main/orders/order-history")({
    component: OrderHistoryPage,
    head: () => ({
        meta: [{ title: "Order History" }],
    }),
});

function OrderHistoryPage() {
    const { main } = Route.useParams();

    // $main shell sends users into the full order editor (the new-X-order
    // routes double as edit views when an orderId search param is supplied).
    // A closed WORK order is not editable, so it goes to the dedicated
    // read-only view instead (the editor also redirects there as a safety net).
    const linkBuilder: OrderLinkBuilder = (order) => {
        const isClosed =
            order.checkout_status === "confirmed" || order.checkout_status === "cancelled";
        const to =
            order.order_type === "WORK"
                ? isClosed
                    ? "/$main/orders/view-work-order"
                    : "/$main/orders/new-work-order"
                : order.order_type === "ALTERATION"
                    ? "/$main/orders/new-alteration-order"
                    : "/$main/orders/new-sales-order";
        return { to, params: { main }, search: { orderId: order.id } };
    };

    return <OrderHistoryView linkBuilder={linkBuilder} />;
}
