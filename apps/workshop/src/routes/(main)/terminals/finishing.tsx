import { createFileRoute } from "@tanstack/react-router";
import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/(main)/terminals/finishing")({
  component: () => <ProductionTerminal terminalStage="finishing" icon={<Sparkles className="w-6 h-6 text-purple-500" />} />,
  head: () => ({ meta: [{ title: "Finishing Terminal" }] }),
});
