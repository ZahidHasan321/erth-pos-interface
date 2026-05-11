import { Badge } from "@repo/ui/badge";
import {
  PIECE_STAGE_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_COLORS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { PieceStage, TripHistoryEntry } from "@repo/database";

// Map every piece_stage to one of four semantic buckets — color = meaning,
// not a per-stage rainbow. Stage NAME still differentiates (the label text);
// color only differentiates between "queued / in progress / needs action / done".
const STAGE_COLOR: Record<string, string> = {
  // queued / parked / captured-state — neutral
  waiting_for_acceptance: "bg-muted text-foreground",
  waiting_cut:            "bg-muted text-foreground",
  brova_trialed:          "bg-muted text-foreground",
  // in production — info
  soaking:      "bg-[var(--status-info-bg)] text-[var(--status-info)]",
  cutting:      "bg-[var(--status-info-bg)] text-[var(--status-info)]",
  post_cutting: "bg-[var(--status-info-bg)] text-[var(--status-info)]",
  sewing:       "bg-[var(--status-info-bg)] text-[var(--status-info)]",
  finishing:    "bg-[var(--status-info-bg)] text-[var(--status-info)]",
  ironing:      "bg-[var(--status-info-bg)] text-[var(--status-info)]",
  // needs decision / customer action — warn
  quality_check:  "bg-[var(--status-warn-bg)] text-[var(--status-warn)]",
  awaiting_trial: "bg-[var(--status-warn-bg)] text-[var(--status-warn)]",
  // done / ready — ok
  ready_for_dispatch: "bg-[var(--status-ok-bg)] text-[var(--status-ok)]",
  ready_for_pickup:   "bg-[var(--status-ok-bg)] text-[var(--status-ok)]",
  completed:          "bg-[var(--status-ok-bg)] text-[var(--status-ok)]",
};

interface StageBadgeProps {
  stage: PieceStage | string | null | undefined;
  garmentType?: string | null;
  inProduction?: boolean;
  location?: string | null;
  finalApprovalState?: "pending" | "approved";
  className?: string;
}

export function StageBadge({
  stage,
  garmentType,
  inProduction,
  location,
  finalApprovalState,
  className,
}: StageBadgeProps) {
  if (!stage) return null;

  // Location overrides — the physical movement is more meaningful than the last stage
  if (location === "transit_to_workshop") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "border-transparent font-medium text-xs bg-[var(--status-info-bg)] text-[var(--status-info)]",
          className,
        )}
      >
        In Transit
      </Badge>
    );
  }
  if (location === "transit_to_shop") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "border-transparent font-medium text-xs bg-[var(--status-ok-bg)] text-[var(--status-ok)]",
          className,
        )}
      >
        Dispatched
      </Badge>
    );
  }

  // Finals have context-specific labels that don't map to raw stage names
  if (garmentType === "final") {
    if (stage === "waiting_for_acceptance") {
      if (finalApprovalState === "approved") {
        return (
          <Badge
            variant="outline"
            className={cn(
              "border-transparent font-medium text-xs bg-[var(--status-ok-bg)] text-[var(--status-ok)]",
              className,
            )}
          >
            Customer Approved
          </Badge>
        );
      }
      return (
        <Badge
          variant="outline"
          className={cn(
            "border-transparent font-medium text-xs bg-[var(--status-warn-bg)] text-[var(--status-warn)]",
            className,
          )}
        >
          Waiting Approval
        </Badge>
      );
    }
    if (stage === "waiting_cut" && !inProduction) {
      return (
        <Badge
          variant="outline"
          className={cn(
            "border-transparent font-medium text-xs bg-[var(--status-ok-bg)] text-[var(--status-ok)]",
            className,
          )}
        >
          Shop Approved
        </Badge>
      );
    }
  }

  const color = STAGE_COLOR[stage] ?? "bg-zinc-200 text-zinc-800";
  const label =
    PIECE_STAGE_LABELS[stage as keyof typeof PIECE_STAGE_LABELS] ?? stage;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-medium text-xs",
        color,
        className,
      )}
    >
      {label}
    </Badge>
  );
}

