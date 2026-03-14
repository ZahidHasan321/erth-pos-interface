import { Badge } from "@/components/ui/badge";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
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
  at_shop:                "bg-emerald-200 text-emerald-900",
  accepted:               "bg-emerald-300 text-emerald-950",
  needs_repair:           "bg-red-200 text-red-900",
  needs_redo:             "bg-red-300 text-red-950",
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

export function AlterationBadge({ tripNumber }: { tripNumber: number | null | undefined }) {
  if (!tripNumber || tripNumber <= 1) return null;
  return (
    <Badge
      variant="outline"
      className="border-0 bg-orange-500 text-white font-semibold text-[10px] uppercase tracking-wide"
    >
      Alt #{tripNumber}
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
