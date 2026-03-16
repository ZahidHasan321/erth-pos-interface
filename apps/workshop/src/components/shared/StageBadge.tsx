import { Badge } from "@/components/ui/badge";
import { PIECE_STAGE_LABELS, FEEDBACK_STATUS_LABELS, FEEDBACK_STATUS_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { PieceStage } from "@repo/database";

const STAGE_COLOR: Record<string, string> = {
  waiting_for_acceptance: "bg-zinc-200 text-zinc-800",
  waiting_cut:            "bg-zinc-200 text-zinc-800",
  soaking:                "bg-sky-200 text-sky-900",
  cutting:                "bg-amber-200 text-amber-900",
  post_cutting:           "bg-amber-300 text-amber-950",
  sewing:                 "bg-orange-200 text-orange-900",
  finishing:              "bg-violet-200 text-violet-900",
  ironing:                "bg-rose-200 text-rose-900",
  quality_check:          "bg-yellow-200 text-yellow-900",
  ready_for_dispatch:     "bg-emerald-200 text-emerald-900",
  awaiting_trial:         "bg-blue-200 text-blue-900",
  ready_for_pickup:       "bg-emerald-200 text-emerald-900",
  brova_trialed:          "bg-purple-200 text-purple-900",
  completed:              "bg-slate-200 text-slate-800",
};

interface StageBadgeProps {
  stage: PieceStage | string | null | undefined;
  className?: string;
}

export function StageBadge({ stage, className }: StageBadgeProps) {
  if (!stage) return null;
  const color = STAGE_COLOR[stage] ?? "bg-zinc-200 text-zinc-800";
  const label = PIECE_STAGE_LABELS[stage as keyof typeof PIECE_STAGE_LABELS] ?? stage;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-0 font-semibold text-[10px] uppercase tracking-wide",
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
        "border-0 font-semibold text-[10px] uppercase tracking-wide",
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
      className="border-0 bg-orange-500 text-white font-semibold text-[10px] uppercase tracking-wide"
    >
      Alt {altNum}
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
        "border-0 font-semibold text-[10px] uppercase tracking-wide",
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
      className="border-0 bg-orange-600 text-white font-bold text-[10px] uppercase tracking-wide animate-pulse"
    >
      Alteration (In)
    </Badge>
  );
}

export function ExpressBadge() {
  return (
    <Badge
      variant="outline"
      className="border-0 bg-red-600 text-white font-bold text-[10px] uppercase tracking-wide"
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
        "border-0 font-bold text-[10px] uppercase tracking-wide",
        colorMap[brand] ?? "bg-zinc-600 text-white",
      )}
    >
      {brand}
    </Badge>
  );
}
