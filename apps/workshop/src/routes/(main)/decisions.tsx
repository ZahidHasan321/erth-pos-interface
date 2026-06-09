import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { PageHeader, EmptyState, LoadingSkeleton, StatusBanner } from "@/components/shared/PageShell";
import { useAuth } from "@/context/auth";
import { isAdmin, isManager } from "@/lib/rbac";
import { getNeedsInvestigation } from "@/api/investigations";
import { InvestigationsSection } from "@/components/decisions/InvestigationsSection";

export const Route = createFileRoute("/(main)/decisions")({
  component: DecisionsPage,
  head: () => ({ meta: [{ title: "Decisions" }] }),
});

/**
 * Decisions hub — every garment waiting on a manager decision, in one place
 * instead of scattered across the dashboard and order pages: repeated-returns
 * investigations (§2.10). Add a future decision type by fetching it here and
 * rendering one more section.
 */
function DecisionsPage() {
  const { user } = useAuth();
  const canResolve = isManager(user) || isAdmin(user);

  const { data: investigations = [], isLoading } = useQuery({
    queryKey: ["needs-investigation"],
    queryFn: getNeedsInvestigation,
    staleTime: 30_000,
  });

  const total = investigations.length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        icon={ListChecks}
        title="Decisions"
        subtitle="Garments waiting on a manager decision, investigations."
      />

      {!canResolve && (
        <StatusBanner tone="info">
          These garments are held pending a decision. Only a manager can record investigations.
        </StatusBanner>
      )}

      {isLoading ? (
        <LoadingSkeleton count={3} />
      ) : total === 0 ? (
        <EmptyState icon={ListChecks} message="No garments need a decision right now" />
      ) : (
        <div className="space-y-6">
          {investigations.length > 0 && <InvestigationsSection garments={investigations} />}
        </div>
      )}
    </div>
  );
}
