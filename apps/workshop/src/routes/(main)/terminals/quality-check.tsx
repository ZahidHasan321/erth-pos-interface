import { createFileRoute } from "@tanstack/react-router";
import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";
import { IconRosette } from "@tabler/icons-react";

export const Route = createFileRoute("/(main)/terminals/quality-check")({
  component: () => <ProductionTerminal terminalStage="quality_check" icon={IconRosette} />,
  head: () => ({ meta: [{ title: "Quality Check" }] }),
});
