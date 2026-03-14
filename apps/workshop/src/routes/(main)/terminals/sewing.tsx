import { createFileRoute } from "@tanstack/react-router";
import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";
import { Shirt } from "lucide-react";

export const Route = createFileRoute("/(main)/terminals/sewing")({
  component: () => <ProductionTerminal terminalStage="sewing" icon={<Shirt className="w-6 h-6 text-orange-500" />} />,
  head: () => ({ meta: [{ title: "Sewing Terminal" }] }),
});
