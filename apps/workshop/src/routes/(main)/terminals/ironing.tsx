import { createFileRoute } from "@tanstack/react-router";
import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";
import { IconIroning1 } from "@tabler/icons-react";

export const Route = createFileRoute("/(main)/terminals/ironing")({
  component: () => <ProductionTerminal terminalStage="ironing" icon={IconIroning1} />,
  head: () => ({ meta: [{ title: "Ironing Terminal" }] }),
});
