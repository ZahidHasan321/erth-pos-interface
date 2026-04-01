import { createFileRoute } from "@tanstack/react-router";
import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";
import { Scissors } from "lucide-react";

export const Route = createFileRoute("/(main)/terminals/cutting")({
  component: () => <ProductionTerminal terminalStage="cutting" icon={Scissors} />,
  head: () => ({ meta: [{ title: "Cutting Terminal" }] }),
});
