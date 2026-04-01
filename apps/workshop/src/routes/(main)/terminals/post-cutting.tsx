import { createFileRoute } from "@tanstack/react-router";
import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";
import { IconStack2 } from "@tabler/icons-react";

export const Route = createFileRoute("/(main)/terminals/post-cutting")({
  component: () => <ProductionTerminal terminalStage="post_cutting" icon={IconStack2} />,
  head: () => ({ meta: [{ title: "Post-Cutting Terminal" }] }),
});
