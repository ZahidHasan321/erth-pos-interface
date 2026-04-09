import { createFileRoute } from "@tanstack/react-router";
import ActiveRequestsPage from "@/components/store/active-requests-page";

export const Route = createFileRoute("/$main/store/active-requests")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Active Requests" }],
  }),
});

function RouteComponent() {
  return <ActiveRequestsPage />;
}
