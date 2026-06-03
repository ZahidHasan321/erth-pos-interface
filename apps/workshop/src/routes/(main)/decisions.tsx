import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { PageHeader, EmptyState, LoadingSkeleton, StatusBanner } from "@/components/shared/PageShell";
import { useAuth } from "@/context/auth";
import { isAdmin, isManager } from "@/lib/rbac";
import { getNeedsInvestigation } from "@/api/investigations";
import { useRedoReplacementsPending, useParkedRedos } from "@/hooks/useWorkshopGarments";
import { InvestigationsSection } from "@/components/decisions/InvestigationsSection";
import { RedoPendingSection } from "@/components/decisions/RedoPendingSection";
import { ParkedRedosSection } from "@/components/decisions/ParkedRedosSection";

export const Route = createFileRoute("/(main)/decisions")({
  component: DecisionsPage,
  head: () => ({ meta: [{ title: "Decisions" }] }),
});

/**
 * Decisions hub — every garment waiting on a manager decision, in one place
 * instead of scattered across the dashboard, scheduler, and order pages:
 * repeated-returns investigations (§2.10), redo replacements to create (§2.5),
 * and parked redos to resume (§6). Add a future decision type by fetching it
 * here and rendering one more section.
 */
function DecisionsPage() {
  const { user } = useAuth();
  const canResolve = isManager(user) || isAdmin(user);

  const { data: investigations = [], isLoading: invLoading } = useQuery({
    queryKey: ["needs-investigation"],
    queryFn: getNeedsInvestigation,
    staleTime: 30_000,
  });
  const { data: redoPending = [], isLoading: redoLoading } = useRedoReplacementsPending();
  const { data: parkedRedos = [], isLoading: parkedLoading } = useParkedRedos();

  const isLoading = invLoading || redoLoading || parkedLoading;
  const total = investigations.length + redoPending.length + parkedRedos.length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        icon={ListChecks}
        title="Decisions"
        subtitle="Garments waiting on a manager decision — investigations, redos, and parked work, together."
      />

      {!canResolve && (
        <StatusBanner tone="info">
          These garments are held pending a decision. Only a manager can record investigations, create redo replacements, or resume parked work.
        </StatusBanner>
      )}

      {isLoading ? (
        <LoadingSkeleton count={3} />
      ) : total === 0 ? (
        <EmptyState icon={ListChecks} message="No garments need a decision right now" />
      ) : (
        <div className="space-y-6">
          {investigations.length > 0 && <InvestigationsSection garments={investigations} />}
          {redoPending.length > 0 && <RedoPendingSection rows={redoPending} />}
          {parkedRedos.length > 0 && <ParkedRedosSection garments={parkedRedos} />}
        </div>
      )}
    </div>
  );
}
