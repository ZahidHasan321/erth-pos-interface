import { createFileRoute } from "@tanstack/react-router";
import ApproveRequestsPage from "@/components/store/approve-requests-page";

export const Route = createFileRoute("/$main/store/approve-requests")({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || undefined,
  }),
  head: () => ({
    meta: [{
      title: "Approve Requests",
    }]
  }),
});

function RouteComponent() {
  const { tab } = Route.useSearch();
  return <ApproveRequestsPage initialTab={tab} />;
}
