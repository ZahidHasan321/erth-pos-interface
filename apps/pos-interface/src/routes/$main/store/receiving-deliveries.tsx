import { createFileRoute } from "@tanstack/react-router";
import ReceivingDeliveriesPage from "@/components/store/receiving-deliveries-page";

export const Route = createFileRoute("/$main/store/receiving-deliveries")({
  component: RouteComponent,
  head: () => ({
    meta: [{
      title: "Receiving Deliveries",
    }]
  }),
});

function RouteComponent() {
  return <ReceivingDeliveriesPage />;
}
