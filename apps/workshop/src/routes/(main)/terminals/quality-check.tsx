import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTerminalGarments, useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { GroupedGarmentList } from "@/components/shared/GroupedGarmentList";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle } from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

export const Route = createFileRoute("/(main)/terminals/quality-check")({
  component: QualityCheckTerminal,
  head: () => ({ meta: [{ title: "Quality Check" }] }),
});

function isSameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function QualityCheckTerminal() {
  const { data: garments = [], isLoading } = useTerminalGarments("quality_check");
  const { data: allGarments = [] } = useWorkshopGarments();
  const navigate = useNavigate();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const passedToday = useMemo(() => {
    return allGarments.filter((g) => {
      if (g.piece_stage !== "ready_for_dispatch") return false;
      if (!g.completion_time) return false;
      const ct = new Date(g.completion_time);
      if (!isSameDay(ct, today)) return false;
      const wh = g.worker_history as Record<string, string> | null;
      return wh?.quality_checker != null;
    });
  }, [allGarments, today]);

  const handleCardClick = (g: WorkshopGarment) => {
    navigate({ to: "/terminals/garment/$garmentId", params: { garmentId: g.id } });
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
          <CheckCircle className="w-6 h-6 text-yellow-500" /> Quality Check
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {garments.length} garment{garments.length !== 1 ? "s" : ""} awaiting QC
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-blue-700">{garments.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 opacity-70">In QC</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-green-700">{passedToday.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-green-600 opacity-70">Passed Today</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-red-700">0</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 opacity-70">Failed Today</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : (
        <GroupedGarmentList
          garments={garments}
          onCardClick={handleCardClick}
          emptyIcon={<CheckCircle className="w-10 h-10" />}
          emptyText="Nothing in QC"
        />
      )}
    </div>
  );
}
