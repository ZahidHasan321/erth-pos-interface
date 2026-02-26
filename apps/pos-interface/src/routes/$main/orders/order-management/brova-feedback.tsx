import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$main/orders/order-management/brova-feedback")({
  beforeLoad: () => {
    throw redirect({
      to: "/$main/orders/order-management/feedback",
    });
  },
});