export function FeedbackStatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  if (!status) return null;
  const color =
    FEEDBACK_STATUS_COLORS[status as keyof typeof FEEDBACK_STATUS_COLORS] ??
    "bg-muted text-foreground";
  const label =
    FEEDBACK_STATUS_LABELS[status as keyof typeof FEEDBACK_STATUS_LABELS] ??
    status;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-medium text-xs",
        color,
        className,
      )}
    >
      {label}
    </Badge>
  );
}

export function AlterationBadge({
  tripNumber,
}: {
  tripNumber: number | null | undefined;
  garmentType?: string | null;
}) {
  const trip = tripNumber ?? 1;
  // Unified rule: any return (trip >= 2) is an alteration. alt# = trip - 1.
  if (trip < 2) return null;
  return (
    <Badge
      variant="outline"
      className="border-transparent bg-[var(--status-warn-bg)] text-[var(--status-warn)] font-medium text-xs"
    >
      Alt {trip - 1}
    </Badge>
  );
}

/** Shows "QC Fix" when the garment was sent back from quality check (same trip). */
export function QcFixBadge({
  tripNumber,
  tripHistory,
}: {
  tripNumber: number | null | undefined;
  tripHistory: TripHistoryEntry[] | null | undefined;
}) {
  if (!tripHistory) return null;
  const currentTrip = tripNumber ?? 1;
  const entry = tripHistory.find((t) => t.trip === currentTrip);
  if (!entry?.qc_attempts?.some((a) => a.result === "fail")) return null;
  return (
    <Badge
      variant="outline"
      className="border-transparent bg-[var(--status-bad-bg)] text-[var(--status-bad)] font-medium text-xs"
    >
      QC Fix
    </Badge>
  );
}

/** Shows which trial cycle the garment is on (e.g. "Trial 1", "Trial 2") */
export function TrialBadge({
  tripNumber,
}: {
  tripNumber: number | null | undefined;
}) {
  const trip = tripNumber ?? 1;
  // Trial 1 = neutral; subsequent trials escalate (warn → bad) because each
  // re-trial signals a customer fitting issue.
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-medium text-xs",
        trip === 1
          ? "bg-muted text-foreground"
          : trip === 2
            ? "bg-[var(--status-warn-bg)] text-[var(--status-warn)]"
            : "bg-[var(--status-bad-bg)] text-[var(--status-bad)]",
      )}
    >
      Trial {trip}
    </Badge>
  );
}

/** Badge for alteration garments — any trip >= 2 (except discarded). alt# = trip - 1. */
export function AlterationInBadge({
  tripNumber,
}: {
  tripNumber?: number | null | undefined;
} = {}) {
  const trip = tripNumber ?? 1;
  if (trip < 2) return null;
  return (
    <Badge
      variant="outline"
      className="border-transparent bg-[var(--status-warn-bg)] text-[var(--status-warn)] font-medium text-xs"
    >
      Alt {trip - 1} · in
    </Badge>
  );
}

export function ExpressBadge() {
  return (
    <Badge
      variant="outline"
      className="border-transparent bg-[var(--status-bad-bg)] text-[var(--status-bad)] font-medium text-xs"
    >
      Express
    </Badge>
  );
}

export function BrandBadge({ brand }: { brand: string | null | undefined }) {
  if (!brand) return null;
  // Dark, saturated brand tones — identity stays, but the value is the
  // dark shade (premium feel) not the bright -600 (sticker feel).
  const colorMap: Record<string, string> = {
    ERTH:   "bg-emerald-900 text-emerald-50",
    SAKKBA: "bg-blue-900 text-blue-50",
    QASS:   "bg-zinc-800 text-zinc-50",
  };
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-medium text-xs px-1.5 py-0",
        colorMap[brand] ?? "bg-zinc-800 text-zinc-50",
      )}
    >
      {brand}
    </Badge>
  );
}
