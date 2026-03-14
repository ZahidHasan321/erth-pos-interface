import { createFileRoute } from "@tanstack/react-router";
import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";
import { Wind } from "lucide-react";

export const Route = createFileRoute("/(main)/terminals/ironing")({
  component: () => <ProductionTerminal terminalStage="ironing" icon={<Wind className="w-6 h-6 text-pink-500" />} />,
  head: () => ({ meta: [{ title: "Ironing Terminal" }] }),
});
