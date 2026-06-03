import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert, Loader2, RotateCcw, ShieldX, ChevronRight } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Label } from "@repo/ui/label";
import { Textarea } from "@repo/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@repo/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@repo/ui/select";
import { SectionCard } from "@/components/shared/PageShell";
import { useAuth } from "@/context/auth";
import { isAdmin, isManager } from "@/lib/rbac";
import { ROOT_CAUSES } from "@/lib/root-causes";
import {
  recordInvestigation, qualityReturns, alterationReturns,
  type InvestigationGarment, type InvestigationDecision,
} from "@/api/investigations";
import { cn } from "@/lib/utils";

const DECISIONS: { value: InvestigationDecision; label: string; desc: string }[] = [
  { value: "continue", label: "Continue", desc: "Resolve and resume this garment's production now." },
  { value: "redo", label: "Redo", desc: "Release the hold; create the replacement from the garment's redo action (§2.5)." },
  { value: "refund", label: "Refund", desc: "Release the hold; take the refund through the cashier (§2.6)." },
];

// ── Review dialog ────────────────────────────────────────────────────

function ReviewDialog({
  garment, onClose,
}: {
  garment: InvestigationGarment | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [rootCause, setRootCause] = useState<string>("");
  const [decision, setDecision] = useState<InvestigationDecision>("continue");
  const [historyNote, setHistoryNote] = useState("");
  const [shortAction, setShortAction] = useState("");
  const [longAction, setLongAction] = useState("");

  const reset = () => {
    setRootCause(""); setDecision("continue");
    setHistoryNote(""); setShortAction(""); setLongAction("");
  };
  const handleClose = () => { reset(); onClose(); };

  const mut = useMutation({
    mutationFn: () =>
      recordInvestigation({
        garmentId: garment!.id,
        rootCause,
        decision,
        historyNote: historyNote.trim() || undefined,
        correctiveShort: shortAction.trim() || undefined,
        correctiveLong: longAction.trim() || undefined,
        userId: user?.id ?? null,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (res) => {
      toast.success(
        res.resumed ? "Investigation recorded — production resumed" : "Investigation recorded",
        {
          description: decision === "redo"
            ? "Hold released. Create the replacement from the garment's redo action."
            : decision === "refund"
            ? "Hold released. Take the refund through the cashier."
            : undefined,
        },
      );
      qc.invalidateQueries(); // resumed garment re-enters the scheduler/assigned views
      handleClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to record investigation"),
  });

  const busy = mut.isPending;
  const q = garment ? qualityReturns(garment) : 0;
  const alt = garment ? alterationReturns(garment) : 0;

  return (
    <Dialog open={!!garment} onOpenChange={(o) => { if (!o && !busy) handleClose(); }}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base min-w-0">
            <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--status-warn)]" aria-hidden="true" />
            <span className="truncate">
              Investigate {garment?.garment_id ?? garment?.id?.slice(0, 8)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); if (rootCause) mut.mutate(); }}>
          <div className="px-6 py-5 space-y-5">
            {/* Return history summary */}
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
                <ShieldX className="w-3.5 h-3.5 text-[var(--status-bad)]" />
                {q} quality return{q === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
                <RotateCcw className="w-3.5 h-3.5 text-[var(--status-warn)]" />
                {alt} alteration return{alt === 1 ? "" : "s"}
              </span>
              <span className="text-muted-foreground">· {q + alt} total</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label className="text-sm font-medium">Root cause</Label>
                <span className="text-xs text-muted-foreground">Required</span>
              </div>
              <Select value={rootCause} onValueChange={setRootCause}>
                <SelectTrigger><SelectValue placeholder="Why did this keep happening?" /></SelectTrigger>
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
              <Label className="text-sm font-medium">Decision</Label>
              <div className="inline-flex rounded-md border bg-background p-0.5 w-full">
                {DECISIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDecision(d.value)}
                    className={cn(
                      "flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      decision === d.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{DECISIONS.find((d) => d.value === decision)?.desc}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">History comparison</Label>
              <Textarea
                value={historyNote}
                onChange={(e) => setHistoryNote(e.target.value)}
                placeholder="QC / return history vs the actual reason for return…"
                rows={2}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Short-term action</Label>
                <Textarea value={shortAction} onChange={(e) => setShortAction(e.target.value)} placeholder="Immediate correction" rows={2} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Long-term action</Label>
                <Textarea value={longAction} onChange={(e) => setLongAction(e.target.value)} placeholder="Preventive action" rows={2} />
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || !rootCause}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />}
              {busy ? "Recording…" : decision === "continue" ? "Resolve & resume" : "Resolve"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Section ──────────────────────────────────────────────────────────

/**
 * Decisions-hub section: garments auto-held after repeated returns
 * (CLAUDE.md §2.10). A manager opens the review dialog to record the
 * investigation and release the hold; non-managers see the held rows read-only.
 */
export function InvestigationsSection({ garments }: { garments: InvestigationGarment[] }) {
  const { user } = useAuth();
  const canResolve = isManager(user) || isAdmin(user);
  const [active, setActive] = useState<InvestigationGarment | null>(null);

  return (
    <SectionCard title={`Needs investigation (${garments.length})`}>
      <div className="divide-y divide-border -mx-2">
        {garments.map((g) => {
          const q = qualityReturns(g);
          const alt = alterationReturns(g);
          const inv = g.order?.workOrder?.invoice_number;
          const customer = g.order?.customer?.name;
          return (
            <div
              key={g.id}
              className={cn(
                "flex items-center gap-3 px-2 py-3",
                canResolve && "cursor-pointer hover:bg-muted/30 rounded-md transition-colors",
              )}
              onClick={() => canResolve && setActive(g)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-base font-medium">
                  <span className="truncate">{g.garment_id ?? g.id.slice(0, 8)}</span>
                  {g.garment_type && (
                    <span className="text-xs text-muted-foreground capitalize">{g.garment_type}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {inv ? `${inv} · ` : ""}{customer ?? `Order ${g.order_id}`}
                  {g.piece_stage ? ` · held at ${g.piece_stage.replace(/_/g, " ")}` : ""}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                  <ShieldX className="w-3 h-3 text-[var(--status-bad)]" />{q}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                  <RotateCcw className="w-3 h-3 text-[var(--status-warn)]" />{alt}
                </span>
              </div>

              {canResolve ? (
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setActive(g); }}>
                  Review <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground w-16 text-right">held</span>
              )}
            </div>
          );
        })}
      </div>

      {canResolve && <ReviewDialog garment={active} onClose={() => setActive(null)} />}
    </SectionCard>
  );
}
