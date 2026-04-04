import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTerminalGarments, useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { GroupedGarmentList } from "@/components/shared/GroupedGarmentList";
import { PageHeader, LoadingSkeleton } from "@/components/shared/PageShell";
import { Skeleton } from "@repo/ui/skeleton";
import { IconRosette } from "@tabler/icons-react";
import type { WorkshopGarment } from "@repo/database";
import { getLocalDateStr, parseUtcTimestamp } from "@/lib/utils";

export const Route = createFileRoute("/(main)/terminals/quality-check")({
  component: QualityCheckTerminal,
  head: () => ({ meta: [{ title: "Quality Check" }] }),
});

function QualityCheckTerminal() {
  const { data: garments = [], isLoading } = useTerminalGarments("quality_check");
  const { data: allGarments = [] } = useWorkshopGarments();
  const navigate = useNavigate();

  const todayStr = useMemo(() => getLocalDateStr(), []);

  const passedToday = useMemo(() => {
    return allGarments.filter((g) => {
      if (g.piece_stage !== "ready_for_dispatch") return false;
      if (!g.completion_time) return false;
      if (getLocalDateStr(typeof g.completion_time === 'string' ? parseUtcTimestamp(g.completion_time) : g.completion_time) !== todayStr) return false;
      const wh = g.worker_history as Record<string, string> | null;
      return wh?.quality_checker != null;
    });
  }, [allGarments, todayStr]);

  const handleCardClick = (g: WorkshopGarment) => {
    navigate({ to: "/terminals/garment/$garmentId", params: { garmentId: g.id } });
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader
        icon={IconRosette}
        title="Quality Check"
        subtitle={`${garments.length} garment${garments.length !== 1 ? "s" : ""} awaiting QC`}
      />

      {isLoading ? (
        <>
          <div className="grid grid-cols-3 gap-2.5 mb-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px] rounded-xl" />)}
          </div>
          <LoadingSkeleton />
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5 mb-6 stagger-children">
            <div className="bg-blue-50/80 border border-blue-200/60 rounded-xl p-3 text-center shadow-sm">
              <p className="text-2xl font-black text-blue-700 tabular-nums">{garments.length}</p>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-600/70">In QC</p>
            </div>
            <div className="bg-green-50/80 border border-green-200/60 rounded-xl p-3 text-center shadow-sm">
              <p className="text-2xl font-black text-green-700 tabular-nums">{passedToday.length}</p>
              <p className="text-xs font-bold uppercase tracking-wider text-green-600/70">Passed Today</p>
            </div>
            <div className="bg-red-50/80 border border-red-200/60 rounded-xl p-3 text-center shadow-sm">
              <p className="text-2xl font-black text-red-700 tabular-nums">0</p>
              <p className="text-xs font-bold uppercase tracking-wider text-red-600/70">Failed Today</p>
            </div>
          </div>

          <GroupedGarmentList
            garments={garments}
            onCardClick={handleCardClick}
            emptyIcon={<IconRosette className="w-10 h-10" />}
            emptyText="Nothing in QC"
          />
        </>
      )}
    </div>
  );
}
