import DispatchOrderPage from "@/components/order-management/dispatch-order";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$main/orders/order-management/dispatch")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "Dispatch Orders",
      },
    ],
  }),
});

function RouteComponent() {
  return <DispatchOrderPage />;
}
