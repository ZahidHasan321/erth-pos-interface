import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$main/store/inventory")({
  component: () => <Outlet />,
});
