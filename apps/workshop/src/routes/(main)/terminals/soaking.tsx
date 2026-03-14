import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTerminalGarments, useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useCompleteAndAdvance, useStartGarment } from "@/hooks/useGarmentMutations";
import { GarmentCard } from "@/components/shared/GarmentCard";
import { Pagination, usePagination } from "@/components/shared/Pagination";
import { WorkerDropdown } from "@/components/shared/WorkerDropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Droplets, Clock, AlertCircle, CheckCircle2, Play, ArrowRight } from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

export const Route = createFileRoute("/(main)/terminals/soaking")({
  component: SoakingTerminal,
  head: () => ({ meta: [{ title: "Soaking Terminal" }] }),
});

function isSameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function ElapsedTimer({ startTime }: { startTime: string | null | undefined }) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    if (!startTime) { setElapsed(""); return; }
    const update = () => {
      const diff = Date.now() - new Date(startTime).getTime();
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setElapsed(`${h}h ${m}m ${s}s`);
    };
    update();
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [startTime]);
  if (!startTime) return null;
  return (
    <span className="text-xs font-mono bg-sky-200 text-sky-900 px-2 py-0.5 rounded font-semibold">
      {elapsed}
    </span>
  );
}

function SoakingTerminal() {
  const { data: garments = [], isLoading } = useTerminalGarments("soaking");
  const { data: allGarments = [] } = useWorkshopGarments();
  const completeMut = useCompleteAndAdvance();
  const startMut = useStartGarment();
  const [completeDialog, setCompleteDialog] = useState<WorkshopGarment | null>(null);
  const [worker, setWorker] = useState("");

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = today.toISOString().slice(0, 10);

  // Split into queue/pending
  const { queue, pending } = useMemo(() => {
    const q: WorkshopGarment[] = [];
    const p: WorkshopGarment[] = [];
    for (const g of garments) {
      if (g.start_time) {
        q.push(g); // started = active
      } else if (g.assigned_date && g.assigned_date < todayStr) {
        p.push(g);
      } else {
        q.push(g);
      }
    }
    return { queue: q, pending: p };
  }, [garments, todayStr]);

  // Completed today
  const completedToday = useMemo(() => {
    return allGarments.filter((g) => {
      if (g.location !== "workshop") return false;
      if (g.piece_stage !== "cutting") return false;
      if (!g.completion_time) return false;
      const ct = new Date(g.completion_time);
      if (!isSameDay(ct, today)) return false;
      const wh = g.worker_history as Record<string, string> | null;
      return wh?.soaker != null;
    });
  }, [allGarments, today]);

  const completedPagination = usePagination(completedToday, 15);

  const handleComplete = async () => {
    if (!completeDialog || !worker) return;
    await completeMut.mutateAsync({ id: completeDialog.id, worker, stage: "soaking", nextStage: "cutting" });
    toast.success(`${completeDialog.garment_id} → Cutting`);
    setCompleteDialog(null);
    setWorker("");
  };

  const renderList = (list: WorkshopGarment[], showActions: boolean) => {
    if (list.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-2xl">
          <Droplets className="w-10 h-10 text-zinc-300 mb-3" />
          <p className="font-semibold text-muted-foreground">No garments</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {list.map((g, i) => (
          <GarmentCard key={g.id} garment={g} showPipeline compact index={i}
            actions={showActions ? (
              <div className="flex items-center gap-2">
                <ElapsedTimer startTime={g.start_time?.toString()} />
                {!g.start_time && (
                  <Button size="sm" variant="outline" className="h-9 px-4 text-sm font-bold" onClick={() => startMut.mutate(g.id)} disabled={startMut.isPending}><Play className="w-3.5 h-3.5 mr-1" />Start</Button>
                )}
                <Button size="sm" className="h-9 px-4 text-sm font-bold bg-emerald-600 hover:bg-emerald-700" onClick={() => { setCompleteDialog(g); setWorker(""); }}>Done<ArrowRight className="w-3.5 h-3.5 ml-1" /></Button>
              </div>
            ) : undefined}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
          <Droplets className="w-6 h-6 text-blue-500" /> Soaking
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{garments.length} garment{garments.length !== 1 ? "s" : ""} soaking</p>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-5">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-blue-700">{queue.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 opacity-70">Queue</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-emerald-700">{queue.filter(g => g.start_time).length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 opacity-70">Started</p>
        </div>
        <div className={`${pending.length > 0 ? "bg-red-50 border-red-200" : "bg-zinc-50 border-zinc-200"} border rounded-xl p-2.5 text-center`}>
          <p className={`text-xl font-black ${pending.length > 0 ? "text-red-700" : "text-zinc-700"}`}>{pending.length}</p>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${pending.length > 0 ? "text-red-600 opacity-70" : "text-zinc-600 opacity-70"}`}>Overdue</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-green-700">{completedToday.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-green-600 opacity-70">Done Today</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : (
        <Tabs defaultValue="queue">
          <TabsList className="mb-4">
            <TabsTrigger value="queue" className="gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Queue
              <Badge variant="secondary" className="ml-0.5 text-xs">{queue.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Overdue
              <Badge variant="secondary" className={`ml-0.5 text-xs ${pending.length > 0 ? "bg-red-100 text-red-700" : ""}`}>
                {pending.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Completed
              <Badge variant="secondary" className="ml-0.5 text-xs bg-green-100 text-green-700">{completedToday.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue">{renderList(queue, true)}</TabsContent>
          <TabsContent value="pending">{renderList(pending, true)}</TabsContent>
          <TabsContent value="completed">
            {renderList(completedPagination.paged, false)}
            <Pagination
              page={completedPagination.page}
              totalPages={completedPagination.totalPages}
              onPageChange={completedPagination.setPage}
              totalItems={completedPagination.totalItems}
              pageSize={completedPagination.pageSize}
            />
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!completeDialog} onOpenChange={(v) => !v && setCompleteDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Complete Soaking</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-muted/40 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Garment</p>
              <p className="font-bold text-lg">{completeDialog?.garment_id}</p>
              {completeDialog?.customer_name && <p className="text-sm text-muted-foreground">{completeDialog.customer_name}</p>}
            </div>
            <WorkerDropdown responsibility="soaking" value={worker} onChange={setWorker} placeholder="Who soaked this?" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialog(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleComplete} disabled={!worker || completeMut.isPending}>Advance → Cutting</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
