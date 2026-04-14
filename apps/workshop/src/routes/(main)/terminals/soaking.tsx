import { createFileRoute } from "@tanstack/react-router";
import { Droplets } from "lucide-react";
import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";

export const Route = createFileRoute("/(main)/terminals/soaking")({
  component: () => <ProductionTerminal terminalStage="soaking" icon={Droplets} variant="simple" />,
  head: () => ({ meta: [{ title: "Soaking Terminal" }] }),
});
