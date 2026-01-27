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
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Cancel Order</h1>
      <p className="text-muted-foreground">
        This page is for canceling orders.
      </p>
    </div>
  );
}
