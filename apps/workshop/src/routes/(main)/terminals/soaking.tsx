import { createFileRoute } from "@tanstack/react-router";
import { SoakingTerminal } from "@/components/terminals/SoakingTerminal";

export const Route = createFileRoute("/(main)/terminals/soaking")({
  component: () => <SoakingTerminal />,
  head: () => ({ meta: [{ title: "Soaking Terminal" }] }),
});
