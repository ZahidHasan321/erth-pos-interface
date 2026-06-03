import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Replace, ParkingSquare } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Label } from "@repo/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@repo/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@repo/ui/select";
import { StatusBanner } from "@/components/shared/PageShell";
import { useAuth } from "@/context/auth";
import { useCreateReplacementGarment } from "@/hooks/useGarmentMutations";
import { getGarmentById } from "@/api/garments";
import { ROOT_CAUSES, REDO_PRIORITIES } from "@/lib/root-causes";
import { cn } from "@/lib/utils";
import type { RootCause, RedoPriority, WorkshopGarment } from "@repo/database";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Discarded original garment to replace. */
  garmentId: string | null;
  /** Optional callback after a successful create (e.g. navigate). */
  onCreated?: (result: { garmentId: string; parked: boolean }) => void;
};

/**
 * Reject-Redo / final Needs-Redo replacement flow (CLAUDE.md §2.5/§4/§6).
 * The replacement's garment spec is cloned server-side by the RPC, so this
 * dialog only captures the two things the RPC needs: root cause (attribution,
 * required) and redo priority. The RPC owns fabric accounting and parks the
 * replacement when material is short or the cloth is customer-brought — that
 * outcome is surfaced back to the user on success.
 */
export function RedoDialog({ open, onClose, garmentId, onCreated }: Props) {
  const { user } = useAuth();
  const createMut = useCreateReplacementGarment();

  const originalQuery = useQuery({
    queryKey: ["garment", garmentId],
    queryFn: () => getGarmentById(garmentId!),
    enabled: open && !!garmentId,
  });
  const original = (originalQuery.data ?? null) as WorkshopGarment | null;

  const [rootCause, setRootCause] = useState<RootCause | "">("");
  const [priority, setPriority] = useState<RedoPriority>("next_slot");

  // Reset the form on close (event-handler reset, not an effect) so a re-open
  // starts clean. The idempotency key is generated per submission attempt below.
  const handleClose = () => {
    setRootCause("");
    setPriority("next_slot");
    onClose();
  };

  const isOutFabric = original?.fabric_source === "OUT";
  const fabricSummary = useMemo(() => {
    if (!original) return null;
    if (isOutFabric) return `Customer cloth · ${original.shop_name || "—"}`;
    const len = original.fabric_length != null ? ` · ${original.fabric_length} m` : "";
    return `Shop fabric #${original.fabric_id ?? "—"}${len}`;
  }, [original, isOutFabric]);

  const alreadyReplaced = !!original?.replaced_by_garment_id;
  const loadError = originalQuery.isError;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!garmentId || !rootCause) {
      toast.error("Choose a root cause for this redo");
      return;
    }
    createMut.mutate(
      {
        replacesGarmentId: garmentId,
        rootCause,
        redoPriority: priority,
        userId: user?.id ?? null,
        // Fresh key per submission attempt; withWriteRetry reuses it across the
        // transient-retry tail so a lost response yields exactly one replacement.
        idempotencyKey: crypto.randomUUID(),
      },
      {
        onSuccess: (result) => {
          if (result.parked) {
            const why =
              result.parked_reason === "customer_decision"
                ? "Customer-brought fabric — customer must provide the cloth. Replacement parked for a manager decision."
                : "Replacement fabric short — replacement parked. Restock, then resume it from the scheduler.";
            toast.warning(`Replacement ${result.garment_id} created (parked)`, { description: why });
          } else {
            toast.success(`Replacement ${result.garment_id} created`, {
              description:
                priority === "immediate"
                  ? "Pinned to the top of the scheduler."
                  : "Ready to schedule in the scheduler.",
            });
          }
          onCreated?.({ garmentId: result.garment_id, parked: result.parked });
          handleClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Failed to create replacement");
        },
      },
    );
  }

  const busy = createMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) handleClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base min-w-0">
            <Replace className="h-4 w-4 shrink-0 text-[var(--status-bad)]" aria-hidden="true" />
            <span className="truncate">
              Create replacement{original?.garment_id ? ` — replaces ${original.garment_id}` : ""}
            </span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-5">
            {originalQuery.isLoading ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading original garment…
              </p>
            ) : loadError || !original ? (
              <StatusBanner tone="bad">Could not load the original garment.</StatusBanner>
            ) : alreadyReplaced ? (
              <StatusBanner tone="warn">
                This garment already has a replacement — cannot create another.
              </StatusBanner>
            ) : (
              <>
                {fabricSummary && (
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Inherits spec · </span>
                    <span className="text-foreground">{fabricSummary}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label className="text-sm font-medium">Root cause</Label>
                    <span className="text-xs text-muted-foreground">Required</span>
                  </div>
                  <Select value={rootCause} onValueChange={(v) => setRootCause(v as RootCause)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Why did this happen?" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROOT_CAUSES.map((rc) => (
                        <SelectItem key={rc.value} value={rc.value}>{rc.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {rootCause && (
                    <p className="text-xs text-muted-foreground">
                      {ROOT_CAUSES.find((r) => r.value === rootCause)?.desc}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Priority</Label>
                  <div className="inline-flex rounded-md border bg-background p-0.5 w-full">
                    {REDO_PRIORITIES.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setPriority(p.value)}
                        className={cn(
                          "flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                          priority === p.value
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {REDO_PRIORITIES.find((p) => p.value === priority)?.desc}
                  </p>
                </div>

                {isOutFabric && (
                  <StatusBanner tone="info" icon={ParkingSquare}>
                    Customer-brought cloth — the replacement will park until the customer provides
                    fabric. Resume it from the scheduler once the cloth is in.
                  </StatusBanner>
                )}
              </>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || !original || alreadyReplaced || !rootCause}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />}
              {busy ? "Creating…" : "Create replacement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
