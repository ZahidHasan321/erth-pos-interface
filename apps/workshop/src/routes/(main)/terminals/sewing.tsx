import { createFileRoute } from "@tanstack/react-router";
import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";
import { IconNeedle } from "@tabler/icons-react";

export const Route = createFileRoute("/(main)/terminals/sewing")({
  component: () => <ProductionTerminal terminalStage="sewing" icon={IconNeedle} />,
  head: () => ({ meta: [{ title: "Sewing Terminal" }] }),
});
