import { Badge } from "@repo/ui/badge";
import { PIECE_STAGE_LABELS, FEEDBACK_STATUS_LABELS, FEEDBACK_STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { PieceStage, TripHistoryEntry } from "@repo/database";

const STAGE_COLOR: Record<string, string> = {
  waiting_for_acceptance: "bg-zinc-100 text-zinc-700",
  waiting_cut:            "bg-zinc-100 text-zinc-700",
  soaking:                "bg-sky-100 text-sky-800",
  cutting:                "bg-amber-100 text-amber-800",
  post_cutting:           "bg-orange-100 text-orange-800",
  sewing:                 "bg-purple-100 text-purple-800",
  finishing:              "bg-emerald-100 text-emerald-800",
  ironing:                "bg-rose-100 text-rose-800",
  quality_check:          "bg-indigo-100 text-indigo-800",
  ready_for_dispatch:     "bg-green-100 text-green-800",
  awaiting_trial:         "bg-blue-100 text-blue-800",
  ready_for_pickup:       "bg-green-100 text-green-800",
  brova_trialed:          "bg-violet-100 text-violet-800",
  completed:              "bg-slate-100 text-slate-700",
};

interface StageBadgeProps {
  stage: PieceStage | string | null | undefined;
  garmentType?: string | null;
  inProduction?: boolean;
  location?: string | null;
  className?: string;
}

export function StageBadge({ stage, garmentType, inProduction, location, className }: StageBadgeProps) {
  if (!stage) return null;

  // Location overrides — the physical movement is more meaningful than the last stage
  if (location === "transit_to_workshop") {
    return (
      <Badge variant="outline" className={cn("border-0 font-semibold text-xs uppercase tracking-wide bg-sky-100 text-sky-800", className)}>
        In Transit
      </Badge>
    );
  }
  if (location === "transit_to_shop") {
    return (
      <Badge variant="outline" className={cn("border-0 font-semibold text-xs uppercase tracking-wide bg-teal-100 text-teal-800", className)}>
        Dispatched
      </Badge>
    );
  }

  // Finals have context-specific labels that don't map to raw stage names
  if (garmentType === "final") {
    if (stage === "waiting_for_acceptance") {
      return (
        <Badge variant="outline" className={cn("border-0 font-semibold text-xs uppercase tracking-wide bg-amber-100 text-amber-800", className)}>
          Waiting Approval
        </Badge>
      );
    }
    if (stage === "waiting_cut" && !inProduction) {
      return (
        <Badge variant="outline" className={cn("border-0 font-semibold text-xs uppercase tracking-wide bg-green-100 text-green-800", className)}>
          Shop Approved
        </Badge>
      );
    }
  }

  const color = STAGE_COLOR[stage] ?? "bg-zinc-200 text-zinc-800";
  const label = PIECE_STAGE_LABELS[stage as keyof typeof PIECE_STAGE_LABELS] ?? stage;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-0 font-semibold text-xs uppercase tracking-wide",
        color,
        className,
      )}
    >
      {label}
    </Badge>
  );
}

export function FeedbackStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return null;
  const color = FEEDBACK_STATUS_COLORS[status as keyof typeof FEEDBACK_STATUS_COLORS] ?? "bg-zinc-200 text-zinc-800";
  const label = FEEDBACK_STATUS_LABELS[status as keyof typeof FEEDBACK_STATUS_LABELS] ?? status;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-0 font-semibold text-xs uppercase tracking-wide",
        color,
        className,
      )}
    >
      {label}
    </Badge>
  );
}

export function AlterationBadge({ tripNumber, garmentType }: { tripNumber: number | null | undefined; garmentType?: string | null }) {
  const trip = tripNumber ?? 1;
  // Brova: alteration starts at trip 4, Final: alteration starts at trip 2
  const altNum = garmentType === "final" && trip >= 2
    ? trip - 1
    : trip >= 4
      ? trip - 3
      : null;
  if (altNum === null) return null;
  return (
    <Badge
      variant="outline"
      className="border-0 bg-orange-500 text-white font-semibold text-xs uppercase tracking-wide"
    >
      Alt {altNum}
    </Badge>
  );
}

/** Shows "QC Fix" when the garment was sent back from quality check (same trip). */
export function QcFixBadge({ tripNumber, tripHistory }: { tripNumber: number | null | undefined; tripHistory: TripHistoryEntry[] | null | undefined }) {
  if (!tripHistory) return null;
  const currentTrip = tripNumber ?? 1;
  const entry = tripHistory.find((t) => t.trip === currentTrip);
  if (!entry?.qc_attempts?.some((a) => a.result === "fail")) return null;
  return (
    <Badge
      variant="outline"
      className="border-0 bg-red-600 text-white font-bold text-xs uppercase tracking-wide"
    >
      QC Fix
    </Badge>
  );
}

/** Shows "Return" for brova trip 2-3 (brova return, not yet alteration threshold). */
export function BrovaReturnBadge({ tripNumber, garmentType }: { tripNumber: number | null | undefined; garmentType?: string | null }) {
  const trip = tripNumber ?? 1;
  if (garmentType !== "brova" || trip < 2 || trip > 3) return null;
  return (
    <Badge
      variant="outline"
      className="border-0 bg-amber-600 text-white font-bold text-xs uppercase tracking-wide"
    >
      Return {trip - 1}
    </Badge>
  );
}

/** Shows which trial cycle the garment is on (e.g. "Trial 1", "Trial 2") */
export function TrialBadge({ tripNumber }: { tripNumber: number | null | undefined }) {
  const trip = tripNumber ?? 1;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-0 font-semibold text-xs uppercase tracking-wide",
        trip === 1
          ? "bg-purple-100 text-purple-800"
          : trip === 2
            ? "bg-amber-100 text-amber-800"
            : "bg-red-100 text-red-800",
      )}
    >
      Trial {trip}
    </Badge>
  );
}

/** Badge for garments at shop with needs_repair/needs_redo — incoming for alteration */
export function AlterationInBadge() {
  return (
    <Badge
      variant="outline"
      className="border-0 bg-orange-600 text-white font-bold text-xs uppercase tracking-wide ring-2 ring-orange-300 ring-offset-1"
    >
      Alteration (In)
    </Badge>
  );
}

export function ExpressBadge() {
  return (
    <Badge
      variant="outline"
      className="border-0 bg-red-600 text-white font-bold text-xs uppercase tracking-wide"
    >
      ⚡ Express
    </Badge>
  );
}

export function BrandBadge({ brand }: { brand: string | null | undefined }) {
  if (!brand) return null;
  const colorMap: Record<string, string> = {
    ERTH:   "bg-emerald-600 text-white",
    SAKKBA: "bg-blue-600 text-white",
    QASS:   "bg-violet-600 text-white",
  };
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-0 font-bold text-xs uppercase tracking-wide",
        colorMap[brand] ?? "bg-zinc-600 text-white",
      )}
    >
      {brand}
    </Badge>
  );
}
