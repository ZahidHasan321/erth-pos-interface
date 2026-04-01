import { createFileRoute } from "@tanstack/react-router";
import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";
import { IconSparkles } from "@tabler/icons-react";

export const Route = createFileRoute("/(main)/terminals/finishing")({
  component: () => <ProductionTerminal terminalStage="finishing" icon={IconSparkles} />,
  head: () => ({ meta: [{ title: "Finishing Terminal" }] }),
});
