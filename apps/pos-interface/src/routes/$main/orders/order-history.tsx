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
    const linkBuilder: OrderLinkBuilder = (order) => {
        const to =
            order.order_type === "WORK"
                ? "/$main/orders/new-work-order"
                : order.order_type === "ALTERATION"
                    ? "/$main/orders/new-alteration-order"
                    : "/$main/orders/new-sales-order";
        return { to, params: { main }, search: { orderId: order.id } };
    };

    return <OrderHistoryView linkBuilder={linkBuilder} />;
}
