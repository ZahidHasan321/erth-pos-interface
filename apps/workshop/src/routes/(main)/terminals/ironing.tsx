import { createFileRoute } from "@tanstack/react-router";
import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";
import { Flame } from "lucide-react";

export const Route = createFileRoute("/(main)/terminals/ironing")({
  component: () => <ProductionTerminal terminalStage="ironing" icon={<Flame className="w-6 h-6 text-red-500" />} />,
  head: () => ({ meta: [{ title: "Ironing Terminal" }] }),
});
