import { createFileRoute, Navigate } from "@tanstack/react-router";
// TEMP DISABLED: post_cutting hidden from production flow.
// Route kept so deep-links don't 404; redirects to dashboard.
// To re-enable, restore the original component below:
// import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";
// import { IconStack2 } from "@tabler/icons-react";
// component: () => <ProductionTerminal terminalStage="post_cutting" icon={IconStack2} />,

export const Route = createFileRoute("/(main)/terminals/post-cutting")({
  component: () => <Navigate to="/dashboard" />,
  head: () => ({ meta: [{ title: "Post-Cutting Terminal (disabled)" }] }),
});
