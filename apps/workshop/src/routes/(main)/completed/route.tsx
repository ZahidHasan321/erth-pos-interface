import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/(main)/completed")({
  component: () => <Outlet />,
});
