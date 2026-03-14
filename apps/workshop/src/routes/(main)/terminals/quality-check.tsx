import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTerminalGarments } from "@/hooks/useWorkshopGarments";
import { useQcPass, useQcFail } from "@/hooks/useGarmentMutations";
import { GarmentCard } from "@/components/shared/GarmentCard";
import { WorkerDropdown } from "@/components/shared/WorkerDropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle } from "lucide-react";
import type { WorkshopGarment, PieceStage } from "@repo/database";

export const Route = createFileRoute("/(main)/terminals/quality-check")({
  component: QualityCheckTerminal,
  head: () => ({ meta: [{ title: "Quality Check" }] }),
});

const QC_CATEGORIES = ["stitching", "measurement", "fabric", "finishing", "appearance"];

const FAIL_RETURN_STAGES: { value: PieceStage; label: string }[] = [
  { value: "cutting",      label: "Back to Cutting" },
  { value: "post_cutting", label: "Back to Post-Cutting" },
  { value: "sewing",       label: "Back to Sewing" },
  { value: "finishing",    label: "Back to Finishing" },
  { value: "ironing",      label: "Back to Ironing" },
];

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className={`text-xl transition-all ${n <= value ? "text-amber-500" : "text-zinc-300"}`}>★</button>
      ))}
    </div>
  );
}

function QualityCheckTerminal() {
  const { data: garments = [], isLoading } = useTerminalGarments("quality_check");
  const passMut = useQcPass();
  const failMut = useQcFail();

  const [activeGarment, setActiveGarment] = useState<WorkshopGarment | null>(null);
  const [mode, setMode] = useState<"pass" | "fail">("pass");
  const [worker, setWorker] = useState("");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [returnStage, setReturnStage] = useState<PieceStage>("sewing");
  const [reason, setReason] = useState("");

  const openDialog = (g: WorkshopGarment, m: "pass" | "fail") => {
    setActiveGarment(g); setMode(m); setWorker(""); setRatings({}); setReason("");
  };

  const handlePass = async () => {
    if (!activeGarment || !worker) return;
    await passMut.mutateAsync({ id: activeGarment.id, worker, ratings });
    toast.success(`${activeGarment.garment_id} → Ready for Dispatch`);
    setActiveGarment(null);
  };

  const handleFail = async () => {
    if (!activeGarment || !reason) return;
    await failMut.mutateAsync({ id: activeGarment.id, returnStage, reason });
    toast.warning(`${activeGarment.garment_id} returned to ${returnStage}`);
    setActiveGarment(null);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
          <CheckCircle className="w-6 h-6 text-yellow-500" /> Quality Check
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{garments.length} garment{garments.length !== 1 ? "s" : ""} awaiting QC</p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-blue-700">{garments.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 opacity-70">In QC</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 text-center">
          {/* TODO: track actual pass count today */}
          <p className="text-xl font-black text-green-700">0</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-green-600 opacity-70">Passed Today</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-center">
          {/* TODO: track actual fail count today */}
          <p className="text-xl font-black text-red-700">0</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 opacity-70">Failed Today</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : garments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-2xl">
          <CheckCircle className="w-10 h-10 text-zinc-300 mb-3" />
          <p className="font-semibold text-muted-foreground">Nothing in QC</p>
        </div>
      ) : (
        <div className="space-y-3">
          {garments.map((g, i) => (
            <GarmentCard key={g.id} garment={g} showPipeline compact index={i}
              actions={
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" className="h-9 px-4 text-sm font-bold" onClick={() => openDialog(g, "fail")}>Fail</Button>
                  <Button size="sm" className="h-9 px-4 text-sm font-bold bg-emerald-600 hover:bg-emerald-700" onClick={() => openDialog(g, "pass")}>Pass</Button>
                </div>
              }
            />
          ))}
        </div>
      )}

      <Dialog open={!!activeGarment} onOpenChange={(v) => !v && setActiveGarment(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{mode === "pass" ? "✅ QC Pass" : "❌ QC Fail"}</DialogTitle></DialogHeader>

          {mode === "pass" ? (
            <div className="space-y-4 py-2">
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Garment</p>
                <p className="font-bold text-lg">{activeGarment?.garment_id}</p>
                {activeGarment?.customer_name && <p className="text-sm text-muted-foreground">{activeGarment.customer_name}</p>}
              </div>
              <WorkerDropdown responsibility="quality_check" value={worker} onChange={setWorker} placeholder="QC Inspector" />
              <div className="space-y-3">
                {QC_CATEGORIES.map(cat => (
                  <div key={cat} className="flex items-center justify-between">
                    <Label className="capitalize text-sm">{cat}</Label>
                    <StarRating value={ratings[cat] ?? 0} onChange={(v) => setRatings(p => ({ ...p, [cat]: v }))} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="bg-muted/40 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Garment</p>
                <p className="font-bold text-lg">{activeGarment?.garment_id}</p>
                {activeGarment?.customer_name && <p className="text-sm text-muted-foreground">{activeGarment.customer_name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Return to Stage</Label>
                <Select value={returnStage} onValueChange={(v) => setReturnStage(v as PieceStage)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FAIL_RETURN_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Input placeholder="Describe the issue…" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveGarment(null)}>Cancel</Button>
            {mode === "pass" ? (
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handlePass} disabled={!worker || passMut.isPending}>Pass & Dispatch</Button>
            ) : (
              <Button variant="destructive" onClick={handleFail} disabled={!reason || failMut.isPending}>Send Back</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
