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
    <div className="p-4 md:p-5 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-foreground tracking-tight mb-3">Cancel Order</h1>
      <p className="text-muted-foreground">
        This page is for canceling orders.
      </p>
    </div>
  );
}
