import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$main/orders/order-management/alterations")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "Alterations",
      },
    ],
  }),
});

function RouteComponent() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Alterations</h1>
      <p className="text-muted-foreground">
        This page is for managing alterations and alteration feedback.
      </p>
    </div>
  );
}
