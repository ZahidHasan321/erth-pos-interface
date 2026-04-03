import { createFileRoute } from "@tanstack/react-router";
import ApproveRequestsPage from "@/components/store/approve-requests-page";

export const Route = createFileRoute("/$main/store/approve-requests")({
  component: RouteComponent,
  head: () => ({
    meta: [{
      title: "Approve Requests",
    }]
  }),
});

function RouteComponent() {
  return <ApproveRequestsPage />;
}
