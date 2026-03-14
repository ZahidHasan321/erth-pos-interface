import { createFileRoute } from "@tanstack/react-router";
import { ProductionTerminal } from "@/components/terminals/ProductionTerminal";
import { Layers } from "lucide-react";

export const Route = createFileRoute("/(main)/terminals/post-cutting")({
  component: () => <ProductionTerminal terminalStage="post_cutting" icon={<Layers className="w-6 h-6 text-amber-600" />} />,
  head: () => ({ meta: [{ title: "Post-Cutting Terminal" }] }),
});
