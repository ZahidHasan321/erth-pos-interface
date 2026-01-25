import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$main/store/receiving-deliveries")({
  component: RouteComponent,
  head: () => ({
    meta: [{
      title: "Receiving Deliveries",
    }]
  }),
});

function RouteComponent() {
  return <div>Coming soon</div>;
}
