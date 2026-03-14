import { createFileRoute } from "@tanstack/react-router";
import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";
import { Scissors } from "lucide-react";

export const Route = createFileRoute("/(main)/terminals/cutting")({
  component: () => <ProductionTerminal terminalStage="cutting" icon={<Scissors className="w-6 h-6 text-amber-500" />} />,
  head: () => ({ meta: [{ title: "Cutting Terminal" }] }),
});
