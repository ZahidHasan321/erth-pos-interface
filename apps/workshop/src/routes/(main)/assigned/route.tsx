import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/(main)/assigned")({
  component: () => <Outlet />,
});
