import { createFileRoute } from "@tanstack/react-router";
import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";
import { Droplets } from "lucide-react";

export const Route = createFileRoute("/(main)/terminals/soaking")({
  component: () => <ProductionTerminal terminalStage="soaking" icon={Droplets} />,
  head: () => ({ meta: [{ title: "Soaking Terminal" }] }),
});
