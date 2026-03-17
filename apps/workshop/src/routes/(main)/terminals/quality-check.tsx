import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTerminalGarments, useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { GroupedGarmentList } from "@/components/shared/GroupedGarmentList";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck } from "lucide-react";
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
      <div className="mb-6 animate-fade-in">
        <h1 className="text-2xl tracking-tight flex items-center gap-2.5">
          <ShieldCheck className="w-6 h-6 text-indigo-500" />
          <span className="font-normal">Production</span> <span className="font-bold text-primary">Quality Check</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {garments.length} garment{garments.length !== 1 ? "s" : ""} awaiting QC
        </p>
      </div>

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

      {isLoading ? (
        <div className="space-y-3 stagger-children">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl skeleton-shimmer" />)}</div>
      ) : (
        <GroupedGarmentList
          garments={garments}
          onCardClick={handleCardClick}
          emptyIcon={<ShieldCheck className="w-10 h-10" />}
          emptyText="Nothing in QC"
        />
      )}
    </div>
  );
}
