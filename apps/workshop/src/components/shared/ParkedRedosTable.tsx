import { useState } from "react";
import { Loader2, Play, ParkingSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableContainer,
} from "@/components/shared/table";
import { GarmentTypeBadge } from "@/components/shared/PageShell";
import { getRedoParkedReasonLabel } from "@/lib/root-causes";
import { useResumeParkedRedo } from "@/hooks/useGarmentMutations";
import { useAuth } from "@/context/auth";
import type { WorkshopGarment, RedoPriority } from "@repo/database";

/**
 * Parked-redo resume controller (CLAUDE.md §6). Shared by the Scheduler's
 * "Parked redos" section and the Decisions hub so the resume behaviour lives in
 * one place: a fresh idempotency key per click (lost-response retry stays
 * single-effect), the fabric-consume toast, and the still-short error. The RPC
 * re-runs the deferred -L consume; a still-short fabric makes it raise and the
 * row stays parked.
 */
export function useResumeRedo() {
  const { user } = useAuth();
  const resumeMut = useResumeParkedRedo();
  const [resumingId, setResumingId] = useState<string | null>(null);

  const resume = (garmentId: string, priority: RedoPriority = "next_slot") => {
    setResumingId(garmentId);
    resumeMut.mutate(
      { garmentId, priority, userId: user?.id ?? null, idempotencyKey: crypto.randomUUID() },
      {
        onSuccess: (res) => {
          if (res.already_active) toast.info("Redo already active");
          else if (res.consumed > 0) toast.success(`Redo resumed — ${res.consumed} m fabric consumed`);
          else toast.success("Redo resumed");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to resume redo"),
        onSettled: () => setResumingId(null),
      },
    );
  };

  return { resumingId, resume };
}

/**
 * Parked redos can't be scheduled until resumed, so this is a read + Resume
 * table (no selection checkboxes). Pass `onResume` to enable the action; omit it
 * (e.g. for a non-manager viewer) to render the rows read-only.
 */
export function ParkedRedosTable({
  garments,
  resumingId = null,
  onResume,
}: {
  garments: WorkshopGarment[];
  resumingId?: string | null;
  onResume?: (garmentId: string, priority: RedoPriority) => void;
}) {
  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
            <TableHead className="w-[120px]">Garment</TableHead>
            <TableHead className="w-[80px]">Type</TableHead>
            <TableHead className="w-[170px]">Customer</TableHead>
            <TableHead className="w-[100px]">Order / Invoice</TableHead>
            <TableHead>Parked reason</TableHead>
            <TableHead className="w-[120px] text-right pr-3">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {garments.map((g) => {
            const busy = resumingId === g.id;
            return (
              <TableRow key={g.id} className="opacity-90">
                <TableCell className="px-3 py-3">
                  <span className="font-mono text-base">{g.garment_id ?? g.id.slice(0, 8)}</span>
                </TableCell>
                <TableCell className="px-3 py-3">
                  <GarmentTypeBadge type={g.garment_type ?? "final"} />
                </TableCell>
                <TableCell className="px-3 py-3">
                  <span className="text-sm truncate">{g.customer_name ?? "—"}</span>
                </TableCell>
                <TableCell className="px-3 py-3 text-sm tabular-nums text-muted-foreground">
                  #{g.order_id}{g.invoice_number ? ` / ${g.invoice_number}` : ""}
                </TableCell>
                <TableCell className="px-3 py-3">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--status-warn)] bg-[var(--status-warn-bg)] px-2 py-0.5 rounded-md">
                    <ParkingSquare className="w-3 h-3" /> {getRedoParkedReasonLabel(g.redo_parked_reason)}
                  </span>
                </TableCell>
                <TableCell className="px-3 py-3 text-right">
                  {onResume ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onResume(g.id, "next_slot")}
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                      Resume
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">parked</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
