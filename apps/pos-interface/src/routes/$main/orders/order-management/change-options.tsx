import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$main/orders/order-management/change-options")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "Change Options",
      },
    ],
  }),
});

function RouteComponent() {
  return (
    <div className="p-4">
      <h1 className="text-lg font-bold mb-3">Change Options</h1>
      <p className="text-muted-foreground">
        This page is for changing order options.
      </p>
    </div>
  );
}
