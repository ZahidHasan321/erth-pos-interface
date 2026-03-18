import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$main/orders/order-management/cancel-order")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "Cancel Order",
      },
    ],
  }),
});

function RouteComponent() {
  return (
    <div className="p-4">
      <h1 className="text-lg font-bold mb-3">Cancel Order</h1>
      <p className="text-muted-foreground">
        This page is for canceling orders.
      </p>
    </div>
  );
}
