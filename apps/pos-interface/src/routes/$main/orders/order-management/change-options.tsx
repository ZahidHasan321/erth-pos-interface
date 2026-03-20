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
    <div className="p-4 md:p-5 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-foreground tracking-tight mb-3">Change Options</h1>
      <p className="text-muted-foreground">
        This page is for changing order options.
      </p>
    </div>
  );
}
